/**
 * The gate at a show's door, end to end (docs/09 §8), with three accounts and two shows made for
 * the test. The buyer gets an entry pass the seller cannot; only staff work the door. A pass goes in
 * once, the same pass again is told the holder is inside, a forged pass and another show's pass are
 * turned away. Then the seller's copy goes in first: the buyer's pass is refused, and that refusal
 * refunds the order on the spot, with the claim filed and decided from the gate's own record and the
 * seller charged the penalty. A refunded order's pass no longer opens the door, a code Lummy never
 * sold is left to the organiser, and two scans of one pass in the same second let one in. When the
 * server takes QRIS, a QRIS order refunded at the gate also shows it on the public ledger.
 *
 * The accounts are made for the run and signed in with an admin link (no email, no demo key);
 * everything it made is deleted at the end. It writes to the database the server uses, so run it
 * only where that is fine. The server needs TICKET_BARCODE_PEPPER (passes are signed with it).
 *
 *   BASE=http://localhost:3000 npm run gate:check
 *   BASE=https://lummy.id npm run gate:check
 */
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { keccak256, toHex } from "viem";
import type { Database } from "../src/lib/supabase/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // checked below
}
const BASE = process.env.BASE ?? "http://localhost:3000";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const RUN = Date.now().toString(36);
const EMAIL = (who: string) => `gate-check-${RUN}-${who}@example.com`;
const EVENT = "ev-zz-gate";
const OTHER = "ev-zz-gate-b";
const TIER = "t-zz-gate";
const TIER_B = "t-zz-gate-b";
const LISTINGS = ["ls-zz-gate-1", "ls-zz-gate-2", "ls-zz-gate-3", "ls-zz-gate-4"];
const PRICE = 550_000;

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Admin = ReturnType<typeof createClient<Database>>;
type Reply = { status: number; body: Record<string, unknown> };
type Outcome = {
  result?: string;
  reason?: string;
  credential?: string;
  firstUse?: { credential: string; byThisBuyer: boolean };
  refund?: { amount?: number; penalty?: number; error?: string };
};

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

async function api(ctx: BrowserContext, method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<Reply> {
  const r = await ctx.request.fetch(`${BASE}${path}`, { method, data: body, failOnStatusCode: false });
  return { status: r.status(), body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (web/.env.local)");
  const admin = createClient<Database>(url, key, { auth: { persistSession: false } });
  const order = async (id: string) => (await admin.from("orders").select("escrow_status, disputed").eq("id", id).single()).data;
  const dispute = async (id: string) => (await admin.from("disputes").select("*").eq("order_id", id).maybeSingle()).data;

  const userIds: string[] = [];
  const orderIds: string[] = [];
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  try {
    const made = await Promise.all(
      ["buyer", "seller", "staff"].map((who) =>
        admin.auth.admin.createUser({ email: EMAIL(who), email_confirm: true, user_metadata: { full_name: `Gate ${who}` } })
      )
    );
    const [buyer, seller, staff] = made.map((m) => m.data.user?.id);
    for (const id of [buyer, seller, staff]) if (id) userIds.push(id);
    if (!buyer || !seller || !staff) throw new Error(`accounts: ${made.map((m) => m.error?.message ?? "ok").join(", ")}`);
    const promoted = await admin.from("profiles").update({ role: "admin" }).eq("id", staff).select("id");
    if (promoted.error || !promoted.data.length) throw new Error(`staff: ${promoted.error?.message ?? "no profile"}`);

    // --- Two shows, four sample listings (no file: each order is its own ticket at the door).
    const start = Date.now() + 10 * 86_400_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const listing = (id: string, event: string, tier: string) => ({
      id, event_id: event, tier_id: tier, seller_id: seller, seller_name: "Gate S.", ask_price: PRICE, face_value: 500_000, quantity: 1, splittable: false, status: "active" as const,
    });
    const setup = [
      await admin.from("events").insert([
        { id: EVENT, title: "Uji Gate", category: "Music", starts_at: iso(start), venue: "Istora", city: "Jakarta", transfer_policy: "open" },
        { id: OTHER, title: "Uji Gate B", category: "Music", starts_at: iso(start), venue: "Istora", city: "Jakarta", transfer_policy: "open" },
      ]),
      await admin.from("tiers").insert([
        { id: TIER, event_id: EVENT, name: "Festival", face_value: 500_000 },
        { id: TIER_B, event_id: OTHER, name: "Festival", face_value: 500_000 },
      ]),
      await admin.from("listings").insert([
        listing(LISTINGS[0], EVENT, TIER),
        listing(LISTINGS[1], EVENT, TIER),
        listing(LISTINGS[2], EVENT, TIER),
        listing(LISTINGS[3], EVENT, TIER),
      ]),
    ];
    const setupError = setup.find((r) => r.error)?.error;
    if (setupError) throw new Error(`setup: ${setupError.message}`);

    // Paid orders, written as the server writes them after a payment (the door does not care how).
    const ends = start + 4 * 3_600_000;
    const placed = await admin
      .from("orders")
      .insert(
        [0, 1, 3].map((i) => ({
          listing_id: LISTINGS[i], event_id: EVENT, buyer_id: buyer, seller_id: seller, event_title: "Uji Gate", event_date: iso(start),
          tier_name: "Festival", seller_name: "Gate S.", quantity: 1, amount: PRICE, fee: 27_500, materai: 12_000,
          escrow_status: "Funded" as const, event_ends_at: iso(ends), dispute_deadline: iso(ends + 48 * 3_600_000),
        }))
      )
      .select("id, listing_id");
    if (placed.error) throw new Error(`orders: ${placed.error.message}`);
    const byListing = new Map(placed.data.map((o) => [o.listing_id, o.id]));
    const [o1, o2, o4] = [byListing.get(LISTINGS[0])!, byListing.get(LISTINGS[1])!, byListing.get(LISTINGS[3])!];
    orderIds.push(o1, o2, o4);

    const buyerCtx = await signIn(admin, browser, EMAIL("buyer"));
    const sellerCtx = await signIn(admin, browser, EMAIL("seller"));
    const staffCtx = await signIn(admin, browser, EMAIL("staff"));
    const door = (code: string, eventId = EVENT) => api(staffCtx, "POST", "/api/gate", { eventId, code, gate: "Gate 3" });
    const passOf = async (id: string) => String((await api(buyerCtx, "GET", `/api/orders/${id}/pass`)).body.pass ?? "");

    // --- The pass is the buyer's alone, and only staff work the door.
    const p1 = await api(buyerCtx, "GET", `/api/orders/${o1}/pass`);
    const pass1 = String(p1.body.pass ?? "");
    check("the buyer gets an entry pass for their order", p1.status === 200 && pass1.startsWith(`LUMMY1.${o1}.`), JSON.stringify(p1));
    const sp = await api(sellerCtx, "GET", `/api/orders/${o1}/pass`);
    check("the seller cannot get the buyer's pass", sp.status === 404, JSON.stringify(sp));
    const notStaff = await api(buyerCtx, "POST", "/api/gate", { eventId: EVENT, code: pass1 });
    check("only staff can work the door", notStaff.status === 403, JSON.stringify(notStaff));

    // --- In once; the same pass again is told the holder is inside, and nothing is refunded.
    const in1 = (await door(pass1)).body as Outcome;
    check("the pass goes in", in1.result === "admitted" && in1.credential === "pass", JSON.stringify(in1));
    const again = (await door(pass1)).body as Outcome;
    check(
      "the same pass again is refused: the holder is already inside, nothing refunded",
      again.result === "refused" && again.reason === "ALREADY_ADMITTED" && !again.refund && (await order(o1))?.escrow_status === "Funded",
      JSON.stringify(again)
    );
    const seen = await api(buyerCtx, "GET", `/api/orders/${o1}/pass`);
    check("the buyer's page shows they are in", !!(seen.body.admitted as { at?: string } | null)?.at, JSON.stringify(seen));

    // --- Turned away: a forged pass, and a pass at another show's door.
    const pass2 = await passOf(o2);
    const forged = (await door(`LUMMY1.${o2}.${"A".repeat(22)}`)).body as Outcome;
    check("a forged pass is refused", forged.result === "refused" && forged.reason === "BAD_PASS", JSON.stringify(forged));
    const wrong = (await door(pass2, OTHER)).body as Outcome;
    check("a pass at another show's door is refused", wrong.result === "refused" && wrong.reason === "WRONG_SHOW", JSON.stringify(wrong));

    // --- The seller kept a copy and it went in first: the buyer's refusal is the refund.
    const copy = (await api(staffCtx, "POST", "/api/gate", { action: "copy", eventId: EVENT, orderId: o2, gate: "Gate 3" })).body as Outcome;
    check("the seller's copy goes in first", copy.result === "admitted" && copy.credential === "copy", JSON.stringify(copy));
    const refused = (await door(pass2)).body as Outcome;
    check(
      "then the buyer's pass is refused: the ticket already went in on a copy",
      refused.result === "refused" && refused.reason === "ALREADY_USED" && refused.firstUse?.credential === "copy" && refused.firstUse.byThisBuyer === false,
      JSON.stringify(refused)
    );
    const penalty = Math.round(PRICE * 0.4);
    check(
      "and the refusal refunds the buyer on the spot, the seller charged the penalty",
      refused.refund?.amount === PRICE && refused.refund.penalty === penalty,
      JSON.stringify(refused.refund)
    );
    const o2now = await order(o2);
    const d2 = await dispute(o2);
    const evidence = d2?.evidence as { kind?: string; gate?: { scanId?: number } } | null;
    check(
      "the claim is filed and decided from the gate's own record",
      o2now?.escrow_status === "Refunded" && o2now.disputed === true && d2?.reason === "BARCODE_USED" && d2.verdict_remedy === "REFUND_FULL" &&
        d2.refund_amount === PRICE && d2.seller_penalty === penalty && d2.decided_by === null && evidence?.kind === "SYSTEM_RECORD" && !!evidence.gate?.scanId,
      JSON.stringify({ o2now, d2 })
    );
    const closedPass = await api(buyerCtx, "GET", `/api/orders/${o2}/pass`);
    const closed = (await door(pass2)).body as Outcome;
    check(
      "a refunded order's pass no longer opens the door",
      closedPass.body.pass === null && closed.result === "refused" && closed.reason === "ORDER_CLOSED",
      JSON.stringify({ closedPass, closed })
    );

    // --- A code Lummy never sold is the organiser's to decide.
    const stranger = (await door("SOME-TICKET-SOLD-ELSEWHERE-0001")).body as Outcome;
    check("a code Lummy never sold is left to the organiser", stranger.result === "unknown" && stranger.reason === "NOT_LUMMY", JSON.stringify(stranger));

    // --- Two scans of one pass in the same second: one goes in, the database decides.
    const pass4 = await passOf(o4);
    const both = (await Promise.all([door(pass4), door(pass4)])).map((r) => r.body as Outcome);
    check(
      "two scans of one pass in the same second: exactly one goes in",
      both.filter((o) => o.result === "admitted").length === 1 && both.some((o) => o.reason === "ALREADY_ADMITTED") && (await order(o4))?.escrow_status === "Funded",
      JSON.stringify(both)
    );

    // --- A QRIS order refunded at the gate shows it on the public ledger (when the server takes QRIS).
    const config = await (await fetch(`${BASE}/api/payments`)).json().catch(() => ({}));
    if (config.enabled) {
      const hold = await api(buyerCtx, "POST", "/api/payments", { listingId: LISTINGS[2], quantity: 1 });
      const paid = await api(buyerCtx, "POST", `/api/payments/${String(hold.body.id ?? "")}`, { action: "simulate" });
      const o3 = String(paid.body.orderId ?? "");
      if (o3) orderIds.push(o3);
      check("a QRIS order is paid", paid.status === 200 && paid.body.status === "paid" && !!o3, JSON.stringify(paid));
      const record = keccak256(toHex(`lummy:order:${o3}`));
      const history = async () => (await (await fetch(`${BASE}/api/chain/history/${record}`)).json().catch(() => ({}))) as {
        live?: { status?: string };
        events?: { kind: string; toBuyer?: string }[];
      };
      // The record opens a moment after the payment; the refund has to follow it there.
      for (let i = 0; i < 40 && (await admin.from("orders").select("ledger_status").eq("id", o3).single()).data?.ledger_status !== "Open"; i++) await sleep(1500);
      await api(staffCtx, "POST", "/api/gate", { action: "copy", eventId: EVENT, orderId: o3, gate: "Gate 3" });
      const r3 = (await door(await passOf(o3))).body as Outcome;
      check("its pass is refused after a copy and the buyer refunded", r3.result === "refused" && r3.refund?.amount === PRICE, JSON.stringify(r3));
      let h = await history();
      for (let i = 0; i < 40 && h.live?.status !== "Refunded"; i++) {
        await sleep(1500);
        h = await history();
      }
      const ruled = h.events?.find((e) => e.kind === "Resolved");
      check(
        "and the public record shows the claim and the refund",
        h.live?.status === "Refunded" && !!h.events?.some((e) => e.kind === "DisputeRaised") && ruled?.toBuyer === String(PRICE),
        JSON.stringify(h).slice(0, 300)
      );
    }

    // --- The door's own count.
    const log = await api(staffCtx, "GET", `/api/gate?event=${EVENT}`);
    check(
      "the door keeps its count",
      log.status === 200 && Number(log.body.admitted) >= 3 && Number(log.body.refused) >= 4,
      JSON.stringify({ admitted: log.body.admitted, refused: log.body.refused })
    );
    await Promise.all([buyerCtx.close(), sellerCtx.close(), staffCtx.close()]);
  } catch (e) {
    check("check ran to the end", false, (e as Error).message.split("\n")[0].slice(0, 200));
  } finally {
    // The QRIS order's ledger sync may still be landing: let it settle, then remove everything.
    await sleep(3000);
    for (let round = 0; round < 3; round++) {
      await admin.from("orders").delete().in("listing_id", LISTINGS);
      await admin.from("payments").delete().in("listing_id", LISTINGS);
      await admin.from("listings").delete().in("id", LISTINGS);
      if (!(await admin.from("listings").select("id").in("id", LISTINGS)).data?.length) break;
      await sleep(2000);
    }
    await admin.from("tiers").delete().in("id", [TIER, TIER_B]);
    const gone = await admin.from("events").delete().in("id", [EVENT, OTHER]);
    const users = await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    const scans = await admin.from("gate_scans").select("id").in("event_id", [EVENT, OTHER]);
    const userError = users.find((u) => u.error)?.error;
    check(
      "cleanup: the test shows, their scans, orders and accounts are gone",
      !gone.error && !userError && (scans.data?.length ?? 1) === 0,
      (gone.error ?? userError)?.message
    );
    await browser.close();
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note.slice(0, 220)})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
