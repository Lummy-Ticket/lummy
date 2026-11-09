// Paying from any chain and asset through NEAR Intents, for shows abroad (tasks/near-hackathon.md).
//   1. Pay holds the seats the way the other rails do (claim_listing, one open hold per buyer). The
//      order's terms give its receiver's address (LummyIntentReceiver), and 1Click quotes exactly the
//      price to arrive there, with an address on the buyer's chain to send the deposit to.
//   2. The checkout page asks for the status every few seconds. When the money has reached the
//      receiver, the operator creates the listing and locks the money in LummyEscrow, and the order is
//      written. The chain decides that the money is there, not 1Click's answer.
//   3. Money that arrives when no order can be made is not lost and not ours: the receiver sends it to
//      the buyer's refund address. settleIntentLeftovers does that from the daily cron, and anyone can
//      do it without Lummy once the order's deadline has passed.
// Real money on Arbitrum One, so only the team pays here (lib/near/team.ts), under the contract's price
// cap. The buyer of record on chain is the receiver, and refunds pass through it (lib/chain/server.ts).
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bytesToHex, formatUnits, getAddress, type Address, type Hex } from "viem";
import { escrowAbi, tokenAbi } from "@/lib/chain/abi";
import { USDC_DECIMALS } from "@/lib/chain/config";
import { intentReceiverOf, publicClient, type IntentOrder } from "@/lib/chain/escrow";
import { INTENTS } from "@/lib/chain/deployments";
import { ARBITRUM_ONE, chainError, intentsOperator, onchainListingId, openIntentOrder, readListing, settle, sweepIntentReceiver, type Operator } from "@/lib/chain/server";
import { notifyOrderPaid } from "@/lib/email/notify";
import { DISPUTE_WINDOW_H } from "@/lib/mock/escrow";
import { OneClickError, payOptions, readSwapStatus, requestQuote, swapExplorerUrl, type SwapStatus } from "@/lib/near/oneclick";
import { checkPurchase, loadPurchase, orderInsert, priceOf, type ChainFields } from "@/lib/orders/create";
import { paidListingAllowed } from "@/lib/orders/unpaid";
import type { Database, Json } from "@/lib/supabase/types";
import { cancelHold, expireHolds, orderIdOf, paymentView, type PaymentRow, type Result } from "./checkout";
import type { IntentStart, IntentView } from "./types";
import { xenditConfig } from "./xendit";

if (typeof window !== "undefined") throw new Error("lib/payments/intents hanya boleh dipakai di server");

type Admin = SupabaseClient<Database>;

/** Long enough for a Bitcoin deposit (about 13 minutes). */
export const INTENT_HOLD_MINUTES = 30;
/** A payment landing this long after its hold can still become the order, if the seats are free. */
const REFUND_AFTER_HOLD_SECONDS = 30 * 60;
/** Not worth starting a transaction this close to the moment the receiver stops funding. */
const FUND_MARGIN_SECONDS = 120;
/** A hold locked this long without finishing was cut off, and the next read may carry it on. */
const STALE_LOCK_MS = 3 * 60_000;
const H = 3_600_000;

/** What a hold on this rail keeps, in payments.intent. */
export type IntentData = {
  originAsset: string;
  originChain: string;
  originSymbol: string;
  chainLabel: string;
  depositAddress: string;
  depositMemo: string | null;
  amountIn: string;
  amountInUsd: string | null;
  etaSeconds: number | null;
  /** On the chain paid from: where 1Click returns a deposit that is short, late or too large. */
  originRefund: string;
  /** The order's terms, which give the receiver's address. */
  receiver: string;
  refundTo: string;
  seller: string;
  eventEndsAt: number;
  refundAfter: number;
  swapStatus: SwapStatus;
  originTx: string | null;
  arrivalTx: string | null;
  txs: { create?: string; fund?: string; handover?: string };
  sweepTx?: string;
};

const fail = (status: number, error: string) => ({ ok: false, status, error }) as const;
const iso = (ms: number) => new Date(ms).toISOString();
const seatsChanged = () => revalidateTag("catalogue", { expire: 0 });
const intentOf = (row: PaymentRow) => row.intent as unknown as IntentData;
const usdc = (micro: bigint | number) => `${formatUnits(BigInt(micro), USDC_DECIMALS)} USDC`;

const orderOf = (row: PaymentRow, d: IntentData): IntentOrder => ({
  listingId: row.onchain_listing_id as Hex,
  seller: d.seller as Address,
  price: BigInt(row.total),
  eventEndsAt: d.eventEndsAt,
  refundTo: d.refundTo as Address,
  refundAfter: d.refundAfter,
});

export function intentView(row: PaymentRow, orderId: string | null): IntentView {
  const d = intentOf(row);
  return {
    payment: paymentView(row, orderId),
    deposit: {
      address: d.depositAddress,
      memo: d.depositMemo,
      amount: d.amountIn,
      usd: d.amountInUsd,
      symbol: d.originSymbol,
      chainLabel: d.chainLabel,
      etaSeconds: d.etaSeconds,
    },
    swapStatus: d.swapStatus,
    receiver: d.receiver,
    refundTo: d.refundTo,
    refundAfter: d.refundAfter,
    terms: {
      factory: intentsOperator()?.factory ?? INTENTS[ARBITRUM_ONE]?.factory ?? "",
      listingId: row.onchain_listing_id ?? "",
      seller: d.seller,
      price: String(row.total),
      eventEndsAt: d.eventEndsAt,
      refundTo: d.refundTo,
      refundAfter: d.refundAfter,
    },
    swapUrl: swapExplorerUrl(d.depositAddress),
    originTx: d.originTx,
    arrivalTx: d.arrivalTx,
  };
}

const closeHold = async (admin: Admin, id: string, status: "canceled" | "failed") => {
  const { data, error } = await admin.rpc("close_payment", { p_id: id, p_status: status });
  if (error) throw new Error(error.message);
  if (data) seatsChanged();
};

/** Hold the seats and get an address to pay. */
export async function startIntentCheckout(
  admin: Admin,
  op: Operator,
  buyerId: string,
  listingId: string,
  quantity: number,
  pay: { originAsset: string; refundTo: string; originRefund: string }
): Promise<Result<IntentStart>> {
  const refundTo = getAddress(pay.refundTo);
  await expireHolds(admin);

  const check = await checkPurchase(admin, buyerId, listingId);
  if (!check.ok) return check;
  if (check.purchase.event.currency !== "USDC") return fail(400, "acara ini dibayar dengan QRIS, bukan lewat NEAR Intents");
  // Real money buys a ticket someone holds, never a sample: a sample has no file to hand over
  // (authorization audit, 4 Nov 2026). The QRIS checkout refuses the same way.
  if (!paidListingAllowed(check.purchase.listing, false)) return fail(409, "listing contoh tidak dijual dengan uang sungguhan");

  const option = (await payOptions()).find((o) => o.assetId === pay.originAsset);
  if (!option) return fail(400, "aset ini tidak ditawarkan");

  const price = priceOf(check.purchase.listing.ask_price, quantity, "USDC");
  const pc = publicClient(op.chain, op.rpcUrl);
  const cap = await pc.readContract({ address: op.escrow, abi: escrowAbi, functionName: "priceCap" });
  if (BigInt(price.total) > cap) return fail(400, `demo ini dibatasi ${usdc(cap)} per pesanan; total pesanan ini ${usdc(price.total)}`);

  const open = await admin.from("payments").select("*").eq("buyer_id", buyerId).eq("status", "pending");
  if (open.error) return fail(500, open.error.message);
  if ((open.data ?? []).some((r) => r.provider === "escrow" && r.checked_at)) {
    return fail(409, "pembayaran sebelumnya sedang dikunci di escrow; tunggu sebentar");
  }
  // One open hold per buyer: an older one, of any kind, gives its seats back first.
  const cfg = xenditConfig();
  for (const row of open.data ?? []) {
    if (row.provider === "escrow") await closeHold(admin, row.id, "canceled");
    else if (cfg) await cancelHold(admin, cfg, row);
    else return fail(409, "masih ada pembayaran lain yang berjalan; selesaikan atau batalkan dulu");
  }

  const claim = await admin.rpc("claim_listing", { p_listing_id: listingId, p_quantity: quantity });
  if (claim.error) return fail(500, claim.error.message);
  if (!claim.data?.id) return fail(409, "tiketnya baru saja dibeli orang lain, atau jumlahnya tidak tersedia");
  const giveBack = () => admin.rpc("release_listing", { p_listing_id: listingId, p_quantity: quantity });

  const id = `pay-${bytesToHex(crypto.getRandomValues(new Uint8Array(6))).slice(2)}`;
  const expiresMs = Math.ceil((Date.now() + INTENT_HOLD_MINUTES * 60_000) / 1000) * 1000;
  const order: IntentOrder = {
    listingId: onchainListingId(id),
    seller: op.seller,
    price: BigInt(price.total),
    eventEndsAt: Math.floor(check.purchase.scheduledEnd / 1000),
    refundTo,
    refundAfter: Math.floor(expiresMs / 1000) + REFUND_AFTER_HOLD_SECONDS,
  };

  let data: IntentData;
  try {
    const receiver = await intentReceiverOf(pc, op.factory!, order);
    const quote = await requestQuote({
      dry: false,
      originAsset: option.assetId,
      chain: option.chain,
      amountOut: order.price,
      recipient: receiver,
      refundTo: pay.originRefund,
      deadline: iso(expiresMs),
    });
    if (!quote.depositAddress) throw new OneClickError("1Click gave no address to pay", 502);
    data = {
      originAsset: option.assetId,
      originChain: option.chain,
      originSymbol: option.symbol,
      chainLabel: option.chainLabel,
      depositAddress: quote.depositAddress,
      depositMemo: quote.depositMemo ?? null,
      amountIn: quote.amountInFormatted,
      amountInUsd: quote.amountInUsd ?? null,
      etaSeconds: quote.timeEstimate ?? null,
      originRefund: pay.originRefund,
      receiver,
      refundTo,
      seller: order.seller,
      eventEndsAt: order.eventEndsAt,
      refundAfter: order.refundAfter,
      swapStatus: "PENDING_DEPOSIT",
      originTx: null,
      arrivalTx: null,
      txs: {},
    };
  } catch (e) {
    await giveBack();
    return e instanceof OneClickError ? fail(502, `1Click: ${e.message}`) : fail(502, chainError(e));
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
      channel: "INTENTS",
      test_mode: false,
      expires_at: iso(expiresMs),
      payer_wallet: refundTo,
      onchain_listing_id: order.listingId,
      intent: data as unknown as Json,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) {
    await giveBack();
    if (inserted.error?.code === "23505") return fail(409, "masih ada pembayaran lain yang berjalan; selesaikan atau batalkan dulu");
    return fail(500, inserted.error?.message ?? "pembayaran gagal disimpan");
  }
  seatsChanged();
  return { ok: true, value: intentView(inserted.data, null) };
}

async function saveIntent(admin: Admin, row: PaymentRow, patch: Partial<IntentData>): Promise<PaymentRow> {
  const intent = { ...intentOf(row), ...patch };
  const { data, error } = await admin
    .from("payments")
    .update({ intent: intent as unknown as Json, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "pembayaran gagal disimpan");
  return data;
}

/** Money in the escrow for an order that cannot be written goes back to the refund address. */
async function refundOnChain(op: Operator, id: Hex) {
  const live = await readListing(op, id).catch(() => null);
  if (live?.status !== "Funded" && live?.status !== "DisputeWindow") return false;
  await settle(op, id, "refund");
  return true;
}

/** The money is at the receiver: lock it in the escrow and write the order. */
async function finish(admin: Admin, op: Operator, row: PaymentRow): Promise<PaymentRow> {
  const lockedBefore = iso(Date.now() - STALE_LOCK_MS);
  const lock = await admin
    .from("payments")
    .update({ checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .in("status", ["pending", "expired"])
    .or(`checked_at.is.null,checked_at.lt.${lockedBefore}`)
    .select("*");
  if (lock.error) throw new Error(lock.error.message);
  const taken = lock.data?.[0];
  if (!taken) return row;

  const d = intentOf(taken);
  const loaded = await loadPurchase(admin, taken.listing_id);
  const purchase = loaded.ok ? loaded.purchase : null;
  if (!purchase || purchase.event.status === "cancelled") {
    if (taken.status === "pending") await closeHold(admin, taken.id, "failed");
    return taken;
  }

  const order = orderOf(taken, d);
  let opened: Awaited<ReturnType<typeof openIntentOrder>>;
  try {
    opened = await openIntentOrder(op, order, taken.id, purchase.listing.ticket_sha256, d.txs ?? {});
  } catch (e) {
    console.error("[intents] could not lock the money:", taken.id, chainError(e));
    // The lock stays, so the next read tries again once it is stale.
    return taken;
  }
  const saved = await saveIntent(admin, taken, { txs: opened.txs });

  const marked = await admin.rpc("mark_payment_paid", { p_id: taken.id, p_provider_payment_id: opened.txs.fund ?? order.listingId });
  if (marked.error) {
    console.error("[intents] locked on chain but not marked paid:", taken.id, marked.error.message);
    return saved;
  }
  if (marked.data === "unfulfilled") {
    // The hold had closed and its seats went to someone else: the money goes back.
    const refunded = await refundOnChain(op, order.listingId).catch(() => false);
    if (!refunded) console.error("[intents] locked after its seats went back; refund it on chain:", taken.id);
    const at = new Date().toISOString();
    const { data } = await admin.from("payments").update({ status: "refunded", refunded_at: at, refund_note: "refunded on chain: the seats had gone", updated_at: at }).eq("id", taken.id).select("*").single();
    seatsChanged();
    return data ?? saved;
  }

  const live = await readListing(op, order.listingId).catch(() => null);
  const endsAtSec = order.eventEndsAt;
  const chain: ChainFields = {
    chain_id: op.chain.id,
    contract_address: op.escrow,
    onchain_listing_id: opened.listingId,
    onchain_price: opened.price,
    dispute_deadline: iso(live ? live.deadline * 1000 : Math.max(Date.now(), endsAtSec * 1000) + DISPUTE_WINDOW_H * H),
    tx_create: opened.txs.create ?? "",
    tx_fund: opened.txs.fund ?? "",
    tx_handover: opened.txs.handover ?? "",
  };
  const ins = await admin
    .from("orders")
    .insert(
      orderInsert(taken.buyer_id, purchase, taken.quantity, {
        endsAt: purchase.scheduledEnd,
        chain,
        paymentId: taken.id,
        price: { amount: Number(taken.amount), fee: Number(taken.fee), materai: Number(taken.materai) },
        usdcWallet: d.refundTo,
      })
    )
    .select("id")
    .single();
  if (ins.error || !ins.data) {
    if (ins.error?.code !== "23505") {
      console.error("[intents] locked on chain but the order was not saved:", taken.id, ins.error?.message);
      const refunded = await refundOnChain(op, order.listingId).catch(() => false);
      if (refunded) {
        const at = new Date().toISOString();
        await admin.rpc("release_listing", { p_listing_id: taken.listing_id, p_quantity: taken.quantity });
        await admin.from("payments").update({ status: "refunded", refunded_at: at, refund_note: "refunded on chain: the order could not be written", updated_at: at }).eq("id", taken.id);
      }
    }
  } else {
    notifyOrderPaid(admin, ins.data.id);
  }
  seatsChanged();
  const { data: after } = await admin.from("payments").select("*").eq("id", taken.id).single();
  return after ?? saved;
}

/**
 * Bring one hold up to date: what 1Click says about the swap, and whether the money has reached the
 * receiver. The chain decides that, so a payment still lands if 1Click's answer is late or missing.
 */
export async function advanceIntentPayment(admin: Admin, op: Operator, input: PaymentRow): Promise<PaymentRow> {
  let row = input;
  const d = intentOf(row);
  if (row.status === "paid" || row.status === "refunded") return row;

  const swap = await readSwapStatus(d.depositAddress, d.depositMemo).catch(() => null);
  if (swap && swap.status !== d.swapStatus) {
    row = await saveIntent(admin, row, {
      swapStatus: swap.status,
      originTx: swap.swapDetails?.originChainTxHashes?.[0]?.hash ?? d.originTx,
      arrivalTx: swap.swapDetails?.destinationChainTxHashes?.[0]?.hash ?? d.arrivalTx,
    });
  }
  if (swap && (swap.status === "REFUNDED" || swap.status === "FAILED") && row.status === "pending") {
    await closeHold(admin, row.id, "failed");
    const { data } = await admin.from("payments").select("*").eq("id", row.id).single();
    return data ?? row;
  }

  const fresh = intentOf(row);
  if (Date.now() / 1000 >= fresh.refundAfter - FUND_MARGIN_SECONDS) return row;
  const pc = publicClient(op.chain, op.rpcUrl);
  const balance = await pc.readContract({ address: op.token, abi: tokenAbi, functionName: "balanceOf", args: [fresh.receiver as Address] });
  // A listing funded already, by a run cut off before the order was written, is finished here too.
  const onChain = await readListing(op, row.onchain_listing_id as Hex).catch(() => null);
  const funded = onChain && onChain.status !== "None" && onChain.status !== "Listed";
  if (balance >= BigInt(row.total) || (funded && !(await orderIdOf(admin, row.id)))) return finish(admin, op, row);
  return row;
}

/**
 * Money waiting in a receiver with no order to go to, once the order's deadline has passed: back to the
 * refund address. Anyone could call this on chain; the daily cron does, so nobody has to. Returns how
 * many it sent.
 */
export async function settleIntentLeftovers(admin: Admin, limit = 10) {
  const op = intentsOperator();
  if (!op) return 0;
  const { data, error } = await admin
    .from("payments")
    .select("*")
    .eq("channel", "INTENTS")
    .neq("status", "paid")
    .gte("created_at", iso(Date.now() - 30 * 24 * H))
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const pc = publicClient(op.chain, op.rpcUrl);
  let swept = 0;
  for (const row of data ?? []) {
    if (swept >= limit) break;
    const d = intentOf(row);
    if (Date.now() / 1000 < d.refundAfter) continue;
    const balance = await pc.readContract({ address: op.token, abi: tokenAbi, functionName: "balanceOf", args: [d.receiver as Address] });
    if (balance <= BigInt(0)) continue;
    const tx = await sweepIntentReceiver(op, orderOf(row, d), d.receiver as Address);
    await saveIntent(admin, row, { sweepTx: tx });
    swept++;
  }
  return swept;
}

export { intentsOperator };
