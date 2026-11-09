/**
 * The NEAR Intents rail through the whole app, without real money: run by scripts/near-app.sh, which
 * starts a fork of Arbitrum One, deploys the contracts with the mainnet scripts, and points the local
 * check server at that fork. 1Click is the real one: its quotes are real, and nobody pays the address it
 * gives. The arrival of the money is stood in for by minting USDC to the order's receiver on the fork,
 * which on chain is all a delivery is.
 *
 *   1. Only the team pays for real: a plain account is refused.
 *   2. A hold for one listing, cancelled: its seat comes back.
 *   3. A payment: hold, address, money at the receiver, then the order, written once however often the
 *      page asks, with the extra sent straight back.
 *   4. A claim upheld in full: the refund goes through the receiver to the refund address.
 *   5. The emails say what this money is.
 *
 * It writes to the database the server uses: five accounts, a show abroad with two listings, the
 * payments, the order and its claim. Everything it made is deleted at the end.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { createPublicClient, createWalletClient, erc20Abi, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { intentFactoryAbi } from "../src/lib/chain/abi";
import { getListing } from "../src/lib/chain/escrow";
import type { Database } from "../src/lib/supabase/types";
import { openSignInLink } from "./lib/confirm.mjs";
import { loadTarget } from "./lib/target-env.mjs";

loadTarget("http://127.0.0.1:3001");
const BASE = process.env.BASE ?? "http://127.0.0.1:3001";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set: run scripts/near-app.sh`);
  return v;
};
const RPC = need("FORK_RPC");
const USDC = need("FORK_USDC") as Address;
const ESCROW = need("FORK_ESCROW") as Address;
const FACTORY = need("FORK_FACTORY") as Address;
const MINTER_KEY = need("FORK_MINTER_KEY") as Hex;
const DIR = need("EMAIL_DIR");
const RUN = Date.now().toString(36);
const EMAIL = (who: string) => `near-check-${RUN}-${who}@example.com`;
const [BUYER, MEMBER, STAFF, SELLER] = ["buyer", "member", "staff", "seller"].map(EMAIL);
const EVENT = "ev-zz-near";
const TIER = "t-zz-near";
const L1 = "ls-zz-near-1";
const L2 = "ls-zz-near-2";
const PRICE = 9_500_000;
const EXTRA = 370_000;
const BASE_USDC_ASSET = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
/** A refund address of our own for the run: a fresh one, so its balance is this run's alone. */
const REFUND_TO = privateKeyToAccount(`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as Hex).address;

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (ms: number) => new Date(ms).toISOString();

type Admin = ReturnType<typeof createClient<Database>>;
type Reply = { status: number; body: Record<string, unknown> };

const pc = createPublicClient({ chain: arbitrum, transport: http(RPC) });
const usdcOf = (who: Address) => pc.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [who] });

async function deliver(to: Address, amount: number) {
  const minter = createWalletClient({ account: privateKeyToAccount(MINTER_KEY), chain: arbitrum, transport: http(RPC) });
  const hash = await minter.writeContract({
    address: USDC,
    abi: [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const,
    functionName: "mint",
    args: [to, BigInt(amount)],
  });
  await pc.waitForTransactionReceipt({ hash });
}

async function signIn(admin: Admin, browser: Browser, email: string): Promise<BrowserContext> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = link.data.properties?.hashed_token;
  if (!hashed) throw new Error(`no sign-in link for ${email}: ${link.error?.message ?? "?"}`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await openSignInLink(page, `${BASE}/auth/confirm?token_hash=${hashed}&type=email`);
  await page.close();
  return ctx;
}

/** A request as the site's own page sends it: the routes that move money check that. */
async function api(ctx: BrowserContext, method: "GET" | "POST", p: string, body?: Record<string, unknown>): Promise<Reply> {
  const r = await ctx.request.fetch(`${BASE}${p}`, { method, data: body, headers: { "sec-fetch-site": "same-origin" }, failOnStatusCode: false });
  return { status: r.status(), body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

type Mail = { to: string; kind: string; ref: string; subject: string; text: string };
function inbox(): Mail[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      try {
        return [JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Mail];
      } catch {
        return [];
      }
    });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
  const admin = createClient<Database>(url, key, { auth: { persistSession: false } });
  const userIds: string[] = [];

  let cleaning: Promise<string | null> | null = null;
  const cleanup = () =>
    (cleaning ??= (async () => {
      if (userIds.length) await admin.from("profiles").update({ role: "member" }).in("id", userIds);
      const orders = (await admin.from("orders").select("id").in("listing_id", [L1, L2])).data?.map((o) => o.id) ?? [];
      if (orders.length) {
        await admin.from("disputes").delete().in("order_id", orders);
        await admin.from("orders").delete().in("id", orders);
      }
      if (userIds.length) await admin.from("payments").delete().in("buyer_id", userIds);
      await admin.from("listings").delete().in("id", [L1, L2]);
      await admin.from("tiers").delete().eq("id", TIER);
      const gone = await admin.from("events").delete().eq("id", EVENT);
      const users = await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
      return gone.error?.message ?? users.find((u) => u.error)?.error?.message ?? null;
    })());
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => void cleanup().finally(() => process.exit(130)));
  }

  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  try {
    const made = await Promise.all(
      [BUYER, MEMBER, STAFF, SELLER].map((email, i) => admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: ["Near Buyer", "Near Member", "Near Staff", "Near Seller"][i] } }))
    );
    const [buyer, member, staff, seller] = made.map((m) => m.data.user?.id);
    for (const id of [buyer, member, staff, seller]) if (id) userIds.push(id);
    if (!buyer || !member || !staff || !seller) throw new Error(`accounts: ${made.map((m) => m.error?.message ?? "ok").join(", ")}`);
    // Staff for this run: the buyer is on the team, a second staff account rules on the claim.
    const promoted = await admin.from("profiles").update({ role: "admin" }).in("id", [buyer, staff]).select("id");
    if (promoted.error || promoted.data.length !== 2) throw new Error(`staff: ${promoted.error?.message ?? "no profile"}`);

    const setup = [
      await admin.from("events").insert({ id: EVENT, title: "Uji NEAR", category: "Technology", starts_at: iso(Date.now() + 10 * 86_400_000), venue: "Queen Sirikit National Convention Center", city: "Bangkok", transfer_policy: "open", country: "TH", currency: "USDC" }),
      await admin.from("tiers").insert({ id: TIER, event_id: EVENT, name: "Early Bird", face_value: 19_000_000 }),
      await admin.from("listings").insert(
        [L1, L2].map((id) => ({ id, event_id: EVENT, tier_id: TIER, seller_id: seller, seller_name: "Near S.", ask_price: PRICE, face_value: 19_000_000, quantity: 1, splittable: false, status: "active" as const, created_at: iso(Date.now() - 2 * 86_400_000) }))
      ),
    ];
    const setupError = setup.find((r) => r.error)?.error;
    if (setupError) throw new Error(`setup: ${setupError.message}`);

    const [buyerCtx, memberCtx, staffCtx] = await Promise.all([BUYER, MEMBER, STAFF].map((e) => signIn(admin, browser, e)));
    const pay = (listingId: string) => ({ listingId, quantity: 1, originAsset: BASE_USDC_ASSET, refundTo: REFUND_TO, originRefund: REFUND_TO });

    // --- 1. Only the team
    const opts = await api(buyerCtx, "GET", "/api/near/options");
    check("the team sees the rail, on the fork's contracts", opts.body.rail === true && opts.body.team === true && String(opts.body.factory).toLowerCase() === FACTORY.toLowerCase(), JSON.stringify(opts.body).slice(0, 300));
    const plain = await api(memberCtx, "POST", "/api/payments/intents", pay(L1));
    check("a plain account is refused", plain.status === 403, JSON.stringify(plain));
    const memberOpts = await api(memberCtx, "GET", "/api/near/options");
    check("and is not offered it", memberOpts.body.team === false, JSON.stringify(memberOpts.body).slice(0, 200));

    // --- 2. A hold, cancelled
    const held = await api(buyerCtx, "POST", "/api/payments/intents", pay(L2));
    const heldId = String((held.body.payment as { id?: string } | undefined)?.id ?? "");
    const l2Held = (await admin.from("listings").select("quantity, status").eq("id", L2).single()).data;
    check("a hold takes the seat and gives an address to pay", held.status === 200 && !!(held.body.deposit as { address?: string } | undefined)?.address && l2Held?.status === "sold", JSON.stringify({ held: held.status, l2Held }));
    const cancelled = await api(buyerCtx, "POST", `/api/payments/${heldId}`, { action: "cancel" });
    const l2Back = (await admin.from("listings").select("quantity, status").eq("id", L2).single()).data;
    check("cancelled, the seat comes back", cancelled.status === 200 && l2Back?.quantity === 1 && l2Back.status === "active", JSON.stringify({ cancelled, l2Back }).slice(0, 300));

    // --- 3. A payment
    const start = await api(buyerCtx, "POST", "/api/payments/intents", pay(L1));
    const view = start.body as { payment?: { id: string; status: string }; receiver?: string; terms?: Record<string, string | number>; deposit?: { address: string; amount: string; symbol: string } };
    const id = view.payment?.id ?? "";
    check("a hold for the payment, with an address on Base", start.status === 200 && !!view.deposit?.address && view.deposit.symbol === "USDC", JSON.stringify(start).slice(0, 300));
    const t = view.terms ?? {};
    const receiver = (await pc.readContract({
      address: FACTORY,
      abi: intentFactoryAbi,
      functionName: "receiverOf",
      args: [{ listingId: t.listingId as Hex, seller: t.seller as Address, price: BigInt(t.price), eventEndsAt: Number(t.eventEndsAt), refundTo: t.refundTo as Address, refundAfter: Number(t.refundAfter) }],
    })) as Address;
    check("the terms shown give the receiver shown: anyone can recover the money with them", receiver.toLowerCase() === String(view.receiver).toLowerCase() && t.refundTo === REFUND_TO, JSON.stringify({ receiver, shown: view.receiver }));

    const early = await api(buyerCtx, "GET", `/api/payments/${id}/intents`);
    check("before the money arrives, still waiting", (early.body.payment as { status?: string } | undefined)?.status === "pending", JSON.stringify(early.body).slice(0, 200));

    await deliver(receiver, PRICE + EXTRA);
    let latest: Reply = early;
    for (let i = 0; i < 40; i++) {
      latest = await api(buyerCtx, "GET", `/api/payments/${id}/intents`);
      if ((latest.body.payment as { status?: string } | undefined)?.status === "paid") break;
      await sleep(3000);
    }
    const paid = latest.body.payment as { status?: string; orderId?: string } | undefined;
    check("once it arrives, the order is written", paid?.status === "paid" && !!paid.orderId, JSON.stringify(latest.body).slice(0, 300));
    const orderId = paid?.orderId ?? "";
    const again = await api(buyerCtx, "GET", `/api/payments/${id}/intents`);
    check("asking again gives the same order", (again.body.payment as { orderId?: string } | undefined)?.orderId === orderId);
    const orders = (await admin.from("orders").select("id, chain_id, contract_address, rail, buyer_wallet, escrow_status, onchain_listing_id").eq("listing_id", L1)).data ?? [];
    const o = orders[0];
    check(
      "one order, on Arbitrum One, in the escrow's window, refunds to the refund address",
      orders.length === 1 && o.chain_id === 42161 && o.contract_address?.toLowerCase() === ESCROW.toLowerCase() && o.rail === "usdc" && o.buyer_wallet === REFUND_TO && o.escrow_status === "DisputeWindow",
      JSON.stringify(orders)
    );
    const live = await getListing(pc as never, ESCROW, o?.onchain_listing_id as Hex);
    check("on chain: in its window, the receiver as the buyer", live.status === "DisputeWindow" && live.buyer.toLowerCase() === receiver.toLowerCase(), `${live.status} ${live.buyer}`);
    check("the extra went straight back to the refund address", (await usdcOf(REFUND_TO)) === BigInt(EXTRA), String(await usdcOf(REFUND_TO)));
    const sold = (await admin.from("listings").select("quantity, status").eq("id", L1).single()).data;
    check("the listing is sold", sold?.status === "sold", JSON.stringify(sold));

    // --- 4. A claim upheld in full
    const claim = await api(buyerCtx, "POST", `/api/orders/${orderId}`, { action: "dispute", reason: "NOT_DELIVERED", note: "The seller never sent the ticket." });
    check("the buyer files a claim, and the contract freezes the payout", claim.status === 200 && (await getListing(pc as never, ESCROW, o.onchain_listing_id as Hex)).disputed, JSON.stringify(claim));
    const ruled = await api(staffCtx, "POST", `/api/orders/${orderId}`, { action: "verdict", remedy: "REFUND_FULL" });
    const after = await getListing(pc as never, ESCROW, o.onchain_listing_id as Hex);
    check("staff refund it in full, on chain", ruled.status === 200 && after.status === "Refunded", JSON.stringify(ruled).slice(0, 300));
    check("the refund reached the refund address through the receiver", (await usdcOf(REFUND_TO)) === BigInt(PRICE + EXTRA), String(await usdcOf(REFUND_TO)));
    check("nothing is left at the receiver or in the escrow", (await usdcOf(receiver)) === BigInt(0) && (await usdcOf(ESCROW)) === BigInt(0));
    const refunded = (await admin.from("orders").select("escrow_status").eq("id", orderId).single()).data;
    check("the order says so", refunded?.escrow_status === "Refunded", JSON.stringify(refunded));

    // --- 5. The emails
    await sleep(2500);
    const mail = inbox().filter((m) => [BUYER, SELLER].includes(m.to));
    const paidMail = mail.find((m) => m.kind === "order-paid" && m.to === BUYER);
    check("the buyer's email says this is real USDC for the team's demo, not test money", !!paidMail && paidMail.text.includes("real USDC on Arbitrum One") && !paidMail.text.includes("Testnet demo"), paidMail?.text.slice(0, 400));
    check("the seller hears it sold", mail.some((m) => m.kind === "order-sold" && m.to === SELLER));

    await Promise.all([buyerCtx, memberCtx, staffCtx].map((c) => c.close()));
  } catch (e) {
    check("check ran to the end", false, (e as Error).message.split("\n")[0].slice(0, 240));
  } finally {
    const error = await cleanup();
    const left = await Promise.all([
      admin.from("listings").select("id").in("id", [L1, L2]),
      admin.from("events").select("id").eq("id", EVENT),
      admin.from("orders").select("id").in("listing_id", [L1, L2]),
      userIds.length ? admin.from("payments").select("id").in("buyer_id", userIds) : Promise.resolve({ data: [] }),
    ]);
    check("cleanup: the show, its listings, payments, order and accounts are gone", !error && left.every((r) => !r.data?.length), error ?? JSON.stringify(left.map((r) => r.data?.length)));
    await browser.close();
  }
}

main()
  .catch((e) => check("check ran", false, (e as Error).message))
  .finally(() => {
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks pass`);
    process.exit(failed ? 1 : 0);
  });
