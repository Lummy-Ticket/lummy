/**
 * Lummy's emails (lib/email), end to end, against a server that writes each one into a folder
 * instead of sending it: start it with EMAIL_TRANSPORT=file and EMAIL_DIR, and give this check the
 * same EMAIL_DIR. Nothing leaves the machine, so the run's accounts can sit on example.com.
 *
 * Five accounts and a show are made for the run. The buyer is staff for the run, so it buys through
 * the straight order path with no QRIS; the order row and the email are the same either way, and a
 * QRIS payment here would also wake lummy.id through Xendit's webhook, which shares the database and
 * could write the order (and so not send this server's email) first. A demo account (demo.lummy.id)
 * buys and follows too, and must never receive anything.
 *
 *   1. Each order paid emails its buyer, with the total and a link to the order.
 *   2. A claim emails the seller, with a link to the seller page, and the buyer a receipt; staff rule,
 *      and both hear the ruling. Neither email names the other side.
 *   3. Alerts through /api/alerts: a listing staff clear from review, and later one posted live,
 *      email each follower once, however many of their alerts match; not its seller, not someone
 *      following another tier, not someone who stopped following. In between, the throttle: the
 *      same seller again within a day (even after withdrawing and posting again), or anyone within
 *      six hours of the show's last live listing, tells nobody. Time is moved by setting the show's
 *      listings back.
 *   4. Staff cancel the show: the order still held is refunded and its buyer hears it; the order
 *      already settled by the ruling sends nothing.
 *   5. Then the whole run's mail is counted: exactly the emails above, nothing twice, nothing to the
 *      demo account or to staff, and no em-dash in any of them.
 *
 * It writes to the database the server uses; everything it made is deleted at the end, its accounts
 * and its emails in EMAIL_DIR included.
 *
 *   EMAIL_DIR=/tmp/lummy-emails BASE=http://127.0.0.1:3001 npm run email:check
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { deliverable } from "../src/lib/email/send";
import type { Database } from "../src/lib/supabase/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // checked below
}
const BASE = process.env.BASE ?? "http://127.0.0.1:3001";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const DIR = process.env.EMAIL_DIR ?? "";
const SITE = "https://lummy.id";
const RUN = Date.now().toString(36);
const BUYER_EMAIL = `email-check-${RUN}-buyer@example.com`;
const SELLER_EMAIL = `email-check-${RUN}-seller@example.com`;
const STAFF_EMAIL = `email-check-${RUN}-staff@example.com`;
const FOLLOWER_EMAIL = `email-check-${RUN}-follower@example.com`;
const DEMO_EMAIL = `email-check-${RUN}@demo.lummy.id`;
const EMAILS = [BUYER_EMAIL, SELLER_EMAIL, STAFF_EMAIL, FOLLOWER_EMAIL, DEMO_EMAIL];
const EVENT = "ev-zz-mail";
const TITLE = "Uji Email";
const TIER_A = "t-zz-mail-a"; // the orders
const TIER_B = "t-zz-mail-b"; // listings posted live
const TIER_C = "t-zz-mail-c"; // a listing held for review, then cleared
const L1 = "ls-zz-mail-1"; // bought, claimed, ruled
const L2 = "ls-zz-mail-2"; // bought, still held when the show is cancelled
const L3 = "ls-zz-mail-3"; // bought by the demo account
const PRICE = 550_000;
const TOTAL = PRICE + Math.max(Math.round(PRICE * 0.05), 25_000); // the e-stamp is 0 until a provider adds it

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Admin = ReturnType<typeof createClient<Database>>;
type Reply = { status: number; body: Record<string, unknown> };
type Mail = { file: string; from: string; replyTo: string; to: string; subject: string; kind: string; ref: string; text: string; html: string };

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

async function api(ctx: BrowserContext, method: "GET" | "POST", p: string, body?: Record<string, unknown>): Promise<Reply> {
  const r = await ctx.request.fetch(`${BASE}${p}`, { method, data: body, failOnStatusCode: false });
  return { status: r.status(), body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Every email the server wrote to this run's accounts so far. */
function inbox(): Mail[] {
  if (!fs.existsSync(DIR)) return [];
  const out: Mail[] = [];
  for (const file of fs.readdirSync(DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as Omit<Mail, "file">;
      if (EMAILS.includes(m.to)) out.push({ ...m, file });
    } catch {
      // half written: read again next time
    }
  }
  return out;
}

/** Emails are written after the answer is sent, so wait for them a little. */
async function waitFor(match: (m: Mail) => boolean, count = 1): Promise<Mail[]> {
  let found = inbox().filter(match);
  for (let i = 0; i < 40 && found.length < count; i++) {
    await sleep(250);
    found = inbox().filter(match);
  }
  return found;
}

const linked = (m: Mail | undefined, href: string) => !!m && m.text.includes(href) && m.html.includes(`href="${href}"`);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (web/.env.local)");
  if (!DIR) throw new Error("needs EMAIL_DIR, the folder the server writes its emails to (EMAIL_TRANSPORT=file)");
  const admin = createClient<Database>(url, key, { auth: { persistSession: false } });

  // --- Who may receive one, before anything runs: never a demo account, an example address only
  // into this folder.
  check(
    "the rule: no demo account ever, example.com only into the check's folder, a real address always",
    !deliverable(DEMO_EMAIL, true) && !deliverable("someone@example.com", false) && deliverable("someone@example.com", true) && deliverable("fan@gmail.com", false),
    "deliverable() disagrees"
  );

  const userIds: string[] = [];
  /**
   * Everything the run made goes, accounts first: two of them are staff for the run, in the shared
   * database. Runs once, at the end or when the run is stopped (Ctrl-C, a closed terminal, a kill
   * that can be caught).
   */
  let cleaning: Promise<{ error?: string; alertsLeft: number }> | null = null;
  const cleanup = () =>
    (cleaning ??= (async () => {
      if (userIds.length) await admin.from("profiles").update({ role: "member" }).in("id", userIds);
      // The orders go before the accounts they name.
      const listings = (await admin.from("listings").select("id").eq("event_id", EVENT)).data?.map((l) => l.id) ?? [];
      if (listings.length) {
        await admin.from("orders").delete().in("listing_id", listings);
        await admin.from("listings").delete().in("id", listings);
      }
      await admin.from("tiers").delete().in("id", [TIER_A, TIER_B, TIER_C]);
      const gone = await admin.from("events").delete().eq("id", EVENT);
      const users = await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
      const error = gone.error?.message ?? users.find((u) => u.error)?.error?.message;
      // Late emails of this run would land after the accounts are gone: give them a moment, then clear.
      await sleep(1000);
      for (const m of inbox()) fs.rmSync(path.join(DIR, m.file), { force: true });
      const alertsLeft = userIds.length ? ((await admin.from("alert_subscriptions").select("id").in("user_id", userIds)).data?.length ?? 1) : 0;
      return { error, alertsLeft };
    })());
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => {
      console.error(`\n${signal}: cleaning up the run's accounts and show first`);
      void cleanup().finally(() => process.exit(130));
    });
  }

  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  try {
    const names = ["Email Buyer", "Email Seller", "Email Staff", "Email Follower", "Email Demo"];
    const made = await Promise.all(EMAILS.map((email, i) => admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: names[i] } })));
    const [buyer, seller, staff, follower, demo] = made.map((m) => m.data.user?.id);
    for (const id of [buyer, seller, staff, follower, demo]) if (id) userIds.push(id);
    if (!buyer || !seller || !staff || !follower || !demo) throw new Error(`accounts: ${made.map((m) => m.error?.message ?? "ok").join(", ")}`);
    // Staff for this run only: the buyer takes the straight order path, staff rule and cancel.
    const promoted = await admin.from("profiles").update({ role: "admin" }).in("id", [buyer, staff]).select("id");
    if (promoted.error || promoted.data.length !== 2) throw new Error(`staff: ${promoted.error?.message ?? "no profile"}`);

    // --- A show of our own, ten days out (so no listing is late), with three listings to buy.
    const iso = (ms: number) => new Date(ms).toISOString();
    const setup = [
      await admin.from("events").insert({ id: EVENT, title: TITLE, category: "Music", starts_at: iso(Date.now() + 10 * 86_400_000), venue: "Istora", city: "Jakarta", transfer_policy: "open" }),
      await admin.from("tiers").insert([
        { id: TIER_A, event_id: EVENT, name: "Festival", face_value: 500_000 },
        { id: TIER_B, event_id: EVENT, name: "VIP", face_value: 1_000_000 },
        { id: TIER_C, event_id: EVENT, name: "Tribun", face_value: 300_000 },
      ]),
      // Posted two days ago, so they hold back none of the alerts below.
      await admin.from("listings").insert(
        [L1, L2, L3].map((id) => ({
          id, event_id: EVENT, tier_id: TIER_A, seller_id: seller, seller_name: "Email S.", ask_price: PRICE, face_value: 500_000, quantity: 1, splittable: false,
          status: "active" as const, created_at: iso(Date.now() - 2 * 86_400_000),
        }))
      ),
    ];
    const setupError = setup.find((r) => r.error)?.error;
    if (setupError) throw new Error(`setup: ${setupError.message}`);

    const [buyerCtx, sellerCtx, staffCtx, followerCtx, demoCtx] = await Promise.all(EMAILS.map((e) => signIn(admin, browser, e)));

    // --- 1. Paid: the buyer hears it, with the total and the order's own page.
    const o1 = await api(buyerCtx, "POST", "/api/orders", { listingId: L1, quantity: 1 });
    const o2 = await api(buyerCtx, "POST", "/api/orders", { listingId: L2, quantity: 1 });
    const o3 = await api(demoCtx, "POST", "/api/orders", { listingId: L3, quantity: 1 });
    const id1 = String(o1.body.id ?? "");
    const id2 = String(o2.body.id ?? "");
    const id3 = String(o3.body.id ?? "");
    check("three orders are written (two by the buyer, one by the demo account)", o1.status === 200 && o2.status === 200 && o3.status === 200, JSON.stringify({ o1, o2, o3 }));
    // The buyer was staff only to take the straight path; nothing below needs it.
    await admin.from("profiles").update({ role: "member" }).eq("id", buyer);

    const [paid1] = await waitFor((m) => m.kind === "order-paid" && m.ref === id1);
    check(
      "order paid: the buyer gets it, if this server writes emails to EMAIL_DIR",
      paid1?.to === BUYER_EMAIL,
      paid1 ? JSON.stringify({ to: paid1.to }) : `nothing in ${DIR}: is the server started with EMAIL_TRANSPORT=file and this EMAIL_DIR?`
    );
    check("its subject: Indonesian first, then English, then the show", paid1?.subject === `Pembayaran diterima / Payment received: ${TITLE}`, paid1?.subject);
    check("it links to the order on lummy.id, in the HTML and the text", linked(paid1, `${SITE}/tickets/${id1}`), paid1?.text.slice(0, 300));
    check(
      "it says the total paid in rupiah, Indonesian above English, and that no real money moves yet",
      !!paid1 &&
        paid1.text.includes(`Rp${TOTAL.toLocaleString("id-ID")}`) &&
        paid1.text.includes(`Rp${TOTAL.toLocaleString("en-US")}`) &&
        paid1.text.indexOf("Pembayaranmu sudah kami terima") < paid1.text.indexOf("We have your payment") &&
        paid1.text.includes("no real money moves yet"),
      paid1?.text.slice(0, 600)
    );
    check("it is sent with a reply address and a sender", !!paid1 && paid1.replyTo === "team@lummy.id" && paid1.from.includes("@lummy.id"), JSON.stringify({ from: paid1?.from, replyTo: paid1?.replyTo }));
    const paid2 = await waitFor((m) => m.kind === "order-paid" && m.ref === id2);
    check("the second order gets its own", paid2.length === 1 && paid2[0].to === BUYER_EMAIL, JSON.stringify(paid2.map((m) => m.to)));

    // --- 2. A claim, then the ruling.
    const claim = await api(buyerCtx, "POST", `/api/orders/${id1}`, { action: "dispute", reason: "NOT_DELIVERED", note: "uji email" });
    check("the buyer files a claim", claim.status === 200, JSON.stringify(claim));
    const [toSeller] = await waitFor((m) => m.kind === "claim-seller" && m.ref === id1);
    check("the seller hears about the claim", toSeller?.to === SELLER_EMAIL && toSeller.subject === `Ada klaim untuk penjualanmu / A claim on your sale: ${TITLE}`, JSON.stringify({ to: toSeller?.to, subject: toSeller?.subject }));
    check("with a link to the seller page, where the claim is answered", linked(toSeller, `${SITE}/seller`), toSeller?.text.slice(0, 300));
    check(
      "and nothing about the buyer: no name, no address, no note",
      !!toSeller && !/Email Buyer|email-check-[a-z0-9]+-buyer|uji email/.test(toSeller.text + toSeller.html) && toSeller.text.includes("tiket tidak pernah diserahkan"),
      toSeller?.text.slice(0, 400)
    );
    const [receipt] = await waitFor((m) => m.kind === "claim-buyer" && m.ref === id1);
    check("the buyer gets a receipt for the claim, linking to the order", receipt?.to === BUYER_EMAIL && linked(receipt, `${SITE}/tickets/${id1}`), JSON.stringify({ to: receipt?.to }));

    const ruled = await api(staffCtx, "POST", `/api/orders/${id1}`, { action: "verdict", remedy: "REFUND_FULL" });
    check("staff rule a full refund", ruled.status === 200, JSON.stringify(ruled));
    const [rulingBuyer] = await waitFor((m) => m.kind === "ruling-buyer" && m.ref === id1);
    const [rulingSeller] = await waitFor((m) => m.kind === "ruling-seller" && m.ref === id1);
    check(
      "the buyer hears the ruling: a full refund, the amount back, the order's link",
      rulingBuyer?.to === BUYER_EMAIL && rulingBuyer.subject === `Putusan klaim / Claim ruling: ${TITLE}` && rulingBuyer.text.includes("Refund penuh") &&
        rulingBuyer.text.includes(`Kembali ke kamu: Rp${PRICE.toLocaleString("id-ID")}`) && linked(rulingBuyer, `${SITE}/tickets/${id1}`),
      rulingBuyer?.text.slice(0, 500)
    );
    check(
      "the seller hears it too: nothing passed on, the seller page's link",
      rulingSeller?.to === SELLER_EMAIL && rulingSeller.text.includes("Diteruskan ke kamu: Rp0") && linked(rulingSeller, `${SITE}/seller`),
      rulingSeller?.text.slice(0, 500)
    );

    // --- 3. Alerts, kept on the server for accounts.
    const signedOut = await fetch(`${BASE}/api/alerts`);
    check("alerts need an account", signedOut.status === 401, String(signedOut.status));
    const follow = (ctx: BrowserContext, tierId?: string) => api(ctx, "POST", "/api/alerts", { action: "subscribe", eventId: EVENT, ...(tierId ? { tierId } : {}) });
    const fShow = await follow(followerCtx);
    const fTier = await follow(followerCtx, TIER_B);
    const fAgain = await follow(followerCtx);
    const bTier = await follow(buyerCtx, TIER_B);
    const dShow = await follow(demoCtx);
    const sShow = await follow(sellerCtx);
    const alertId = (r: Reply) => String((r.body.alert as { id?: string } | undefined)?.id ?? "");
    check(
      "the follower follows the show and the VIP tier, the buyer only VIP, the demo account and the seller the show",
      [fShow, fTier, bTier, dShow, sShow].every((r) => r.status === 200 && alertId(r)),
      JSON.stringify([fShow, fTier, bTier, dShow, sShow].map((r) => r.status))
    );
    check("following twice keeps one alert", fAgain.status === 200 && alertId(fAgain) === alertId(fShow), JSON.stringify(fAgain));
    const otherShow = await api(followerCtx, "POST", "/api/alerts", { action: "subscribe", eventId: EVENT, tierId: "t-gnr-fest-a" });
    check("a tier of another show is refused", otherShow.status === 404, JSON.stringify(otherShow));
    const listed = await api(followerCtx, "GET", "/api/alerts");
    const mine = (listed.body.alerts as { eventId: string; tierId?: string; eventTitle: string; tierName?: string }[] | undefined) ?? [];
    check(
      "the follower reads back its own two, with the show and tier names",
      listed.status === 200 && mine.length === 2 && mine.every((a) => a.eventId === EVENT && a.eventTitle === TITLE) && mine.some((a) => a.tierName === "VIP"),
      JSON.stringify(listed.body).slice(0, 300)
    );
    const stranger = await api(buyerCtx, "POST", "/api/alerts", { action: "unsubscribe", id: alertId(fShow) });
    check("nobody else can stop it", stranger.status === 404, JSON.stringify(stranger));

    /** Posts a listing on the show; `sample` "good" goes live at once, "edited" waits for review. */
    const post = (ctx: BrowserContext, tierId: string, askPrice: number, sample: "good" | "edited", quantity = 1) =>
      api(ctx, "POST", "/api/listings", { eventId: EVENT, tierId, askPrice, quantity, sample });
    /** The alerts a listing sent, once anything sent twice would have landed too. */
    const alertsAbout = async (id: string, expected: number) => {
      if (expected) await waitFor((m) => m.ref === id, expected);
      await sleep(expected ? 1500 : 3000);
      return inbox().filter((m) => m.ref === id);
    };
    /** Moves every listing of the show back in time, as if it had been posted (and cleared) `ms` ago. */
    const age = async (ms: number) => {
      const at = iso(Date.now() - ms);
      const posted = await admin.from("listings").update({ created_at: at }).eq("event_id", EVENT);
      const cleared = await admin.from("listings").update({ cleared_at: at }).eq("event_id", EVENT).not("cleared_at", "is", null);
      if (posted.error || cleared.error) throw new Error(`age: ${(posted.error ?? cleared.error)!.message}`);
    };

    // A listing held for review, on a tier the buyer does not follow: nothing until staff clear it.
    const heldC = await post(sellerCtx, TIER_C, 330_000, "edited", 2);
    const lc = String(heldC.body.id ?? "");
    check("a flagged listing waits for review", heldC.status === 200 && heldC.body.status === "review", JSON.stringify(heldC));
    check("and nobody hears about it yet", (await alertsAbout(lc, 0)).length === 0);
    const cleared = await api(staffCtx, "POST", `/api/listings/${lc}`, { action: "approve" });
    const clearedAgain = await api(staffCtx, "POST", `/api/listings/${lc}`, { action: "approve" });
    check("staff clear it, once", cleared.status === 200 && clearedAgain.status === 409, JSON.stringify({ cleared, clearedAgain }));
    const aboutC = await alertsAbout(lc, 1);
    check(
      "cleared, it reaches the show's follower only: not the VIP follower, not its seller, not the demo account",
      aboutC.length === 1 && aboutC[0].to === FOLLOWER_EMAIL && aboutC[0].text.includes("2 tiket Tribun"),
      JSON.stringify(aboutC.map((m) => m.to))
    );
    check(
      "the alert: its subject, the price per ticket, the show's page, and that listings are still samples",
      aboutC[0]?.subject === `Tiket baru / New tickets: ${TITLE}` && aboutC[0].text.includes("Rp330.000") && linked(aboutC[0], `${SITE}/events/${EVENT}`) &&
        aboutC[0].text.includes("not real tickets for sale"),
      aboutC[0]?.text.slice(0, 500)
    );

    // Held back: posting again, or withdrawing and posting again, cannot email the followers in a loop.
    const liveB = await post(sellerCtx, TIER_B, 1_100_000, "good");
    const lb = String(liveB.body.id ?? "");
    check("the seller's next listing goes live", liveB.status === 200 && liveB.body.status === "active", JSON.stringify(liveB));
    check("but tells nobody: same seller within a day, and the show had a listing go live within six hours", (await alertsAbout(lb, 0)).length === 0);
    const pulled = await api(sellerCtx, "POST", `/api/listings/${lb}`, { action: "withdraw" });
    const liveB2 = await post(sellerCtx, TIER_B, 1_100_000, "good");
    const lb2 = String(liveB2.body.id ?? "");
    check(
      "withdrawn and posted again, it still tells nobody",
      pulled.status === 200 && liveB2.body.status === "active" && (await alertsAbout(lb2, 0)).length === 0,
      JSON.stringify({ pulled: pulled.status, liveB2: liveB2.status })
    );
    const liveD = await post(staffCtx, TIER_B, 1_000_000, "good");
    const ld = String(liveD.body.id ?? "");
    check("another seller's listing within six hours tells nobody either", liveD.body.status === "active" && (await alertsAbout(ld, 0)).length === 0, JSON.stringify(liveD));
    await age(8 * 3_600_000);
    const liveE = await post(sellerCtx, TIER_B, 1_050_000, "good");
    const le = String(liveE.body.id ?? "");
    check(
      "eight hours later the show is quiet again, but this seller listed within a day: nobody",
      liveE.body.status === "active" && (await alertsAbout(le, 0)).length === 0,
      JSON.stringify(liveE)
    );

    // A day on, the next listing is told: once to each follower however many alerts match, to the
    // seller too now that it is not theirs, never to the demo account.
    await age(2 * 86_400_000);
    const liveF = await post(staffCtx, TIER_B, 1_200_000, "good");
    const lf = String(liveF.body.id ?? "");
    const aboutF = await alertsAbout(lf, 3);
    check(
      "a day later the next VIP listing reaches each follower once: the show's follower (two alerts match), the VIP follower, the seller",
      liveF.body.status === "active" && aboutF.length === 3 && [FOLLOWER_EMAIL, BUYER_EMAIL, SELLER_EMAIL].every((to) => aboutF.filter((m) => m.to === to).length === 1),
      JSON.stringify(aboutF.map((m) => m.to))
    );

    // Stopping works: the buyer leaves the VIP tier, and the next VIP listing passes it by.
    const stop = await api(buyerCtx, "POST", "/api/alerts", { action: "unsubscribe", id: alertId(bTier) });
    const left = await api(buyerCtx, "GET", "/api/alerts");
    check("the buyer stops following VIP", stop.status === 200 && Array.isArray(left.body.alerts) && (left.body.alerts as unknown[]).length === 0, JSON.stringify({ stop, left }));
    await age(2 * 86_400_000);
    const liveG = await post(staffCtx, TIER_B, 1_150_000, "good");
    const lg = String(liveG.body.id ?? "");
    const aboutG = await alertsAbout(lg, 2);
    check(
      "the next VIP listing reaches the follower and the seller, not the buyer who stopped",
      liveG.body.status === "active" && aboutG.length === 2 && !aboutG.some((m) => m.to === BUYER_EMAIL),
      JSON.stringify(aboutG.map((m) => m.to))
    );

    // --- 4. The organiser cancels: the order still held is refunded, and its buyer hears it.
    const cancel = await api(staffCtx, "POST", `/api/events/${EVENT}`, { action: "cancel" });
    check("staff cancel the show: two held orders refunded (the buyer's and the demo account's)", cancel.status === 200 && cancel.body.refunded === 2, JSON.stringify(cancel));
    const [gone] = await waitFor((m) => m.kind === "show-cancelled" && m.ref === id2);
    check(
      "the buyer hears it: refunded in full, the fee too, with the order's link",
      gone?.to === BUYER_EMAIL && gone.subject === `Acara dibatalkan, uangmu kembali / Show cancelled, your money back: ${TITLE}` &&
        gone.text.includes(`Direfund: Rp${TOTAL.toLocaleString("id-ID")}`) && gone.text.includes("biaya layanan juga") && linked(gone, `${SITE}/tickets/${id2}`),
      gone?.text.slice(0, 500)
    );
    const again = await api(staffCtx, "POST", `/api/events/${EVENT}`, { action: "cancel" });
    check("cancelling again refunds nothing more", again.status === 200 && again.body.refunded === 0, JSON.stringify(again));

    // --- 5. The whole run's mail: exactly what was expected, nothing twice, nobody else.
    await sleep(2000);
    const all = inbox();
    const got = all.map((m) => `${m.kind} ${m.to === BUYER_EMAIL ? "buyer" : m.to === SELLER_EMAIL ? "seller" : m.to === FOLLOWER_EMAIL ? "follower" : m.to} ${m.ref}`).sort();
    const want = [
      `order-paid buyer ${id1}`, `order-paid buyer ${id2}`,
      `claim-seller seller ${id1}`, `claim-buyer buyer ${id1}`,
      `ruling-buyer buyer ${id1}`, `ruling-seller seller ${id1}`,
      `tickets-listed follower ${lc}`,
      `tickets-listed follower ${lf}`, `tickets-listed buyer ${lf}`, `tickets-listed seller ${lf}`,
      `tickets-listed follower ${lg}`, `tickets-listed seller ${lg}`,
      `show-cancelled buyer ${id2}`,
    ].sort();
    check(`exactly the ${want.length} emails expected, none twice`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
    check("none to the demo account, which bought and followed too", !all.some((m) => m.to === DEMO_EMAIL) && !!id3, JSON.stringify(all.filter((m) => m.to === DEMO_EMAIL).map((m) => m.kind)));
    check("none to staff, who only ruled and cancelled", !all.some((m) => m.to === STAFF_EMAIL));
    check("no em-dash anywhere in them", !all.some((m) => /\u2014/.test(m.subject + m.text + m.html)));

    await Promise.all([buyerCtx, sellerCtx, staffCtx, followerCtx, demoCtx].map((c) => c.close()));
  } catch (e) {
    check("check ran to the end", false, (e as Error).message.split("\n")[0].slice(0, 200));
  } finally {
    const done = await cleanup();
    check(
      "cleanup: the show, its listings, orders, alerts, accounts and emails are gone",
      !done.error && done.alertsLeft === 0 && inbox().length === 0,
      done.error ?? `alerts left ${done.alertsLeft}`
    );
    await browser.close();
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note.slice(0, 300)})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
