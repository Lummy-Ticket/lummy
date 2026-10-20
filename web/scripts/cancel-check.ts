/**
 * An organiser cancels a show (POST /api/events/[id]), end to end with the demo accounts: a show
 * made for the test, with a listing on sale, an order held in escrow and one with a claim open.
 * Staff cancel it from the browser; then the listing is closed, both orders are refunded with the
 * cancellation as the reason, the claim is closed with no penalty, a second press changes nothing,
 * and a seller cannot do it. Everything it made is deleted at the end. It writes to the database
 * the server uses, so run it only where that is fine.
 *
 *   BASE=http://localhost:3000 DEMO_KEY=... npm run cancel:check
 */
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright-core";
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
const EVENT = "ev-zz-cancel";
const TIER = "t-zz-cancel";
const LISTING = "ls-zz-cancel";
const ORDERS = ["or-zz-cancel-1", "or-zz-cancel-2"];

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

async function persona(page: Page, label: "Seller" | "Admin", home: string) {
  const toggle = page.getByRole("button", { name: /^Dev panel$/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByText("Persona (demo account)").waitFor({ timeout: 15000 });
  await page.locator("div.fixed.bottom-5").getByRole("button", { name: new RegExp(`^${label}$`) }).click();
  await page.waitForURL((u) => u.pathname === home, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}

const cancelShow = (page: Page) =>
  page.evaluate(async (id) => {
    const r = await fetch(`/api/events/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  }, EVENT);

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
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  try {
    // --- A show of our own, with something on sale and two orders holding money.
    const start = Date.now() + 10 * 86_400_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const made = [
      await admin.from("events").insert({ id: EVENT, title: "Uji pembatalan", category: "Music", starts_at: iso(start), venue: "Istora", city: "Jakarta", transfer_policy: "open" }),
      await admin.from("tiers").insert({ id: TIER, event_id: EVENT, name: "Festival", face_value: 500_000 }),
      await admin.from("listings").insert({ id: LISTING, event_id: EVENT, tier_id: TIER, seller_id: seller, seller_name: "Zahra A.", ask_price: 550_000, face_value: 500_000, quantity: 1, status: "active" }),
      await admin.from("orders").insert(
        ORDERS.map((id, i) => ({
          id, listing_id: LISTING, event_id: EVENT, buyer_id: buyer, seller_id: seller, event_title: "Uji pembatalan", event_date: iso(start),
          tier_name: "Festival", seller_name: "Zahra A.", quantity: 1, amount: 550_000, fee: 27_500, materai: 10_000,
          escrow_status: "Funded" as const, disputed: i === 1, event_ends_at: iso(start + 5 * 3_600_000), dispute_deadline: iso(start + 53 * 3_600_000),
        }))
      ),
      await admin.from("disputes").insert({ order_id: ORDERS[1], reason: "GATE_DENIED", note_en: "test", note_id: "test" }),
    ];
    const setupError = made.find((r) => r.error)?.error;
    if (setupError) throw new Error(`setup: ${setupError.message}`);

    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate((k) => {
      localStorage.setItem("lummy:demo-accounts", "1");
      // The Dev Panel shows off localhost only on a device that opted in (DevPanel.tsx).
      localStorage.setItem("lummy:dev", "1");
      if (k) localStorage.setItem("lummy:demo-key", k);
    }, DEMO_KEY);
    await page.reload({ waitUntil: "networkidle" });

    // --- A seller cannot cancel a show.
    await persona(page, "Seller", "/seller");
    const refused = await cancelShow(page);
    check("a seller cannot cancel a show (403)", refused.status === 403, JSON.stringify(refused));

    // --- Staff cancel it.
    await persona(page, "Admin", "/admin");
    const first = await cancelShow(page);
    check(
      "staff cancel: both orders refunded, the listing closed",
      first.status === 200 && first.body.refunded === 2 && first.body.listingsClosed === 1 && first.body.failed === 0,
      JSON.stringify(first)
    );
    const [ev, ls, os, ds] = await Promise.all([
      admin.from("events").select("status").eq("id", EVENT).single(),
      admin.from("listings").select("status").eq("id", LISTING).single(),
      admin.from("orders").select("id, escrow_status, auto_refund_reason, event_status").in("id", ORDERS),
      admin.from("disputes").select("verdict_remedy, verdict_to_seller, seller_penalty, refund_amount, decided_at").eq("order_id", ORDERS[1]).single(),
    ]);
    check("the show is cancelled", ev.data?.status === "cancelled");
    check("its listing no longer sells", ls.data?.status === "cancelled");
    check(
      "orders refunded for the cancellation",
      (os.data ?? []).length === 2 && (os.data ?? []).every((o) => o.escrow_status === "Refunded" && o.auto_refund_reason === "EVENT_CANCELLED" && o.event_status === "cancelled"),
      JSON.stringify(os.data)
    );
    check(
      "the open claim is closed as a full refund, no penalty",
      ds.data?.verdict_remedy === "REFUND_FULL" && ds.data.verdict_to_seller === false && ds.data.seller_penalty === 0 && ds.data.refund_amount === 550_000 && !!ds.data.decided_at,
      JSON.stringify(ds.data)
    );
    const listed = await admin.from("catalogue_events").select("listing_count").eq("id", EVENT).single();
    check("nothing of it is on sale in the catalogue", listed.data?.listing_count === 0);

    const again = await cancelShow(page);
    check("pressing again changes nothing", again.status === 200 && again.body.refunded === 0 && again.body.listingsClosed === 0, JSON.stringify(again));
  } catch (e) {
    check("check ran to the end", false, (e as Error).message.split("\n")[0].slice(0, 200));
  } finally {
    await admin.from("disputes").delete().in("order_id", ORDERS);
    await admin.from("orders").delete().in("id", ORDERS);
    await admin.from("listings").delete().eq("id", LISTING);
    await admin.from("tiers").delete().eq("id", TIER);
    const gone = await admin.from("events").delete().eq("id", EVENT);
    const left = await admin.from("orders").select("id").in("id", ORDERS);
    check("cleanup: the test show and its orders are gone", !gone.error && (left.data?.length ?? 1) === 0, gone.error?.message);
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
