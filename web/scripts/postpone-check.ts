/**
 * An organiser postpones a show (POST /api/events/[id] "postpone"), end to end with the demo
 * accounts: a show made for the test, ten days ahead, with a listing on sale, an order held in
 * escrow, one with a claim open and one already paid out. A seller cannot move it, and nobody can
 * move it earlier. Staff move it from the API and again from the admin form; each time the held
 * orders move with it (dates, window, "postponed") and the paid-out one does not, and the same date
 * again changes nothing. Then the buyer takes the money back from the order page, which a seller
 * cannot do for them, which an open claim cannot do, and which works once. The event page says it
 * moved. Everything it made is deleted at the end. It writes to the database the server uses, so
 * run it only where that is fine.
 *
 * CHAIN=1 (from chain:e2e, against a server whose operator points at Anvil) also buys a ticket
 * into a real escrow first, and checks that the contract's schedule moves each time and that the
 * buyer's refund comes from the contract.
 *
 *   BASE=http://localhost:3000 DEMO_KEY=... npm run postpone:check
 */
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright-core";
import type { Address, Hex } from "viem";
import { foundry } from "viem/chains";
import { escrowAbi } from "../src/lib/chain/abi";
import { getListing, publicClient } from "../src/lib/chain/escrow";
import type { Database } from "../src/lib/supabase/types";
import { DEMO_ACCOUNTS } from "../src/lib/supabase/demo";

try {
  process.loadEnvFile(".env.local");
} catch {
  // checked below
}
const BASE = process.env.BASE ?? "http://localhost:3000";
const DEMO_KEY = process.env.DEMO_KEY ?? "";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const CHAIN = process.env.CHAIN === "1";
const RPC = process.env.RPC ?? "http://127.0.0.1:8545";
const EVENT = "ev-zz-postpone";
const TIER = "t-zz-postpone";
const LISTING = "ls-zz-postpone";
/** held: in escrow. claimed: a claim open. paid: paid out. */
const O = { held: "or-zz-postpone-held", claimed: "or-zz-postpone-claimed", paid: "or-zz-postpone-paid" };
const DAY = 86_400_000;
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

async function persona(page: Page, label: "Buyer" | "Seller" | "Admin", home: string) {
  const toggle = page.getByRole("button", { name: /^Dev panel$/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByText("Persona (demo account)").waitFor({ timeout: 15000 });
  await page.locator("div.fixed.bottom-5").getByRole("button", { name: new RegExp(`^${label}$`) }).click();
  await page.waitForURL((u) => u.pathname === home, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}

const post = (page: Page, path: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  page.evaluate(
    async ([p, b, h]) => {
      const r = await fetch(p, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) });
      return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
    },
    [path, body, headers] as const
  );

/** The same minute, as the admin form sends it from a device in Jakarta. */
const wibInput = (ms: number) => new Date(ms + 7 * H).toISOString().slice(0, 16);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (web/.env.local)");
  const admin = createClient<Database>(url, key, { auth: { persistSession: false } });

  const users = (await admin.auth.admin.listUsers({ page: 1, perPage: 200 })).data?.users ?? [];
  const idOf = (email: string) => users.find((u) => u.email === email)?.id;
  const buyer = idOf(DEMO_ACCOUNTS.BUYER.email);
  const seller = idOf(DEMO_ACCOUNTS.SELLER.email);
  if (!buyer || !seller) throw new Error("demo accounts not found: open them once from the Dev Panel");

  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: "Asia/Jakarta" })).newPage();
  let chainOrder = "";
  try {
    // --- A show of our own, ten days ahead, on whole minutes as the admin form speaks.
    const start = Math.floor((Date.now() + 10 * DAY) / 60_000) * 60_000;
    const order = (id: string, status: "Funded" | "Released", disputed: boolean) => ({
      id, listing_id: LISTING, event_id: EVENT, buyer_id: buyer, seller_id: seller, event_title: "Uji pengunduran", event_date: iso(start),
      tier_name: "Festival", seller_name: "Zahra A.", quantity: 1, amount: 550_000, fee: 27_500, materai: 10_000,
      escrow_status: status, disputed, event_ends_at: iso(start + 4 * H), dispute_deadline: iso(start + 52 * H),
    });
    const made = [
      await admin.from("events").insert({ id: EVENT, title: "Uji pengunduran", category: "Music", starts_at: iso(start), venue: "Istora", city: "Jakarta", transfer_policy: "open" }),
      await admin.from("tiers").insert({ id: TIER, event_id: EVENT, name: "Festival", face_value: 500_000 }),
      await admin.from("listings").insert({ id: LISTING, event_id: EVENT, tier_id: TIER, seller_id: seller, seller_name: "Zahra A.", ask_price: 550_000, face_value: 500_000, quantity: 3, splittable: true, status: "active" }),
      await admin.from("orders").insert([order(O.held, "Funded", false), order(O.claimed, "Funded", true), order(O.paid, "Released", false)]),
      await admin.from("disputes").insert({ order_id: O.claimed, reason: "NOT_DELIVERED", note_en: "test", note_id: "test" }),
    ];
    const setupError = made.find((r) => r.error)?.error;
    if (setupError) throw new Error(`setup: ${setupError.message}`);

    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate((k) => {
      localStorage.setItem("lummy:demo-accounts", "1");
      if (k) localStorage.setItem("lummy:demo-key", k);
    }, DEMO_KEY);
    await page.reload({ waitUntil: "networkidle" });
    const move = (startsAt: number) => post(page, `/api/events/${EVENT}`, { action: "postpone", startsAt: iso(startsAt) });
    const ids = () => [...Object.values(O), ...(chainOrder ? [chainOrder] : [])];
    const orders = async () => {
      const r = await admin
        .from("orders")
        .select("id, escrow_status, event_status, event_date, event_ends_at, dispute_deadline, auto_refund_reason, onchain_listing_id, contract_address, tx_settle")
        .in("id", ids());
      return Object.fromEntries((r.data ?? []).map((o) => [o.id, o]));
    };
    const at = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN);

    // --- In chain mode, one more ticket bought into a real escrow.
    const pc = publicClient(foundry, RPC);
    if (CHAIN) {
      // The buyer's home is "/", so the switch starts elsewhere: landing there is what says it is done.
      await page.goto(`${BASE}/events`, { waitUntil: "networkidle" });
      await persona(page, "Buyer", "/");
      const bought = await post(page, "/api/orders", { listingId: LISTING, quantity: 1, chain: true }, DEMO_KEY ? { "x-demo-key": DEMO_KEY } : {});
      chainOrder = typeof bought.body.id === "string" ? bought.body.id : "";
      check("chain: the buyer pays into a real escrow", bought.status === 200 && !!chainOrder, JSON.stringify(bought));
    }
    /** The contract's schedule and window for the chain order, next to what the database recorded. */
    const onchain = async () => {
      const o = (await orders())[chainOrder];
      if (!o?.onchain_listing_id || !o.contract_address) return null;
      const escrow = o.contract_address as Address;
      const [L, window] = await Promise.all([
        getListing(pc, escrow, o.onchain_listing_id as Hex),
        pc.readContract({ address: escrow, abi: escrowAbi, functionName: "disputeWindow" }),
      ]);
      return { o, L, deadline: (Math.max(L.handoverAt, L.eventEndsAt) + Number(window)) * 1000 };
    };

    // --- A seller cannot move a show.
    await persona(page, "Seller", "/seller");
    const refused = await move(start + 10 * DAY);
    check("a seller cannot postpone a show (403)", refused.status === 403, JSON.stringify(refused));

    // --- Staff move it ten days on; never earlier.
    await persona(page, "Admin", "/admin");
    const earlier = await move(start - DAY);
    check("a show cannot be moved earlier (400)", earlier.status === 400, JSON.stringify(earlier));
    const later = start + 10 * DAY;
    const first = await move(later);
    const held = CHAIN ? 3 : 2;
    check(`staff postpone: all ${held} held orders move, nothing fails`, first.status === 200 && first.body.moved === held && first.body.failed === 0, JSON.stringify(first));
    const [ev, ls] = await Promise.all([
      admin.from("events").select("status, starts_at, rolling_hour").eq("id", EVENT).single(),
      admin.from("listings").select("status").eq("id", LISTING).single(),
    ]);
    check("the show is postponed to the new date", ev.data?.status === "postponed" && at(ev.data.starts_at) === later, JSON.stringify(ev.data));
    check("its listing keeps selling", ls.data?.status === "active");
    let os = await orders();
    const movedTo = (o: (typeof os)[string] | undefined, s: number) =>
      !!o && o.event_status === "postponed" && at(o.event_date) === s && at(o.event_ends_at) === s + 4 * H && at(o.dispute_deadline) === s + 52 * H;
    check("the held order moves: date, end, window, marked postponed", movedTo(os[O.held], later), JSON.stringify(os[O.held]));
    check("the order with a claim open moves too", movedTo(os[O.claimed], later), JSON.stringify(os[O.claimed]));
    check("the paid-out order is left as it was", os[O.paid]?.event_status === "scheduled" && at(os[O.paid]?.event_date) === start, JSON.stringify(os[O.paid]));
    if (CHAIN) {
      const c = await onchain();
      check(
        "chain: the contract moved the show's end, and the database keeps the contract's window",
        !!c && c.L.eventEndsAt * 1000 === later + 4 * H && at(c.o.event_ends_at) === later + 4 * H && at(c.o.dispute_deadline) === c.deadline && c.o.event_status === "postponed",
        JSON.stringify(c && { ends: c.L.eventEndsAt, deadline: c.deadline, row: c.o })
      );
    }
    const listed = await admin.from("catalogue_events").select("starts_at, listing_count, status").eq("id", EVENT).single();
    check("the catalogue sells it at the new date", at(listed.data?.starts_at) === later && listed.data?.listing_count === 1 && listed.data.status === "postponed", JSON.stringify(listed.data));
    const again = await move(later);
    check("the same date again changes nothing", again.status === 200 && again.body.moved === 0 && again.body.failed === 0, JSON.stringify(again));

    // --- And again from the admin form, a day further, in Jakarta time.
    const further = later + DAY;
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Shows/ }).click();
    const card = page.locator(`[data-show="${EVENT}"]`);
    await card.waitFor({ timeout: 20000 });
    check("the admin list marks the show postponed", (await card.textContent())?.includes("postponed") === true);
    await card.getByRole("button", { name: /Organiser postponed/ }).click();
    await card.locator("input[type=datetime-local]").fill(wibInput(further));
    await card.getByRole("button", { name: /Move the show/ }).click();
    await page.getByText(/Show moved to/).waitFor({ timeout: CHAIN ? 90000 : 30000 });
    const ev2 = await admin.from("events").select("starts_at").eq("id", EVENT).single();
    check("the form moves the show to the minute it shows", at(ev2.data?.starts_at) === further, JSON.stringify(ev2.data));
    os = await orders();
    check("the held orders move with it again", movedTo(os[O.held], further) && movedTo(os[O.claimed], further), JSON.stringify([os[O.held], os[O.claimed]]));
    if (CHAIN) {
      const c = await onchain();
      check("chain: the contract moved it again", !!c && c.L.eventEndsAt * 1000 === further + 4 * H && at(c.o.dispute_deadline) === c.deadline, JSON.stringify(c?.o));
    }

    // --- Only the buyer takes the money back, and not while a claim is open.
    await persona(page, "Seller", "/seller");
    const notTheirs = await post(page, `/api/orders/${O.held}`, { action: "postponed-refund" });
    check("a seller cannot take the buyer's refund (403)", notTheirs.status === 403, JSON.stringify(notTheirs));
    await persona(page, "Buyer", "/");
    const claimed = await post(page, `/api/orders/${O.claimed}`, { action: "postponed-refund" });
    check("an order with a claim open cannot opt out (409)", claimed.status === 409, JSON.stringify(claimed));

    await page.goto(`${BASE}/tickets/${O.held}`, { waitUntil: "networkidle" });
    const panel = page.locator("[data-postponed]");
    await panel.waitFor({ timeout: 20000 });
    check("the order page says the show moved, with the new date", (await panel.textContent())?.includes("New date") === true);
    const button = page.locator("[data-postponed-refund]");
    await button.click();
    await page.getByText(/Press again/).waitFor({ timeout: 5000 });
    await button.click();
    await page.getByText("Returned when you chose the money over the new date.").waitFor({ timeout: 30000 });
    os = await orders();
    check(
      "the buyer took the money back: refunded, for the postponement",
      os[O.held]?.escrow_status === "Refunded" && os[O.held]?.auto_refund_reason === "EVENT_POSTPONED",
      JSON.stringify(os[O.held])
    );
    const twice = await post(page, `/api/orders/${O.held}`, { action: "postponed-refund" });
    check("it cannot be taken twice (409)", twice.status === 409, JSON.stringify(twice));
    if (CHAIN) {
      const refund = await post(page, `/api/orders/${chainOrder}`, { action: "postponed-refund" });
      const c = await onchain();
      check(
        "chain: the contract refunds the buyer, and the database records it",
        refund.status === 200 && c?.L.status === "Refunded" && c.o.escrow_status === "Refunded" && c.o.auto_refund_reason === "EVENT_POSTPONED" && !!c.o.tx_settle,
        JSON.stringify({ refund, status: c?.L.status, row: c?.o })
      );
    }

    await page.goto(`${BASE}/events/${EVENT}`, { waitUntil: "networkidle" });
    check("the event page says it was postponed", (await page.locator("[data-event-postponed]").count()) === 1);
  } catch (e) {
    check("check ran to the end", false, (e as Error).message.split("\n")[0].slice(0, 200));
  } finally {
    const all = [...Object.values(O), ...(chainOrder ? [chainOrder] : [])];
    await admin.from("disputes").delete().in("order_id", all);
    await admin.from("orders").delete().in("id", all);
    await admin.from("listings").delete().eq("id", LISTING);
    await admin.from("tiers").delete().eq("id", TIER);
    const gone = await admin.from("events").delete().eq("id", EVENT);
    const left = await admin.from("orders").select("id").in("id", all);
    check("cleanup: the test show and its orders are gone", !gone.error && (left.data?.length ?? 1) === 0, gone.error?.message);
    await browser.close();
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note.slice(0, 240)})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
