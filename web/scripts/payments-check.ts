/**
 * QRIS through Xendit's test mode, end to end (docs/09 §6), with two accounts and a show made for
 * the test. The buyer presses Pay: the seats are held and a QRIS opens. Paying it through Xendit's
 * simulator writes exactly one order, however often the page and the webhook ask; a forged webhook
 * is refused. Cancelling, expiring and switching to other seats each give the seats back; a total
 * above the QRIS ceiling is refused before anything is held; nobody else can read a hold. Money
 * that arrives after its hold closed takes the seats again when they are free, and waits for a
 * refund when they are not. With WEBHOOK_LIVE=1 (BASE is the address registered at Xendit), money
 * paid at Xendit alone has to reach the hold through Xendit's own webhook.
 *
 * The two accounts are made for the run and signed in with an admin link, so no email is sent and
 * no demo key is needed; everything it made, accounts included, is deleted at the end. It writes to
 * the database the server uses and calls Xendit in test mode, so run it only where that is fine,
 * against a server with the same test key and webhook token (web/.env.local supplies them):
 *
 *   BASE=http://localhost:3000 npm run payments:check
 *   BASE=https://lummy.id WEBHOOK_LIVE=1 npm run payments:check
 */
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import type { Database } from "../src/lib/supabase/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // checked below
}
const BASE = process.env.BASE ?? "http://localhost:3000";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const XENDIT_KEY = process.env.XENDIT_SECRET_KEY ?? "";
const TOKEN = process.env.XENDIT_WEBHOOK_TOKEN ?? "";
const WEBHOOK_LIVE = process.env.WEBHOOK_LIVE === "1";
const RUN = Date.now().toString(36);
const BUYER_EMAIL = `payments-check-${RUN}-buyer@example.com`;
const SELLER_EMAIL = `payments-check-${RUN}-seller@example.com`;
const EVENT = "ev-zz-pay";
const TIER = "t-zz-pay";
const TIER_VIP = "t-zz-pay-vip";
const L1 = "ls-zz-pay-1"; // two seats, sold one by one
const L2 = "ls-zz-pay-2"; // one seat
const L_BIG = "ls-zz-pay-big"; // above the QRIS ceiling
const LISTINGS = [L1, L2, L_BIG];
const PRICE = 550_000;
const TOTAL = PRICE + Math.max(Math.round(PRICE * 0.05), 25_000) + 12_000;

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Admin = ReturnType<typeof createClient<Database>>;
type Reply = { status: number; body: Record<string, unknown> };

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
  const r = await ctx.request.fetch(`${BASE}${path}`, { method, data: body, failOnStatusCode: false });
  return { status: r.status(), body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Xendit's own webhook, from outside any account, like the real one. */
async function webhook(token: string, data: Record<string, unknown>): Promise<Reply> {
  const r = await fetch(`${BASE}/api/payments/xendit/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-callback-token": token },
    body: JSON.stringify({ event: "payment.capture", business_id: "test", created: new Date().toISOString(), data }),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Pays a QRIS straight at Xendit, as a buyer whose page is closed (or whose hold already closed). */
async function payAtXendit(prId: string, amount: number) {
  const r = await fetch(`https://api.xendit.co/v3/payment_requests/${prId}/simulate`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${XENDIT_KEY}:`).toString("base64")}`,
      "api-version": "2024-11-11",
      "content-type": "application/json",
    },
    body: JSON.stringify({ amount }),
  });
  if (!r.ok) throw new Error(`Xendit simulate ${r.status}`);
  // Xendit settles a simulated payment within a second or two.
  await sleep(3000);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (web/.env.local)");
  if (!XENDIT_KEY.startsWith("xnd_development_")) throw new Error("needs XENDIT_SECRET_KEY, a test key (xnd_development_...)");
  if (!TOKEN) throw new Error("needs XENDIT_WEBHOOK_TOKEN, the same one the server has");
  const admin = createClient<Database>(url, key, { auth: { persistSession: false } });

  const listing = async (id: string) => (await admin.from("listings").select("status, quantity").eq("id", id).single()).data;
  const payment = async (id: string) => (await admin.from("payments").select("*").eq("id", id).single()).data;
  const ordersOf = async (paymentId: string) => (await admin.from("orders").select("id, buyer_id, amount, quantity, escrow_status").eq("payment_id", paymentId)).data ?? [];
  /** Moves a hold's clock back, as if its time ran out ten minutes ago. */
  const ageHold = (id: string) =>
    admin.from("payments").update({ expires_at: new Date(Date.now() - 10 * 60_000).toISOString(), checked_at: null }).eq("id", id);

  const userIds: string[] = [];
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  try {
    // --- Two accounts of our own: one buys, one sells (and later tries to read the buyer's hold).
    const made = await Promise.all(
      [BUYER_EMAIL, SELLER_EMAIL].map((email, i) =>
        admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: i ? "Payments Seller" : "Payments Buyer" } })
      )
    );
    const buyer = made[0].data.user?.id;
    const seller = made[1].data.user?.id;
    for (const id of [buyer, seller]) if (id) userIds.push(id);
    if (!buyer || !seller) throw new Error(`accounts: ${made.map((m) => m.error?.message ?? "ok").join(", ")}`);

    // --- A show of our own with three listings on sale. A multi-row insert sends null for a
    // column one row leaves out, so every row names them all.
    const start = Date.now() + 10 * 86_400_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const setup = [
      await admin.from("events").insert({ id: EVENT, title: "Uji QRIS", category: "Music", starts_at: iso(start), venue: "Istora", city: "Jakarta", transfer_policy: "open" }),
      await admin.from("tiers").insert([
        { id: TIER, event_id: EVENT, name: "Festival", face_value: 500_000 },
        { id: TIER_VIP, event_id: EVENT, name: "VIP", face_value: 8_000_000 },
      ]),
      await admin.from("listings").insert([
        { id: L1, event_id: EVENT, tier_id: TIER, seller_id: seller, seller_name: "Payments S.", ask_price: PRICE, face_value: 500_000, quantity: 2, splittable: true, status: "active" },
        { id: L2, event_id: EVENT, tier_id: TIER, seller_id: seller, seller_name: "Payments S.", ask_price: PRICE, face_value: 500_000, quantity: 1, splittable: false, status: "active" },
        { id: L_BIG, event_id: EVENT, tier_id: TIER_VIP, seller_id: seller, seller_name: "Payments S.", ask_price: 9_800_000, face_value: 8_000_000, quantity: 1, splittable: false, status: "active" },
      ]),
    ];
    const setupError = setup.find((r) => r.error)?.error;
    if (setupError) throw new Error(`setup: ${setupError.message}`);

    const config = await (await fetch(`${BASE}/api/payments`)).json();
    check("QRIS is on, in test mode", config.enabled === true && config.testMode === true, JSON.stringify(config));

    const buyerCtx = await signIn(admin, browser, BUYER_EMAIL);
    const sellerCtx = await signIn(admin, browser, SELLER_EMAIL);
    const probe = await api(buyerCtx, "GET", "/api/payments/pay-000000000000");
    check("the buyer is signed in (a hold that does not exist reads 404, not 401)", probe.status === 404, JSON.stringify(probe));

    // --- Pay holds a seat and opens a QRIS.
    const first = await api(buyerCtx, "POST", "/api/payments", { listingId: L1, quantity: 1 });
    const p1 = String(first.body.id ?? "");
    check(
      "Pay holds the seat and opens a QRIS for the full total",
      first.status === 200 && first.body.status === "pending" && first.body.amount === TOTAL && !!first.body.qrString && first.body.testMode === true,
      JSON.stringify(first)
    );
    check("one of the two seats is held", (await listing(L1))?.quantity === 1, JSON.stringify(await listing(L1)));
    const again = await api(buyerCtx, "POST", "/api/payments", { listingId: L1, quantity: 1 });
    check("pressing Pay again returns the same hold", again.status === 200 && again.body.id === p1, JSON.stringify(again));
    check("nothing else was held", (await listing(L1))?.quantity === 1);
    const read = await api(buyerCtx, "GET", `/api/payments/${p1}`);
    check("the page reads it as waiting", read.status === 200 && read.body.status === "pending", JSON.stringify(read));

    // --- Paid through Xendit's simulator: one order.
    const paid = await api(buyerCtx, "POST", `/api/payments/${p1}`, { action: "simulate" });
    check("the simulator pays it and the order is written", paid.status === 200 && paid.body.status === "paid" && typeof paid.body.orderId === "string", JSON.stringify(paid));
    const o1 = await ordersOf(p1);
    check(
      "exactly one order, for the buyer, at the listing price, held in escrow",
      o1.length === 1 && o1[0].buyer_id === buyer && o1[0].amount === PRICE && o1[0].quantity === 1 && o1[0].escrow_status === "Funded",
      JSON.stringify(o1)
    );
    const row1 = await payment(p1);
    check(
      "the hold records Xendit's payment",
      row1?.status === "paid" && !!row1.paid_at && (row1.provider_payment_id ?? "").startsWith("py-"),
      JSON.stringify({ status: row1?.status, paid_at: row1?.paid_at, provider_payment_id: row1?.provider_payment_id })
    );
    const reread1 = await api(buyerCtx, "GET", `/api/payments/${p1}`);
    check("reading it again points at the same order", reread1.body.status === "paid" && reread1.body.orderId === o1[0]?.id, JSON.stringify(reread1));

    // --- The webhook: forged is refused, genuine changes nothing more, unknown is acknowledged.
    const prId = row1?.provider_ref ?? "";
    const forged = await webhook("not-the-token", { payment_request_id: prId, reference_id: p1, status: "SUCCEEDED" });
    check("a webhook without the token is refused", forged.status === 401, JSON.stringify(forged));
    const genuine = await webhook(TOKEN, { payment_request_id: prId, reference_id: p1, status: "SUCCEEDED" });
    check("the genuine webhook is accepted", genuine.status === 200 && genuine.body.status === "paid", JSON.stringify(genuine));
    check("and still one order", (await ordersOf(p1)).length === 1);
    const stranger = await webhook(TOKEN, { payment_request_id: "pr-00000000-0000-4000-8000-000000000000", reference_id: "pay-000000000000" });
    check("a webhook for a payment that is not ours is acknowledged and ignored", stranger.status === 200 && stranger.body.ignored === true, JSON.stringify(stranger));

    // --- Cancelling gives the seat back.
    const second = await api(buyerCtx, "POST", "/api/payments", { listingId: L1, quantity: 1 });
    const p2 = String(second.body.id ?? "");
    check("the last seat is held", second.status === 200 && (await listing(L1))?.status === "sold", JSON.stringify(second));
    const cancelled = await api(buyerCtx, "POST", `/api/payments/${p2}`, { action: "cancel" });
    check("cancelling closes the hold", cancelled.status === 200 && cancelled.body.status === "canceled", JSON.stringify(cancelled));
    const afterCancel = await listing(L1);
    check("and the seat is back on sale", afterCancel?.status === "active" && afterCancel.quantity === 1, JSON.stringify(afterCancel));

    // --- A hold past its time, still open at Xendit: the page reading it shuts it and gives the seat back.
    const third = await api(buyerCtx, "POST", "/api/payments", { listingId: L1, quantity: 1 });
    const p3 = String(third.body.id ?? "");
    await ageHold(p3);
    const expired = await api(buyerCtx, "GET", `/api/payments/${p3}`);
    check("an overdue hold reads as expired", expired.status === 200 && expired.body.status === "expired" && expired.body.qrString === null, JSON.stringify(expired));
    check("and its seat is back", (await listing(L1))?.quantity === 1 && (await listing(L1))?.status === "active");

    // --- Starting on other seats closes the first hold and gives its seat back.
    const holdA = await api(buyerCtx, "POST", "/api/payments", { listingId: L1, quantity: 1 });
    const pA = String(holdA.body.id ?? "");
    check("a hold on the last seat of L1", holdA.status === 200 && (await listing(L1))?.status === "sold", JSON.stringify(holdA));
    const holdB = await api(buyerCtx, "POST", "/api/payments", { listingId: L2, quantity: 1 });
    const pB = String(holdB.body.id ?? "");
    check("switching to L2 holds it", holdB.status === 200 && holdB.body.status === "pending" && (await listing(L2))?.status === "sold", JSON.stringify(holdB));
    check("and closes the L1 hold, its seat back", (await payment(pA))?.status === "canceled" && (await listing(L1))?.status === "active", JSON.stringify(await payment(pA)));

    // --- Above the QRIS ceiling: refused before anything is held, and the open hold stays.
    const big = await api(buyerCtx, "POST", "/api/payments", { listingId: L_BIG, quantity: 1 });
    check("a total above Rp10,000,000 is refused", big.status === 400, JSON.stringify(big));
    const bigHolds = await admin.from("payments").select("id").eq("listing_id", L_BIG);
    check("nothing was held for it", (bigHolds.data ?? []).length === 0 && (await listing(L_BIG))?.status === "active");
    check("and the buyer's open hold is left alone", (await payment(pB))?.status === "pending");
    await api(buyerCtx, "POST", `/api/payments/${pB}`, { action: "cancel" });
    check("cancelled, L2 is back on sale", (await payment(pB))?.status === "canceled" && (await listing(L2))?.status === "active");

    // --- The sweep (catalogue and cron) releases an overdue hold without anyone reading it.
    const fourth = await api(buyerCtx, "POST", "/api/payments", { listingId: L1, quantity: 1 });
    const p4 = String(fourth.body.id ?? "");
    await ageHold(p4);
    const swept = await admin.rpc("expire_payments", { p_grace_seconds: 300 });
    check("the sweep closes the overdue hold", !swept.error && (swept.data ?? []).includes(p4), JSON.stringify(swept));
    check("and its seat is back", (await listing(L1))?.status === "active" && (await listing(L1))?.quantity === 1);

    // --- Money that arrives after its hold closed takes the seat again while it is free.
    await payAtXendit((await payment(p4))?.provider_ref ?? "", TOTAL);
    const late = await webhook(TOKEN, { payment_request_id: (await payment(p4))?.provider_ref, reference_id: p4 });
    check("late money finds its seat free: paid", late.status === 200 && late.body.status === "paid", JSON.stringify(late));
    check("with its one order, and the seat taken again", (await ordersOf(p4)).length === 1 && (await listing(L1))?.status === "sold", JSON.stringify(await listing(L1)));

    // --- Late money whose seat went to someone else waits for a refund, and makes no order.
    const fifth = await api(buyerCtx, "POST", "/api/payments", { listingId: L2, quantity: 1 });
    const p5 = String(fifth.body.id ?? "");
    await ageHold(p5);
    await admin.rpc("expire_payments", { p_grace_seconds: 300 });
    check("a hold on L2 runs out, its seat back", (await payment(p5))?.status === "expired" && (await listing(L2))?.status === "active");
    const sixth = await api(buyerCtx, "POST", "/api/payments", { listingId: L2, quantity: 1 });
    const p6 = String(sixth.body.id ?? "");
    check("a new hold takes that seat", sixth.status === 200 && (await listing(L2))?.status === "sold", JSON.stringify(sixth));
    await payAtXendit((await payment(p5))?.provider_ref ?? "", TOTAL);
    const lost = await webhook(TOKEN, { payment_request_id: (await payment(p5))?.provider_ref, reference_id: p5 });
    check("late money whose seat is held by another: unfulfilled", lost.status === 200 && lost.body.status === "unfulfilled", JSON.stringify(lost));
    check("no order for it", (await ordersOf(p5)).length === 0);
    const cancel6 = await api(buyerCtx, "POST", `/api/payments/${p6}`, { action: "cancel" });
    check("the open hold cancels, its seat back", cancel6.body.status === "canceled" && (await listing(L2))?.status === "active", JSON.stringify(cancel6));

    // --- Someone else cannot read or touch the buyer's hold.
    const peek = await api(sellerCtx, "GET", `/api/payments/${p1}`);
    const poke = await api(sellerCtx, "POST", `/api/payments/${p6}`, { action: "cancel" });
    check("another account reads it as missing", peek.status === 404 && poke.status === 404, JSON.stringify({ peek, poke }));

    // --- Paid at Xendit with no page open: only Xendit's webhook can move it now.
    if (WEBHOOK_LIVE) {
      const live = await api(buyerCtx, "POST", "/api/payments", { listingId: L2, quantity: 1 });
      const pw = String(live.body.id ?? "");
      await payAtXendit((await payment(pw))?.provider_ref ?? "", TOTAL);
      let status = (await payment(pw))?.status ?? "";
      for (let i = 0; i < 20 && status !== "paid"; i++) {
        await sleep(1500);
        status = (await payment(pw))?.status ?? "";
      }
      check("Xendit's own webhook reaches the site and writes the order", status === "paid" && (await ordersOf(pw)).length === 1, status);
    }
    await Promise.all([buyerCtx.close(), sellerCtx.close()]);
  } catch (e) {
    check("check ran to the end", false, (e as Error).message.split("\n")[0].slice(0, 200));
  } finally {
    await admin.from("orders").delete().in("listing_id", LISTINGS);
    await admin.from("payments").delete().in("listing_id", LISTINGS);
    await admin.from("listings").delete().in("id", LISTINGS);
    await admin.from("tiers").delete().in("id", [TIER, TIER_VIP]);
    const gone = await admin.from("events").delete().eq("id", EVENT);
    const users = await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    const left = await admin.from("payments").select("id").in("listing_id", LISTINGS);
    const userError = users.find((u) => u.error)?.error;
    check("cleanup: the test show, its holds, orders and accounts are gone", !gone.error && !userError && (left.data?.length ?? 1) === 0, (gone.error ?? userError)?.message);
    await browser.close();
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note.slice(0, 200)})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
