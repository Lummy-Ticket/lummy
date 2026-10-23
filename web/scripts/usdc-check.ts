/**
 * Paying for a show abroad in USDC from the buyer's own wallet, end to end on Arbitrum Sepolia
 * (tasks/founder-house-usdc.md), with three accounts and a show priced in USDC, made for the run.
 * The wallet is a key this script holds (USDC_CHECK_KEY, or BUYER_PRIVATE_KEY from
 * ~/.lummy/testnet.env): it signs exactly what a browser wallet signs, and the server never sees it.
 *
 * Such a show cannot be paid by QRIS or by the straight order path. Pay with a wallet holds the
 * seats and hands back two messages; a total above the wallet's balance is refused before anything
 * is held. Signatures from another key are refused, and so is another account sending the real ones.
 * The real ones lock the money in LummyEscrow and write exactly one order, which sending them again
 * returns; the chain shows the listing funded by the wallet, and the QRIS ledger leaves the order
 * alone. Cancelling a hold gives its seat back. A submit cut off after the money was locked, with no
 * order written, is found by the next checkout, which refunds the wallet on chain. Two more seats
 * are paid and claimed, the way the ticket page and the staff queue send it: the buyer uploads a
 * photo of the ticket and files, the contract freezes the payout, staff rule, and the contract
 * splits the money, which comes back to the wallet; one ruling refunds in full, the other half.
 * The public proof page and the ticket page show each ruling. A third claim plays replies lost after
 * the contract acted: the operator's flag and ruling are sent from here (the operator key in
 * ~/.lummy/testnet.env), and the server, asked again, takes what the chain says and sends the money
 * still waiting in the escrow back to the wallet. Then the last seat is bought through the pages
 * themselves, with a wallet injected into the browser that hands every signature request to the
 * same key here: prices in USDC, the wallet panel at checkout, the ticket page after. At the end
 * staff cancel the show, and the escrow pays the wallet back everything but the half the partial
 * ruling gave the seller (the testnet seller's wallet).
 *
 * The accounts are signed in with an admin link, so no email is sent; everything the run made is
 * deleted at the end. It writes to the database the server uses and spends the operator's testnet
 * gas, so run it only where that is fine, against a server started with the testnet keys
 * (/tmp/lummy-start.sh chain).
 *
 *   BASE=http://127.0.0.1:3000 npm run usdc:check
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { createPublicClient, createWalletClient, getAddress, http, keccak256, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { escrowAbi, tokenAbi } from "../src/lib/chain/abi";
import { reviveTyped } from "../src/lib/chain/typed";
import type { TypedMessage, UsdcStart } from "../src/lib/payments/types";
import type { Database } from "../src/lib/supabase/types";
import { initWriter, photo } from "./ticket-fixtures";

try {
  process.loadEnvFile(".env.local");
} catch {
  // checked below
}
const BASE = process.env.BASE ?? "http://localhost:3000";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const RPC = process.env.LUMMY_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
const RUN = Date.now().toString(36);
const EMAILS = ["buyer", "seller", "staff"].map((who) => `usdc-check-${RUN}-${who}@example.com`);
const EVENT = "ev-zz-usdc";
const TIER = "t-zz-usdc";
const TIER_BIG = "t-zz-usdc-big";
const L1 = "ls-zz-usdc-1"; // two seats, sold one by one
const L_BIG = "ls-zz-usdc-big"; // more than the wallet holds
const L_CUT = "ls-zz-usdc-cut"; // paid, then cut off before its order
const L_CLAIM = "ls-zz-usdc-claim"; // paid, claimed, refunded in full by a ruling
const L_PART = "ls-zz-usdc-part"; // paid, claimed, half refunded by a ruling
const L_LOST = "ls-zz-usdc-lost"; // claimed and ruled, each time the contract acting before the reply was lost
const LISTINGS = [L1, L_BIG, L_CUT, L_CLAIM, L_PART, L_LOST];
const PRICE = 100_000; // 0.10 USDC, in micro-USDC like every USDC price in the app
const BIG = 1_000_000_000; // 1,000 USDC
const CLAIM_PRICE = 50_000; // 0.05 USDC, all of it back
const PART_PRICE = 20_000; // 0.02 USDC: half back, half to the testnet seller
const LOST_PRICE = 10_000; // 0.01 USDC, all of it back

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

type Admin = ReturnType<typeof createClient<Database>>;
type Reply = { status: number; body: Record<string, unknown> };
type EscrowHistory = {
  source?: string;
  live?: { status: string; buyer: string; disputed?: boolean };
  events?: { kind: string; toBuyer?: string; toSeller?: string }[];
};

/** A key from the env, or from ~/.lummy/testnet.env: never printed, never sent anywhere. */
function testnetKey(env: string, name: string): Hex {
  if (process.env[env]) return process.env[env].trim() as Hex;
  const file = path.join(os.homedir(), ".lummy", "testnet.env");
  const line = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").find((l) => l.startsWith(`${name}=`)) : undefined;
  if (!line) throw new Error(`needs ${env}, or ${name} in ~/.lummy/testnet.env`);
  return line.slice(line.indexOf("=") + 1).trim() as Hex;
}
/** The wallet's key. */
const walletKey = () => testnetKey("USDC_CHECK_KEY", "BUYER_PRIVATE_KEY");
/** The operator's key, the server's own, to play a transaction whose reply never came back. */
const operatorKey = () => testnetKey("USDC_CHECK_OPERATOR_KEY", "OPERATOR_PRIVATE_KEY");

/** Signs an account in the way its email link would, with a link the admin key makes (none is sent). */
async function signIn(admin: Admin, browser: Browser, email: string): Promise<BrowserContext> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = link.data.properties?.hashed_token;
  if (!hashed) throw new Error(`no sign-in link for ${email}: ${link.error?.message ?? "?"}`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/confirm?token_hash=${hashed}&type=email`, { waitUntil: "networkidle" });
  await page.close();
  return ctx;
}

/** A request as a signed-in account: its context carries the session cookie. */
async function api(ctx: BrowserContext, method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<Reply> {
  const r = await ctx.request.fetch(`${BASE}${path}`, { method, data: body, failOnStatusCode: false, timeout: 90_000 });
  return { status: r.status(), body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** What a wallet returns for the two messages of one hold. */
async function signBoth(key: Hex, s: UsdcStart) {
  const account = privateKeyToAccount(key);
  type Typed = Parameters<typeof account.signTypedData>[0];
  return {
    authSig: await account.signTypedData(reviveTyped(s.auth) as Typed),
    fundSig: await account.signTypedData(reviveTyped(s.fund) as Typed),
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (web/.env.local)");
  const admin = createClient<Database>(url, key, { auth: { persistSession: false } });
  const walletPk = walletKey();
  const wallet = privateKeyToAccount(walletPk).address;
  const pc = createPublicClient({ chain: arbitrumSepolia, transport: http(RPC) });

  const listing = async (id: string) => (await admin.from("listings").select("status, quantity").eq("id", id).single()).data;
  const payment = async (id: string) => (await admin.from("payments").select("*").eq("id", id).single()).data;
  const escrowOf = async (id: string) => {
    const r = await fetch(`${BASE}/api/chain/history/${id}?source=escrow`);
    return (await r.json().catch(() => ({}))) as EscrowHistory;
  };

  const userIds: string[] = [];
  const photos: string[] = []; // claim photos in the evidence bucket
  let kept = BigInt(0); // what rulings gave the seller, which does not come back to the wallet
  let staffCtx: BrowserContext | null = null;
  let showCancelled = false;
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  try {
    const made = await Promise.all(
      EMAILS.map((email, i) =>
        admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: ["USDC Buyer", "USDC Seller", "USDC Staff"][i] } })
      )
    );
    const [buyer, seller, staff] = made.map((m) => m.data.user?.id);
    for (const id of [buyer, seller, staff]) if (id) userIds.push(id);
    if (!buyer || !seller || !staff) throw new Error(`accounts: ${made.map((m) => m.error?.message ?? "ok").join(", ")}`);
    // Staff for this run only: it cancels the show at the end, and is deleted with the others.
    const promoted = await admin.from("profiles").update({ role: "admin" }).eq("id", staff).select("id");
    if (promoted.error || !promoted.data.length) throw new Error(`staff: ${promoted.error?.message ?? "no profile"}`);

    // --- A show abroad, priced in USDC. A multi-row insert sends null for a column one row leaves
    // out, so every row names them all.
    const iso = (ms: number) => new Date(ms).toISOString();
    const setup = [
      await admin.from("events").insert({
        id: EVENT,
        title: "Uji USDC",
        category: "Music",
        starts_at: iso(Date.now() + 10 * 86_400_000),
        venue: "Marina Bay Sands",
        city: "Singapore",
        transfer_policy: "open",
        country: "SG",
        currency: "USDC",
      }),
      await admin.from("tiers").insert([
        { id: TIER, event_id: EVENT, name: "GA", face_value: PRICE },
        { id: TIER_BIG, event_id: EVENT, name: "VIP", face_value: BIG },
      ]),
      await admin.from("listings").insert([
        { id: L1, event_id: EVENT, tier_id: TIER, seller_id: seller, seller_name: "USDC S.", ask_price: PRICE, face_value: PRICE, quantity: 2, splittable: true, status: "active" },
        { id: L_CUT, event_id: EVENT, tier_id: TIER, seller_id: seller, seller_name: "USDC S.", ask_price: PRICE, face_value: PRICE, quantity: 1, splittable: false, status: "active" },
        { id: L_BIG, event_id: EVENT, tier_id: TIER_BIG, seller_id: seller, seller_name: "USDC S.", ask_price: BIG, face_value: BIG, quantity: 1, splittable: false, status: "active" },
        { id: L_CLAIM, event_id: EVENT, tier_id: TIER, seller_id: seller, seller_name: "USDC S.", ask_price: CLAIM_PRICE, face_value: CLAIM_PRICE, quantity: 1, splittable: false, status: "active" },
        { id: L_PART, event_id: EVENT, tier_id: TIER, seller_id: seller, seller_name: "USDC S.", ask_price: PART_PRICE, face_value: PART_PRICE, quantity: 1, splittable: false, status: "active" },
        { id: L_LOST, event_id: EVENT, tier_id: TIER, seller_id: seller, seller_name: "USDC S.", ask_price: LOST_PRICE, face_value: LOST_PRICE, quantity: 1, splittable: false, status: "active" },
      ]),
    ];
    const setupError = setup.find((r) => r.error)?.error;
    if (setupError) throw new Error(`setup: ${setupError.message}`);

    const config = await (await fetch(`${BASE}/api/payments`)).json();
    check("the USDC rail is on here", config.usdc === true, JSON.stringify(config));

    const buyerCtx = await signIn(admin, browser, EMAILS[0]);
    const sellerCtx = await signIn(admin, browser, EMAILS[1]);
    staffCtx = await signIn(admin, browser, EMAILS[2]);

    // --- Only a wallet pays for this show.
    const qris = await api(buyerCtx, "POST", "/api/payments", { listingId: L1, quantity: 1 });
    check(
      "QRIS is refused for a show priced in USDC",
      config.enabled ? qris.status === 400 && String(qris.body.error).includes("USDC") : qris.status === 503,
      JSON.stringify(qris)
    );
    const straight = await api(staffCtx, "POST", "/api/orders", { listingId: L1, quantity: 1 });
    check("so is the straight order path, even for staff", straight.status === 409 && String(straight.body.error).includes("USDC"), JSON.stringify(straight));
    const badWallet = await api(buyerCtx, "POST", "/api/payments", { listingId: L1, quantity: 1, wallet: "0x1234" });
    check("an address that is not one is refused", badWallet.status === 400, JSON.stringify(badWallet));
    const big = await api(buyerCtx, "POST", "/api/payments", { listingId: L_BIG, quantity: 1, wallet });
    const bigListing = await listing(L_BIG);
    check(
      "a total above the wallet's balance is refused before anything is held",
      big.status === 402 && bigListing?.status === "active" && bigListing.quantity === 1,
      JSON.stringify({ big, bigListing })
    );

    // --- Pay holds a seat and hands back what the wallet signs.
    const start = await api(buyerCtx, "POST", "/api/payments", { listingId: L1, quantity: 1, wallet });
    const s = start.body as unknown as UsdcStart;
    const payId = s.payment?.id;
    const expectedListing = payId ? keccak256(toHex(`lummy:listing:${payId}`)) : null;
    check(
      "pay with a wallet holds the seat and returns both messages",
      start.status === 200 &&
        s.value === String(PRICE) &&
        s.chainId === arbitrumSepolia.id &&
        same(s.auth?.message?.from, wallet) &&
        same(s.auth?.message?.to, s.escrow) &&
        s.auth?.message?.value === String(PRICE) &&
        s.fund?.message?.listingId === expectedListing &&
        s.fund?.message?.authNonce === s.auth?.message?.nonce,
      JSON.stringify(start).slice(0, 600)
    );
    if (start.status !== 200 || !payId) throw new Error("no hold to pay");
    const held = await payment(payId);
    check(
      "the hold is an escrow payment for this wallet",
      held?.provider === "escrow" && held.channel === "USDC" && held.payer_wallet === getAddress(wallet) && held.status === "pending" && Number(held.total) === PRICE,
      JSON.stringify(held)
    );
    check("one of the two seats is held", (await listing(L1))?.quantity === 1, JSON.stringify(await listing(L1)));

    const forged = await signBoth(generatePrivateKey(), s);
    const wrongKey = await api(buyerCtx, "POST", `/api/payments/${payId}/usdc`, forged);
    check("signatures from another key are refused", wrongKey.status === 400, JSON.stringify(wrongKey));
    const afterForged = await payment(payId);
    check("and leave the hold open, not locked", afterForged?.status === "pending" && !afterForged.checked_at, JSON.stringify(afterForged));

    const signed = await signBoth(walletPk, s);
    const stranger = await api(sellerCtx, "POST", `/api/payments/${payId}/usdc`, signed);
    check("another account cannot send the buyer's signatures", stranger.status === 404, JSON.stringify(stranger));

    // --- The real signatures: the money goes into the escrow and the order is written.
    const before = await pc.readContract({ address: s.token as Address, abi: tokenAbi, functionName: "balanceOf", args: [wallet] });
    const t0 = Date.now();
    const paid = await api(buyerCtx, "POST", `/api/payments/${payId}/usdc`, signed);
    const took = ((Date.now() - t0) / 1000).toFixed(1);
    const orderId = paid.body.orderId as string | undefined;
    check(`the wallet's signatures lock the money and write the order (${took}s)`, paid.status === 200 && !!orderId, JSON.stringify(paid));
    if (!orderId) throw new Error("no order");
    const again = await api(buyerCtx, "POST", `/api/payments/${payId}/usdc`, signed);
    check("sending them again returns the same order", again.status === 200 && again.body.orderId === orderId, JSON.stringify(again));

    const order = (await admin.from("orders").select("*").eq("id", orderId).single()).data;
    check(
      "the order is a USDC order from this wallet, on the escrow listing the hold named",
      order?.rail === "usdc" &&
        same(order.buyer_wallet, wallet) &&
        order.onchain_listing_id === expectedListing &&
        same(order.contract_address, s.escrow) &&
        order.onchain_price === String(PRICE) &&
        order.escrow_status === "DisputeWindow" &&
        !!order.tx_create && !!order.tx_fund && !!order.tx_handover,
      JSON.stringify(order)
    );
    check("no fee and no stamp duty on testnet", Number(order?.amount) === PRICE && Number(order?.fee) === 0 && Number(order?.materai) === 0, JSON.stringify(order));
    check("the QRIS ledger leaves it alone: the escrow is its public record", order?.ledger_status === "Skipped", String(order?.ledger_status));
    const paidRow = await payment(payId);
    check("the hold is paid, with the funding transaction as its number", paidRow?.status === "paid" && paidRow.provider_payment_id === order?.tx_fund, JSON.stringify(paidRow));
    const read = await api(buyerCtx, "GET", `/api/payments/${payId}`);
    check("reading the hold points to the order", read.status === 200 && read.body.status === "paid" && read.body.orderId === orderId, JSON.stringify(read));

    const live = await escrowOf(expectedListing!);
    check("on chain the listing is funded by the wallet, its window open", live.source === "escrow" && live.live?.status === "DisputeWindow" && same(live.live?.buyer, wallet), JSON.stringify(live).slice(0, 400));
    const after = await pc.readContract({ address: s.token as Address, abi: tokenAbi, functionName: "balanceOf", args: [wallet] });
    check("the wallet paid exactly the price", before - after === BigInt(PRICE), `${before} -> ${after}`);

    // --- A hold given up before signing gives its seat back.
    const second = await api(buyerCtx, "POST", "/api/payments", { listingId: L1, quantity: 1, wallet });
    const secondId = (second.body as unknown as UsdcStart).payment?.id;
    check("the last seat can be held too, the listing sold out while it is", second.status === 200 && !!secondId && (await listing(L1))?.status === "sold", JSON.stringify(second).slice(0, 300));
    if (secondId) {
      const cancelled = await api(buyerCtx, "POST", `/api/payments/${secondId}`, { action: "cancel" });
      const back = await listing(L1);
      check("cancelling it gives the seat back", cancelled.status === 200 && cancelled.body.status === "canceled" && back?.status === "active" && back.quantity === 1, JSON.stringify({ cancelled, back }));
    }

    // --- A submit cut off after the money was locked (a timeout, a crash): no order, the hold still
    // marked as on its way. The next checkout (or the daily cron) reads the chain and refunds it.
    const balanceNow = () => pc.readContract({ address: s.token as Address, abi: tokenAbi, functionName: "balanceOf", args: [wallet] });
    const cutStart = await api(buyerCtx, "POST", "/api/payments", { listingId: L_CUT, quantity: 1, wallet });
    const cut = cutStart.body as unknown as UsdcStart;
    const cutPaid = cut.payment?.id ? await api(buyerCtx, "POST", `/api/payments/${cut.payment.id}/usdc`, await signBoth(walletPk, cut)) : null;
    check("another seat is paid, to be cut off", cutStart.status === 200 && cutPaid?.status === 200, JSON.stringify(cutPaid ?? cutStart).slice(0, 300));
    if (cut.payment?.id && cutPaid?.status === 200) {
      const cutId = cut.payment.id;
      const cutListing = keccak256(toHex(`lummy:listing:${cutId}`));
      const beforeCut = await balanceNow();
      await admin.from("orders").delete().eq("payment_id", cutId);
      await admin.from("payments").update({ status: "pending", checked_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("id", cutId);
      // Any new checkout runs the reconcile first, even one refused for the balance.
      await api(buyerCtx, "POST", "/api/payments", { listingId: L_BIG, quantity: 1, wallet });
      const cutRow = await payment(cutId);
      const cutLive = await escrowOf(cutListing);
      let afterCut = await balanceNow();
      for (let i = 0; i < 10 && afterCut - beforeCut !== BigInt(PRICE); i++) {
        await sleep(1500);
        afterCut = await balanceNow();
      }
      check(
        "the next checkout finds the cut-off hold and refunds the wallet on chain",
        cutRow?.status === "refunded" && cutLive.live?.status === "Refunded" && afterCut - beforeCut === BigInt(PRICE),
        JSON.stringify({ status: cutRow?.status, note: cutRow?.refund_note, chain: cutLive.live?.status, delta: String(afterCut - beforeCut) })
      );
      check("and its seat is back on sale", (await listing(L_CUT))?.status === "active", JSON.stringify(await listing(L_CUT)));
    }

    // --- A claim and a ruling, sent the way the ticket page and the staff queue send them. The photo
    // goes as uploadEvidence sends it: a one-off token from the server, the file straight into the
    // private bucket, then the server reads it itself. Filing raises the flag in the contract; the
    // ruling has the contract split the money, and the operator sends each share on.
    await initWriter();
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!publishable) throw new Error("needs NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (web/.env.local)");
    const bucket = createClient<Database>(url, publishable, { auth: { persistSession: false } }).storage.from("evidence");
    // A reply lost after the contract acted (a dropped connection, a function cut off): the operator's
    // transaction is sent from here, so the server only finds out when it asks the chain again.
    const operator = createWalletClient({ account: privateKeyToAccount(operatorKey()), chain: arbitrumSepolia, transport: http(RPC) });
    const mined = async (hash: Hex) => {
      const r = await pc.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(`tx ${hash} reverted`);
      return hash;
    };
    const ruling = async (listingId: string, price: number, remedy: "REFUND_FULL" | "REFUND_PARTIAL", lost = false) => {
      const full = remedy === "REFUND_FULL";
      const what = lost ? "replies lost after the contract acted" : full ? "full refund" : "partial refund";
      const toBuyer = full ? price : price / 2;
      const hold = await api(buyerCtx, "POST", "/api/payments", { listingId, quantity: 1, wallet });
      const h = hold.body as unknown as UsdcStart;
      const bought = h.payment?.id ? await api(buyerCtx, "POST", `/api/payments/${h.payment.id}/usdc`, await signBoth(walletPk, h)) : null;
      const id = bought?.body.orderId as string | undefined;
      check(`${what}: another seat is paid, to be claimed`, !!id, JSON.stringify(bought ?? hold).slice(0, 300));
      if (!id) return;
      const onchainId = keccak256(toHex(`lummy:listing:${h.payment.id}`));

      const bytes = await photo(`LMY|${EVENT}|GA|${id}`, "jpeg");
      const intent = await api(buyerCtx, "POST", `/api/orders/${id}`, { action: "evidence-upload", type: "image/jpeg", size: bytes.length });
      const path = typeof intent.body.path === "string" ? intent.body.path : "";
      if (path) photos.push(path);
      const put = path ? await bucket.uploadToSignedUrl(path, String(intent.body.token), new Blob([bytes], { type: "image/jpeg" }), { contentType: "image/jpeg" }) : null;
      const read = await api(buyerCtx, "POST", `/api/orders/${id}`, { action: "evidence-read", evidencePath: path, kind: "TICKET_PHOTO" });
      if (lost) await mined(await operator.writeContract({ address: s.escrow as Address, abi: escrowAbi, functionName: "raiseDispute", args: [onchainId] }));
      const filed = await api(buyerCtx, "POST", `/api/orders/${id}`, {
        action: "dispute", reason: "NOT_AS_LISTED", note: "The ticket is a lower tier than the listing.", evidencePath: path, kind: "TICKET_PHOTO",
      });
      const claimed = (await admin.from("orders").select("disputed, disputes(reason, evidence)").eq("id", id).single()).data;
      const claim = Array.isArray(claimed?.disputes) ? claimed.disputes[0] : claimed?.disputes;
      let frozen = await escrowOf(onchainId);
      for (let i = 0; i < 5 && filed.status === 200 && !frozen.live?.disputed; i++) {
        await sleep(1500);
        frozen = await escrowOf(onchainId);
      }
      check(
        lost
          ? `${what}: the flag already up in the contract is taken as the claim, not refused`
          : `${what}: the buyer's photo is read by the server, the claim is filed and the contract freezes the payout`,
        intent.status === 200 && !!path && !put?.error && read.status === 200 && filed.status === 200 &&
          claimed?.disputed === true && claim?.reason === "NOT_AS_LISTED" && (claim.evidence as { upload?: { path?: string } } | null)?.upload?.path === path &&
          frozen.live?.status === "DisputeWindow" && frozen.live.disputed === true,
        JSON.stringify({ intent: intent.status, put: put?.error?.message, read, filed, claimed, chain: frozen.live }).slice(0, 600)
      );
      if (filed.status !== 200) return;

      const beforeRuling = await balanceNow();
      // The contract rules and nothing is sent on: the money waits in the escrow.
      const ruledTx = lost
        ? await mined(await operator.writeContract({ address: s.escrow as Address, abi: escrowAbi, functionName: "resolveDispute", args: [onchainId, BigInt(toBuyer)] }))
        : null;
      const verdict = await api(staffCtx!, "POST", `/api/orders/${id}`, { action: "verdict", remedy });
      const sent = Array.isArray(verdict.body.withdrawals) ? (verdict.body.withdrawals as string[]) : [];
      check(
        lost
          ? `${what}: staff rule the same, the ruling already on chain is recorded and the money waiting there sent on`
          : `${what}: staff rule it and the contract carries it out, paying ${full ? "the wallet" : "the wallet and the seller"}`,
        verdict.status === 200 && typeof verdict.body.tx === "string" && (!ruledTx || verdict.body.tx === ruledTx) && sent.length === (full ? 1 : 2),
        JSON.stringify(verdict)
      );
      if (verdict.status !== 200) return;
      kept += BigInt(price - toBuyer);

      const row = (await admin.from("orders").select("escrow_status, disputed, tx_settle, tx_withdrawals, disputes(*)").eq("id", id).single()).data;
      const d = Array.isArray(row?.disputes) ? row.disputes[0] : row?.disputes;
      check(
        `${what}: the order shows the refund and its claim the ruling`,
        row?.escrow_status === "Refunded" && row.tx_settle === verdict.body.tx && JSON.stringify(row.tx_withdrawals) === JSON.stringify(sent) &&
          d?.verdict_remedy === remedy && d.verdict_to_seller === false && Number(d.refund_amount) === toBuyer && d.decided_by === staff && !!d.decided_at,
        JSON.stringify(row).slice(0, 600)
      );

      // A running escrow's history is cached for a few seconds, and the chain's logs can trail its state.
      let settledClaim = await escrowOf(onchainId);
      for (let i = 0; i < 10 && !(settledClaim.live?.status === "Refunded" && settledClaim.events?.some((e) => e.kind === "Resolved")); i++) {
        await sleep(1500);
        settledClaim = await escrowOf(onchainId);
      }
      const resolved = settledClaim.events?.find((e) => e.kind === "Resolved");
      check(
        `${what}: on chain the claim was raised and resolved, ${toBuyer} to the buyer and ${price - toBuyer} to the seller`,
        settledClaim.live?.status === "Refunded" && settledClaim.live.disputed === true && !!settledClaim.events?.some((e) => e.kind === "DisputeRaised") &&
          resolved?.toBuyer === String(toBuyer) && resolved.toSeller === String(price - toBuyer),
        JSON.stringify(settledClaim).slice(0, 600)
      );

      let afterRuling = await balanceNow();
      for (let i = 0; i < 10 && afterRuling - beforeRuling !== BigInt(toBuyer); i++) {
        await sleep(1500);
        afterRuling = await balanceNow();
      }
      const waiting = await pc.readContract({ address: s.escrow as Address, abi: escrowAbi, functionName: "pending", args: [wallet] });
      check(
        `${what}: the wallet has its ${full ? "money" : "half"} back, nothing left waiting in the escrow`,
        afterRuling - beforeRuling === BigInt(toBuyer) && waiting === BigInt(0),
        JSON.stringify({ delta: String(afterRuling - beforeRuling), waiting: String(waiting) })
      );
      if (lost) return;

      // The public proof needs no account; the ticket page is the buyer's.
      const visitor = await browser.newContext();
      const proof = await visitor.newPage();
      await proof.goto(`${BASE}/proof/${onchainId}`, { waitUntil: "networkidle" });
      const headline = full ? /Done: refunded to the buyer|Selesai: dana kembali ke pembeli/ : /Done: split by the claim decision|Selesai: dana dibagi sesuai putusan klaim/;
      const shown = await proof.getByRole("heading", { level: 1, name: headline }).waitFor({ timeout: 45_000 }).then(() => true, () => false);
      const proofText = await proof.locator("main").innerText();
      check(
        `${what}: the public proof page shows the claim and the ruling`,
        shown && /Claim decided|Klaim diputus/.test(proofText) && /claim, the payout is frozen|klaim, pencairan dibekukan/.test(proofText),
        proofText.slice(0, 500)
      );
      await visitor.close();
      const ticket = await buyerCtx.newPage();
      await ticket.goto(`${BASE}/tickets/${id}`, { waitUntil: "networkidle" });
      const said = full ? /(Verdict|Putusan): (full refund|refund penuh)/ : /(Verdict|Putusan): (partial refund|refund sebagian)/;
      let ticketText = "";
      for (let i = 0; i < 20 && !said.test(ticketText); i++) {
        if (i) await sleep(1000);
        ticketText = await ticket.locator("main").innerText().catch(() => "");
      }
      check(`${what}: the buyer's ticket page shows the ruling`, said.test(ticketText), ticketText.slice(0, 500));
      await ticket.close();
    };
    await ruling(L_CLAIM, CLAIM_PRICE, "REFUND_FULL");
    await ruling(L_PART, PART_PRICE, "REFUND_PARTIAL");
    await ruling(L_LOST, LOST_PRICE, "REFUND_FULL", true);

    // --- The last seat through the pages, with a wallet in the browser. The page asks it the way it
    // asks MetaMask; every request comes back here, where the key is.
    const page = await buyerCtx.newPage();
    const account = privateKeyToAccount(walletPk);
    type Typed = Parameters<typeof account.signTypedData>[0];
    await page.exposeBinding("__lummyWallet", async (_source, method: string, params: unknown[]) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [wallet];
      if (method === "eth_chainId") return `0x${arbitrumSepolia.id.toString(16)}`;
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "eth_signTypedData_v4") {
        const typed = JSON.parse(String(params[1])) as TypedMessage;
        delete typed.types.EIP712Domain;
        return account.signTypedData(reviveTyped(typed) as Typed);
      }
      throw new Error(`the test wallet does not do ${method}`);
    });
    // A string, not a function: tsx would wrap a function in helpers the page does not have.
    await page.addInitScript(
      "window.ethereum = { request: ({ method, params }) => window.__lummyWallet(method, params || []), on() {}, removeListener() {} };"
    );
    await page.goto(`${BASE}/events/${EVENT}`, { waitUntil: "networkidle" });
    check(
      "the show's page prices it in USDC and says its tickets are testnet samples",
      (await page.getByText(/0[.,]10 USDC/).count()) > 0 && (await page.locator("[data-usdc-demo]").count()) === 1,
      (await page.locator("main").innerText()).slice(0, 300)
    );
    await page.goto(`${BASE}/checkout?listing=${L1}&qty=1`, { waitUntil: "networkidle" });
    const payButton = page.getByRole("button", { name: /USDC/ });
    check(
      "checkout offers USDC from the wallet, with no fee",
      (await page.locator("[data-pay-rail=usdc]").count()) === 1 && (await payButton.count()) === 1 && (await payButton.isEnabled()),
      (await page.locator("main").innerText()).slice(0, 400)
    );
    await payButton.click();
    await page.locator("[data-usdc-pay]").click(); // connect
    await page.locator("[data-usdc-wallet]").waitFor({ timeout: 15_000 });
    await page.locator("[data-usdc-pay]").click(); // sign and pay
    const reached = await page.waitForURL(/\/tickets\//, { timeout: 90_000 }).then(
      () => true,
      async () => (await page.locator("[data-usdc-error]").innerText().catch(() => "")) || "no ticket page"
    );
    check("the wallet signs twice and the page lands on the ticket", reached === true, String(reached));
    if (reached === true) {
      await page.locator("[data-paid-wallet]").waitFor({ timeout: 15_000 }).catch(() => null);
      const text = await page.locator("main").innerText();
      check(
        "the ticket shows the USDC paid, from which wallet, and no Indonesian letter",
        /0[.,]10 USDC/.test(text) && (await page.locator("[data-paid-wallet]").count()) === 1 && !/Surat kuasa|Letter of authorisation/.test(text),
        text.slice(0, 400)
      );
    }
    const viaPage = (await admin.from("orders").select("id, rail").eq("listing_id", L1)).data ?? [];
    check("both seats are now USDC orders", viaPage.length === 2 && viaPage.every((o) => o.rail === "usdc"), JSON.stringify(viaPage));
    await page.close();

    // --- Staff cancel the show: the escrow pays the wallet back.
    const cancelShow = await api(staffCtx, "POST", `/api/events/${EVENT}`, { action: "cancel" });
    showCancelled = cancelShow.status === 200;
    const refundedOrders = (await admin.from("orders").select("escrow_status, tx_settle").eq("listing_id", L1)).data ?? [];
    check(
      "cancelling the show refunds every order on chain",
      showCancelled && refundedOrders.length === 2 && refundedOrders.every((o) => o.escrow_status === "Refunded" && !!o.tx_settle),
      JSON.stringify({ cancelShow, refundedOrders })
    );
    const settled = await escrowOf(expectedListing!);
    check("the escrow says refunded", settled.live?.status === "Refunded", JSON.stringify(settled).slice(0, 300));
    let back = await pc.readContract({ address: s.token as Address, abi: tokenAbi, functionName: "balanceOf", args: [wallet] });
    for (let i = 0; i < 10 && back !== before - kept; i++) {
      await sleep(1500);
      back = await pc.readContract({ address: s.token as Address, abi: tokenAbi, functionName: "balanceOf", args: [wallet] });
    }
    check("and the wallet has every cent back, but the share a ruling gave the seller", back === before - kept, `${before} -> ${back}, ${kept} to the seller`);
    await sleep(1500);
    check("the ledger still leaves it alone", (await admin.from("orders").select("ledger_status").eq("id", orderId).single()).data?.ledger_status === "Skipped");
  } finally {
    // A run that stopped half way still gives the wallet its money back before the rows go.
    if (!showCancelled && staffCtx) await api(staffCtx, "POST", `/api/events/${EVENT}`, { action: "cancel" }).catch(() => null);
    if (photos.length) await admin.storage.from("evidence").remove(photos);
    await admin.from("orders").delete().in("listing_id", LISTINGS);
    await admin.from("payments").delete().in("listing_id", LISTINGS);
    await admin.from("listings").delete().in("id", LISTINGS);
    await admin.from("tiers").delete().in("id", [TIER, TIER_BIG]);
    const gone = await admin.from("events").delete().eq("id", EVENT);
    const users = await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    check("cleanup", !gone.error && users.every((u) => !u.error), gone.error?.message ?? users.find((u) => u.error)?.error?.message);
    await browser.close();
  }
}

main()
  .catch((e) => check("run", false, (e as Error).message))
  .finally(() => {
    for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.note ? `\n     ${r.note}` : ""}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });
