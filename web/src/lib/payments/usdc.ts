// Paying in USDC from the buyer's own wallet, for shows abroad (tasks/founder-house-usdc.md).
//   1. Pay holds the seats the way a QRIS payment does (claim_listing, one open hold per buyer) and
//      hands back the two messages the wallet signs: an ERC-3009 authorisation on the token and the
//      escrow's purchase intent, both bound to an on-chain listing that does not exist yet.
//   2. Submit checks both signatures against the wallet that asked. Then the operator creates the
//      listing, funds it with those signatures and records the handover, paying the gas. Only then is
//      the hold paid and the order written.
//   3. A hold nobody signs runs out like a QRIS one (expire_payments), and its seats come back.
//   4. Money never stays in the escrow without an order: every failure after funding refunds it,
//      and a submit cut off half way (a timeout, a crash) is found later by reconcileUsdcHolds,
//      which reads the chain and refunds or cancels.
// Testnet only for now: Circle's test USDC on Arbitrum Sepolia.
// Listings for USDC shows carry no barcode commitment yet (selling there is closed): a refund
// after funding keeps a commitment used, so per-seat commitments come before selling opens.
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bytesToHex, formatUnits, getAddress, verifyTypedData, type Address, type Hex } from "viem";
import { tokenAbi } from "@/lib/chain/abi";
import { fundTypedData, type FundSignature } from "@/lib/chain/buyer";
import { USDC_DECIMALS } from "@/lib/chain/config";
import { publicClient } from "@/lib/chain/escrow";
import { cancelOnchainListing, chainError, onchainListingId, openOrder, operatorSetup, readListing, settle, type Operator } from "@/lib/chain/server";
import { DISPUTE_WINDOW_H } from "@/lib/mock/escrow";
import { checkPurchase, loadPurchase, orderInsert, priceOf, type ChainFields } from "@/lib/orders/create";
import { HELD } from "@/lib/orders/map";
import type { Database } from "@/lib/supabase/types";
import { cancelHold, expireHolds, orderIdOf, paymentView, type PaymentRow, type Result } from "./checkout";
import type { PaymentView } from "./types";
import { xenditConfig } from "./xendit";

if (typeof window !== "undefined") throw new Error("lib/payments/usdc hanya boleh dipakai di server");

type Admin = SupabaseClient<Database>;

/** A USDC hold lasts this long: enough to connect a wallet and sign twice. */
export const USDC_HOLD_MINUTES = 10;
/** The signatures stay valid this long after the hold, so a submit near its end still lands on chain. */
const SIGNATURE_GRACE_SECONDS = 300;
/** Open USDC orders one wallet may have at a time (the guards in the plan). Only the wallet can make them. */
export const WALLET_OPEN_LIMIT = 3;
/** Submits that cost the operator a transaction and failed, per account per hour, before new holds stop. */
const FAILED_SUBMITS_PER_HOUR = 3;
/** A submit that has held its lock this long without finishing was cut off; reconcileUsdcHolds takes it. */
const STALE_SUBMIT_MS = 3 * 60_000;
/** New holds one buyer may open in HOLD_RATE_MINUTES, as for QRIS. */
const HOLDS_PER_WINDOW = 20;
const HOLD_RATE_MINUTES = 10;
const ARBITRUM_ONE = 42161;
const H = 3_600_000;

const fail = (status: number, error: string) => ({ ok: false, status, error }) as const;
const iso = (ms: number) => new Date(ms).toISOString();
const usdc = (micro: bigint | number) => `${formatUnits(BigInt(micro), USDC_DECIMALS)} USDC`;
const seatsChanged = () => revalidateTag("catalogue", { expire: 0 });
/** Bigints as decimal strings, the way a wallet's eth_signTypedData_v4 and JSON both take them. */
const plain = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
const validBeforeOf = (expiresAt: string) => BigInt(Math.floor(Date.parse(expiresAt) / 1000) + SIGNATURE_GRACE_SECONDS);

/** The operator, when the USDC rail is on here: its keys set, and LUMMY_USDC_RAIL not "off". */
export function usdcRail(): Operator | null {
  if (process.env.LUMMY_USDC_RAIL?.trim().toLowerCase() === "off") return null;
  return operatorSetup();
}

/** What the checkout page needs to have the wallet sign: the hold and both messages. */
export type UsdcStart = {
  payment: PaymentView;
  wallet: Address;
  /** Micro-USDC, as a decimal string. */
  value: string;
  chainId: number;
  token: Address;
  escrow: Address;
  auth: unknown;
  fund: unknown;
};

async function closeHold(admin: Admin, id: string, status: "canceled" | "failed") {
  const { data, error } = await admin.rpc("close_payment", { p_id: id, p_status: status });
  if (error) throw new Error(error.message);
  if (data) seatsChanged();
}

/**
 * The buyer gives up a USDC hold before signing, and the seats go back. One already sent to the chain
 * (checked_at is set when a submit takes it) is left to finish.
 */
export async function cancelUsdcHold(admin: Admin, row: PaymentRow): Promise<PaymentRow> {
  if (row.status !== "pending" || row.checked_at) return row;
  await closeHold(admin, row.id, "canceled");
  const { data } = await admin.from("payments").select("*").eq("id", row.id).single();
  return data ?? row;
}

/** Money already in the escrow for one hold goes back to the wallet. True when it did. */
async function refundOnChain(op: Operator, onchainId: Hex) {
  const live = await readListing(op, onchainId).catch(() => null);
  if (live?.status !== "Funded" && live?.status !== "DisputeWindow") return false;
  await settle(op, onchainId, "refund");
  return true;
}

/** A paid hold whose order could not be written: refunded on chain, its seats back on sale. */
async function undoPaid(admin: Admin, op: Operator, row: PaymentRow) {
  const refunded = await refundOnChain(op, row.onchain_listing_id as Hex).catch((e) => {
    console.error("[usdc] could not refund on chain:", row.id, chainError(e));
    return false;
  });
  if (!refunded) return false;
  const at = new Date().toISOString();
  await admin.rpc("release_listing", { p_listing_id: row.listing_id, p_quantity: row.quantity });
  await admin.from("payments").update({ status: "refunded", refunded_at: at, refund_note: "refunded on chain: the order could not be written", updated_at: at }).eq("id", row.id);
  seatsChanged();
  return true;
}

/**
 * Submits cut off half way: a lock older than STALE_SUBMIT_MS on a hold that is still open or has
 * since expired, with no order. The chain says what happened: money in the escrow goes back, a
 * listing created but not funded is cancelled, and the hold is closed. Run by every new USDC
 * checkout and by the daily cron; returns how many it settled.
 */
export async function reconcileUsdcHolds(admin: Admin, op: Operator, limit = 5) {
  const { data, error } = await admin
    .from("payments")
    .select("*")
    .eq("provider", "escrow")
    .in("status", ["pending", "expired"])
    .not("checked_at", "is", null)
    .lt("checked_at", iso(Date.now() - STALE_SUBMIT_MS))
    .limit(limit);
  if (error) throw new Error(error.message);
  let settled = 0;
  for (const row of data ?? []) {
    if (await orderIdOf(admin, row.id)) continue;
    const id = row.onchain_listing_id as Hex;
    const live = await readListing(op, id).catch(() => null);
    if (!live) continue;
    const at = new Date().toISOString();
    if (live.status === "Funded" || live.status === "DisputeWindow") {
      const tx = (await settle(op, id, "refund")).tx;
      if (row.status === "pending") await closeHold(admin, row.id, "failed");
      await admin.from("payments").update({ status: "refunded", refunded_at: at, refund_note: `refunded on chain after a cut-off submit: ${tx}`, updated_at: at }).eq("id", row.id);
    } else {
      if (live.status === "Listed") await cancelOnchainListing(op, id);
      if (row.status === "pending") await closeHold(admin, row.id, "failed");
      else await admin.from("payments").update({ status: "failed", updated_at: at }).eq("id", row.id);
    }
    settled++;
  }
  return settled;
}

/** The two messages for one hold, rebuilt from what the hold stores, so they match what was signed. */
function typedOf(op: Operator, row: PaymentRow) {
  return fundTypedData({
    pc: publicClient(op.chain, op.rpcUrl),
    buyer: row.payer_wallet as Address,
    escrow: op.escrow,
    token: op.token,
    listingId: row.onchain_listing_id as Hex,
    value: BigInt(row.total),
    validBefore: validBeforeOf(row.expires_at),
    authNonce: row.auth_nonce as Hex,
  });
}

/** Pay in USDC: hold the seats and hand back what the wallet signs. */
export async function startUsdcCheckout(
  admin: Admin,
  op: Operator,
  buyerId: string,
  listingId: string,
  quantity: number,
  walletInput: string
): Promise<Result<UsdcStart>> {
  const wallet = getAddress(walletInput);
  await expireHolds(admin);
  await reconcileUsdcHolds(admin, op, 2).catch((e) => console.error("[usdc] reconcile:", (e as Error).message));

  const check = await checkPurchase(admin, buyerId, listingId);
  if (!check.ok) return check;
  if (check.purchase.event.currency !== "USDC") return fail(400, "acara ini dibayar dengan QRIS, bukan USDC");

  const open = await admin.from("payments").select("*").eq("buyer_id", buyerId).eq("status", "pending");
  if (open.error) return fail(500, open.error.message);
  // A hold already on its way to the chain is left to finish.
  if ((open.data ?? []).some((r) => r.provider === "escrow" && r.checked_at)) {
    return fail(409, "pembayaran USDC sebelumnya sedang dikunci di escrow; tunggu sebentar");
  }

  // Holds are counted per account, not per wallet: anyone can type an address, so holds by other
  // accounts must not lock its owner out. Orders need the wallet's own signatures, so they count.
  const [orders, recent, failed] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }).eq("buyer_wallet", wallet).in("escrow_status", HELD),
    admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", buyerId)
      .gte("created_at", iso(Date.now() - HOLD_RATE_MINUTES * 60_000)),
    admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", buyerId)
      .eq("provider", "escrow")
      .in("status", ["failed", "refunded"])
      .gte("updated_at", iso(Date.now() - H)),
  ]);
  const counted = orders.error ?? recent.error ?? failed.error;
  if (counted) return fail(500, counted.message);
  if ((orders.count ?? 0) >= WALLET_OPEN_LIMIT) {
    return fail(429, `satu wallet paling banyak punya ${WALLET_OPEN_LIMIT} pesanan USDC yang berjalan`);
  }
  if ((recent.count ?? 0) >= HOLDS_PER_WINDOW) {
    return fail(429, `terlalu banyak percobaan bayar dalam ${HOLD_RATE_MINUTES} menit terakhir; coba lagi sebentar lagi`);
  }
  // Each failed submit cost the operator gas; a few in an hour and this account waits.
  if ((failed.count ?? 0) >= FAILED_SUBMITS_PER_HOUR) {
    return fail(429, "beberapa pembayaran USDC dari akun ini baru saja gagal; coba lagi dalam satu jam");
  }

  const price = priceOf(check.purchase.listing.ask_price, quantity, "USDC");
  const pc = publicClient(op.chain, op.rpcUrl);
  let balance: bigint;
  try {
    balance = await pc.readContract({ address: op.token, abi: tokenAbi, functionName: "balanceOf", args: [wallet] });
  } catch (e) {
    return fail(502, chainError(e));
  }
  if (balance < BigInt(price.total)) {
    return fail(402, `saldo USDC di wallet ini ${usdc(balance)}, butuh ${usdc(price.total)}`);
  }

  // One open hold per buyer: an older one, of either kind, gives its seats back first.
  const cfg = xenditConfig();
  for (const row of open.data ?? []) {
    if (row.provider === "escrow") await closeHold(admin, row.id, "canceled");
    else if (cfg) await cancelHold(admin, cfg, row);
    else return fail(409, "masih ada pembayaran lain yang berjalan; selesaikan atau batalkan dulu");
  }

  const claim = await admin.rpc("claim_listing", { p_listing_id: listingId, p_quantity: quantity });
  if (claim.error) return fail(500, claim.error.message);
  // Nothing claimed comes back as a row of nulls, not as null.
  if (!claim.data?.id) return fail(409, "tiketnya baru saja dibeli orang lain, atau jumlahnya tidak tersedia");
  const giveBack = () => admin.rpc("release_listing", { p_listing_id: listingId, p_quantity: quantity });

  // The hold's own id names its on-chain listing, so the wallet can sign before any transaction.
  const id = `pay-${bytesToHex(crypto.getRandomValues(new Uint8Array(6))).slice(2)}`;
  const expiresAt = iso(Math.ceil((Date.now() + USDC_HOLD_MINUTES * 60_000) / 1000) * 1000);
  let typed: Awaited<ReturnType<typeof fundTypedData>>;
  try {
    typed = await fundTypedData({
      pc,
      buyer: wallet,
      escrow: op.escrow,
      token: op.token,
      listingId: onchainListingId(id),
      value: BigInt(price.total),
      validBefore: validBeforeOf(expiresAt),
    });
  } catch (e) {
    await giveBack();
    return fail(502, chainError(e));
  }

  const inserted = await admin
    .from("payments")
    .insert({
      id,
      buyer_id: buyerId,
      listing_id: listingId,
      quantity,
      ...price,
      provider: "escrow",
      channel: "USDC",
      test_mode: op.chain.id !== ARBITRUM_ONE,
      expires_at: expiresAt,
      payer_wallet: wallet,
      onchain_listing_id: onchainListingId(id),
      auth_nonce: typed.authNonce,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) {
    await giveBack();
    if (inserted.error?.code === "23505") return fail(409, "masih ada pembayaran lain yang berjalan; selesaikan atau batalkan dulu");
    return fail(500, inserted.error?.message ?? "pembayaran gagal disimpan");
  }
  seatsChanged();
  return {
    ok: true,
    value: {
      payment: paymentView(inserted.data, null),
      wallet,
      value: String(price.total),
      chainId: op.chain.id,
      token: op.token,
      escrow: op.escrow,
      auth: plain(typed.auth),
      fund: plain(typed.fund),
    },
  };
}

/**
 * The wallet signed: check both signatures, lock the money on chain with them, then write the
 * order. Returns the order's id; asking again for a hold already paid returns the same order.
 */
export async function submitUsdcPayment(
  admin: Admin,
  op: Operator,
  buyerId: string,
  paymentId: string,
  authSig: Hex,
  fundSig: Hex
): Promise<Result<{ orderId: string }>> {
  const { data: row, error } = await admin.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (error) return fail(500, error.message);
  if (!row || row.buyer_id !== buyerId || row.provider !== "escrow") return fail(404, "pembayaran tidak ditemukan");
  if (row.status === "paid") {
    const orderId = await orderIdOf(admin, row.id);
    return orderId ? { ok: true, value: { orderId } } : fail(409, "pembayaran sudah lunas, pesanannya sedang ditulis");
  }
  if (row.status !== "pending") return fail(409, "pembayaran ini sudah ditutup; mulai lagi dari checkout");
  if (Date.parse(row.expires_at) <= Date.now()) return fail(409, "waktu pembayaran habis; mulai lagi dari checkout");
  if (!row.payer_wallet || !row.onchain_listing_id || !row.auth_nonce) return fail(500, "data pembayaran ini tidak lengkap");

  const wallet = row.payer_wallet as Address;
  let typed: Awaited<ReturnType<typeof fundTypedData>>;
  try {
    typed = await typedOf(op, row);
  } catch (e) {
    return fail(502, chainError(e));
  }
  const [authOk, fundOk] = await Promise.all([
    verifyTypedData({ address: wallet, ...typed.auth, signature: authSig }).catch(() => false),
    verifyTypedData({ address: wallet, ...typed.fund, signature: fundSig }).catch(() => false),
  ]);
  if (!authOk || !fundOk) return fail(400, "tanda tangannya bukan dari wallet yang memulai pembayaran ini");

  // Valid signatures over money that is gone would only cost the operator gas: a create, a fund that
  // reverts, a cancel. So the wallet still has to hold the amount, and the authorisation must be unused.
  const pc = publicClient(op.chain, op.rpcUrl);
  let balance: bigint;
  let nonceUsed = false;
  try {
    balance = await pc.readContract({ address: op.token, abi: tokenAbi, functionName: "balanceOf", args: [wallet] });
    nonceUsed = await pc
      .readContract({ address: op.token, abi: tokenAbi, functionName: "authorizationState", args: [wallet, row.auth_nonce as Hex] })
      .catch(() => false);
  } catch (e) {
    return fail(502, chainError(e));
  }
  if (balance < BigInt(row.total)) {
    return fail(402, `saldo USDC di wallet ini tinggal ${usdc(balance)}, butuh ${usdc(row.total)}`);
  }
  if (nonceUsed) {
    await closeHold(admin, row.id, "failed");
    return fail(409, "otorisasi USDC ini sudah dipakai atau dibatalkan di wallet; mulai lagi dari checkout");
  }

  // One submit at a time: the first to mark the hold carries it to the chain.
  const lock = await admin
    .from("payments")
    .update({ checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .is("checked_at", null)
    .select("id");
  if (lock.error) return fail(500, lock.error.message);
  if (!lock.data?.length) return fail(409, "pembayaran ini sedang dikirim ke chain; tunggu sebentar");

  const loaded = await loadPurchase(admin, row.listing_id);
  const purchase = loaded.ok ? loaded.purchase : null;
  if (!purchase || purchase.event.status === "cancelled") {
    await closeHold(admin, row.id, "failed");
    return loaded.ok ? fail(409, "listing atau acaranya sudah tidak ada") : loaded;
  }

  const sig: FundSignature = {
    from: wallet,
    value: typed.auth.message.value,
    validAfter: typed.validAfter,
    validBefore: typed.validBefore,
    authNonce: typed.authNonce,
    authSig,
    deadline: typed.deadline,
    fundSig,
  };
  const endsAtSec = Math.floor(purchase.scheduledEnd / 1000);
  /** Money already in escrow for an order that cannot be written goes straight back to the wallet. */
  const giveBack = () => refundOnChain(op, row.onchain_listing_id as Hex);

  let opened: Awaited<ReturnType<typeof openOrder>>;
  try {
    opened = await openOrder(op, endsAtSec, { barcodeKey: purchase.listing.barcode_hmac, sha256: purchase.listing.ticket_sha256 }, { tag: row.id, sig });
  } catch (e) {
    // A listing that could not be funded is cancelled by openOrder; one funded before a later step
    // failed is refunded here. Either way the seats go back.
    const refunded = await giveBack().catch((err) => {
      console.error("[usdc] could not refund on chain:", row.id, chainError(err));
      return false;
    });
    await closeHold(admin, row.id, "failed").catch(() => null);
    return fail(502, refunded ? `${chainError(e)}; USDC-nya sudah dikembalikan ke wallet` : chainError(e));
  }

  const marked = await admin.rpc("mark_payment_paid", { p_id: row.id, p_provider_payment_id: opened.txs.fund });
  if (marked.error) {
    console.error("[usdc] funded on chain but not marked paid:", row.id, opened.listingId, marked.error.message);
    const refunded = await giveBack().catch(() => false);
    // If the database is down as well, reconcileUsdcHolds closes the hold later.
    if (refunded) await closeHold(admin, row.id, "failed").catch(() => null);
    return fail(500, refunded ? "pembayarannya gagal dicatat; USDC-nya sudah dikembalikan ke wallet" : "pembayarannya gagal dicatat; USDC-nya akan dikembalikan otomatis");
  }
  // The hold closed while the chain was busy and its seats went to someone else.
  if (marked.data === "unfulfilled") {
    const refunded = await giveBack().catch(() => false);
    if (!refunded) console.error("[usdc] funded after its seats went back; refund it on chain:", row.id, opened.listingId);
    return fail(409, refunded ? "kursinya keburu lepas; USDC-nya sudah dikembalikan ke wallet" : "kursinya keburu lepas; hubungi tim Lummy untuk pengembalian USDC");
  }

  // The contract counts the window from the later of the handover and the show's end.
  const live = await readListing(op, opened.listingId as Hex).catch(() => null);
  const chain: ChainFields = {
    chain_id: op.chain.id,
    contract_address: op.escrow,
    onchain_listing_id: opened.listingId,
    onchain_price: opened.price,
    dispute_deadline: iso(live ? live.deadline * 1000 : Math.max(Date.now(), endsAtSec * 1000) + DISPUTE_WINDOW_H * H),
    tx_create: opened.txs.create,
    tx_fund: opened.txs.fund,
    tx_handover: opened.txs.handover,
  };
  const ins = await admin
    .from("orders")
    .insert(
      orderInsert(buyerId, purchase, row.quantity, {
        endsAt: purchase.scheduledEnd,
        chain,
        paymentId: row.id,
        price: { amount: Number(row.amount), fee: Number(row.fee), materai: Number(row.materai) },
        usdcWallet: wallet,
      })
    )
    .select("id")
    .single();
  if (ins.error || !ins.data) {
    if (ins.error?.code === "23505") {
      const orderId = await orderIdOf(admin, row.id);
      if (orderId) return { ok: true, value: { orderId } };
    }
    console.error("[usdc] escrow funded on chain but the order was not saved:", row.id, opened.listingId, ins.error?.message);
    const undone = await undoPaid(admin, op, row);
    return fail(500, undone ? "pesanannya gagal disimpan; USDC-nya sudah dikembalikan ke wallet" : "pesanannya gagal disimpan; hubungi tim Lummy untuk pengembalian USDC");
  }
  seatsChanged();
  return { ok: true, value: { orderId: ins.data.id } };
}
