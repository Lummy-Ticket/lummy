/**
 * Files that carry personal data are deleted once their time is up (lib/retention.ts), end to end
 * with the demo accounts. Two shows made for the test, one over for 40 days and one still ahead, with
 * ticket files on four listings and claim photos on two orders. The daily job's purge, limited to
 * these, must delete the ticket of a paid-out order and of an unsold listing on the old show, keep
 * the one whose claim still holds money and the one whose show is ahead, delete the photos of a
 * claim decided over a month ago along with where they were taken, and an unattached upload only
 * once it is a week old. Then the buyer's routes and order page must say the files are gone, and
 * still serve the ones kept. Everything it made is deleted at the end. It writes to the database
 * and storage the server uses, so run it only where that is fine.
 *
 *   BASE=http://localhost:3000 DEMO_KEY=... npm run retention:check
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright-core";
import type { Database, Json } from "../src/lib/supabase/types";
import { DEMO_ACCOUNTS } from "../src/lib/supabase/demo";
import { purgeExpired } from "../src/lib/retention-purge";

try {
  process.loadEnvFile(".env.local");
} catch {
  // checked below
}
const BASE = process.env.BASE ?? "http://localhost:3000";
const DEMO_KEY = process.env.DEMO_KEY ?? "";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const DAY = 86_400_000;
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const OLD = "ev-zz-retention-old";
const AHEAD = "ev-zz-retention-ahead";
const TIERS: Record<string, string> = { [OLD]: "t-zz-retention-old", [AHEAD]: "t-zz-retention-ahead" };
/** paid: sold, order paid out. held: sold, claim open. ahead: on sale, show ahead. unsold: on sale, show over. */
const L = { paid: "ls-zz-retention-paid", held: "ls-zz-retention-held", ahead: "ls-zz-retention-ahead", unsold: "ls-zz-retention-unsold" };
const O = { paid: "or-zz-retention-paid", held: "or-zz-retention-held" };
const ticketPath = (listing: string) => `${listing}.pdf`;
const photo = { decided: `${O.paid}/buyer-${randomUUID()}.jpg`, used: `${O.held}/buyer-${randomUUID()}.jpg`, stray: `${O.held}/buyer-${randomUUID()}.jpg` };

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

async function persona(page: Page, label: "Buyer", home: string) {
  const toggle = page.getByRole("button", { name: /^Dev panel$/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByText("Persona (demo account)").waitFor({ timeout: 15000 });
  await page.locator("div.fixed.bottom-5").getByRole("button", { name: new RegExp(`^${label}$`) }).click();
  await page.waitForURL((u) => u.pathname === home, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}

/** What a route answers the signed-in buyer. A file it serves is a redirect to a signed link, which is not followed. */
const ask = (page: Page, path: string) =>
  page.evaluate(async (p) => {
    const r = await fetch(p, { redirect: "manual" });
    return { status: r.status, served: r.type === "opaqueredirect" };
  }, path);

const evidence = (path: string, gps: boolean): Json => ({
  fileName: "gate.jpg",
  kind: "SCANNER_PHOTO",
  capturedAtISO: iso(Date.now() - 40 * DAY),
  atVenue: true,
  showsBarcode: true,
  upload: { path, sha256: "0".repeat(64), size: 4, type: "image/jpeg", codesRead: 1, device: "Test Camera", ...(gps ? { gps: { lat: -6.2187, lng: 106.8023 } } : {}) },
});

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

  const scope = { listingIds: Object.values(L), orderIds: Object.values(O) };
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  try {
    // --- Two shows: one over for 40 days, one ten days ahead.
    const oldStart = Date.now() - 40 * DAY;
    const aheadStart = Date.now() + 10 * DAY;
    const show = (id: string, start: number) => ({ id, title: "Uji masa simpan", category: "Music", starts_at: iso(start), venue: "Istora", city: "Jakarta", transfer_policy: "open" as const });
    const listing = (id: string, event: string, status: "active" | "sold") => ({
      id, event_id: event, tier_id: TIERS[event], seller_id: seller, seller_name: "Zahra A.", ask_price: 550_000, face_value: 500_000, quantity: 1, status,
      ticket_path: ticketPath(id), ticket_sha256: "0".repeat(64),
    });
    const order = (id: string, listingId: string, status: "Released" | "Funded") => ({
      id, listing_id: listingId, event_id: OLD, buyer_id: buyer, seller_id: seller, event_title: "Uji masa simpan", event_date: iso(oldStart),
      tier_name: "Festival", seller_name: "Zahra A.", quantity: 1, amount: 550_000, fee: 27_500, materai: 10_000, ticket_file: true,
      escrow_status: status, disputed: true, event_ends_at: iso(oldStart + 4 * H), dispute_deadline: iso(oldStart + 52 * H),
    });
    const made = [
      await admin.from("events").insert([show(OLD, oldStart), show(AHEAD, aheadStart)]),
      await admin.from("tiers").insert([
        { id: TIERS[OLD], event_id: OLD, name: "Festival", face_value: 500_000 },
        { id: TIERS[AHEAD], event_id: AHEAD, name: "Festival", face_value: 500_000 },
      ]),
      await admin.from("listings").insert([listing(L.paid, OLD, "sold"), listing(L.held, OLD, "sold"), listing(L.ahead, AHEAD, "active"), listing(L.unsold, OLD, "active")]),
      await admin.from("orders").insert([order(O.paid, L.paid, "Released"), order(O.held, L.held, "Funded")]),
      // The paid-out order's claim was decided 31 days ago for the seller; the other's is still open.
      await admin.from("disputes").insert([
        {
          order_id: O.paid, reason: "GATE_DENIED", note_en: "test", note_id: "test", evidence: evidence(photo.decided, true), opened_at: iso(oldStart + 5 * H),
          decided_at: iso(Date.now() - 31 * DAY), verdict_remedy: "RELEASE_SELLER", verdict_to_seller: true, refund_amount: 0, seller_penalty: 0, rationale_en: "test", rationale_id: "test",
        },
        { order_id: O.held, reason: "GATE_DENIED", note_en: "test", note_id: "test", evidence: evidence(photo.used, true), opened_at: iso(oldStart + 5 * H) },
      ]),
    ];
    const setupError = made.find((r) => r.error)?.error;
    if (setupError) throw new Error(`setup: ${setupError.message}`);
    const pdf = new TextEncoder().encode("%PDF-1.4\n%test\n");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    for (const id of Object.values(L)) {
      const up = await admin.storage.from("tickets").upload(ticketPath(id), pdf, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(`setup: ${up.error.message}`);
    }
    for (const p of Object.values(photo)) {
      const up = await admin.storage.from("evidence").upload(p, jpeg, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error(`setup: ${up.error.message}`);
    }

    // --- Today's purge, on these alone.
    const today = await purgeExpired(admin, Date.now(), 20_000, scope);
    check(
      "today: two ticket files and one decided claim's photo go, nothing else",
      today.ticketFiles === 2 && today.evidenceFiles === 1 && today.orphanUploads === 0 && !today.errors.length,
      JSON.stringify(today)
    );
    const tickets = await admin.from("listings").select("id, ticket_path").in("id", Object.values(L));
    const pathOf = (id: string) => tickets.data?.find((l) => l.id === id)?.ticket_path;
    check("the paid-out order's ticket is deleted", pathOf(L.paid) === null);
    check("an unsold listing's ticket on a show long over is deleted", pathOf(L.unsold) === null);
    check("a ticket whose claim still holds money is kept", pathOf(L.held) === ticketPath(L.held));
    check("a ticket for a show still ahead is kept", pathOf(L.ahead) === ticketPath(L.ahead));
    const stored = async (bucket: string, folder: string) => ((await admin.storage.from(bucket).list(folder, { limit: 100 })).data ?? []).filter((f) => f.id).map((f) => f.name);
    const ticketFiles = await stored("tickets", "");
    check(
      "storage agrees: two ticket files left",
      !ticketFiles.includes(ticketPath(L.paid)) && !ticketFiles.includes(ticketPath(L.unsold)) && ticketFiles.includes(ticketPath(L.held)) && ticketFiles.includes(ticketPath(L.ahead)),
      ticketFiles.filter((n) => n.includes("zz-retention")).join(", ")
    );
    check("the decided claim's photo is deleted", (await stored("evidence", O.paid)).length === 0);
    const decided = await admin.from("disputes").select("evidence").eq("order_id", O.paid).single();
    const kept = decided.data?.evidence as { atVenue?: boolean; upload?: { gps?: unknown; sha256?: string } } | null;
    check("where it was taken is forgotten, what the check concluded stays", !!kept && kept.upload?.gps === undefined && kept.atVenue === true && !!kept.upload?.sha256, JSON.stringify(kept));
    check("a fresh upload nobody attached is kept for now", (await stored("evidence", O.held)).length === 2);

    // --- Eight days on: the unattached upload goes, the attached one stays.
    const later = await purgeExpired(admin, Date.now() + 8 * DAY, 20_000, scope);
    check("a week later the unattached upload goes, nothing else", later.orphanUploads === 1 && later.ticketFiles === 0 && later.evidenceFiles === 0 && !later.errors.length, JSON.stringify(later));
    const held = await stored("evidence", O.held);
    check("the photo attached to the open claim stays", held.length === 1 && photo.used.endsWith(held[0]), held.join(", "));
    const open = await admin.from("disputes").select("evidence").eq("order_id", O.held).single();
    check("an open claim keeps where its photo was taken", !!(open.data?.evidence as { upload?: { gps?: unknown } } | null)?.upload?.gps);

    // --- The buyer's routes and page say the same.
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate((k) => {
      localStorage.setItem("lummy:demo-accounts", "1");
      // The Dev Panel shows off localhost only on a device that opted in (DevPanel.tsx).
      localStorage.setItem("lummy:dev", "1");
      if (k) localStorage.setItem("lummy:demo-key", k);
    }, DEMO_KEY);
    // The buyer's home is "/", so the switch starts elsewhere: landing there is what says it is done.
    await page.goto(`${BASE}/events`, { waitUntil: "networkidle" });
    await persona(page, "Buyer", "/");
    const goneTicket = await ask(page, `/api/orders/${O.paid}/ticket`);
    check("the paid-out order's ticket answers 410", goneTicket.status === 410, JSON.stringify(goneTicket));
    const keptTicket = await ask(page, `/api/orders/${O.held}/ticket`);
    check("the held order's ticket still opens", keptTicket.served, JSON.stringify(keptTicket));
    const gonePhoto = await ask(page, `/api/orders/${O.paid}/evidence?side=buyer`);
    check("the decided claim's photo answers 410", gonePhoto.status === 410, JSON.stringify(gonePhoto));
    const keptPhoto = await ask(page, `/api/orders/${O.held}/evidence?side=buyer`);
    check("the open claim's photo still opens", keptPhoto.served, JSON.stringify(keptPhoto));

    await page.goto(`${BASE}/tickets/${O.paid}`, { waitUntil: "networkidle" });
    await page.locator("[data-ticket-file]").first().waitFor({ timeout: 20000 });
    check("the order page shows the ticket as deleted", (await page.locator("[data-ticket-file]").first().getAttribute("data-ticket-file")) === "closed");
    check("the order page says the photo was deleted, with no link to it", (await page.locator("[data-evidence-gone]").count()) > 0 && (await page.getByRole("link", { name: "Open the photo" }).count()) === 0);
  } catch (e) {
    check("check ran to the end", false, (e as Error).message.split("\n")[0].slice(0, 200));
  } finally {
    await admin.storage.from("tickets").remove(Object.values(L).map(ticketPath));
    await admin.storage.from("evidence").remove(Object.values(photo));
    await admin.from("dispute_replies").delete().in("order_id", Object.values(O));
    await admin.from("disputes").delete().in("order_id", Object.values(O));
    await admin.from("orders").delete().in("id", Object.values(O));
    await admin.from("listings").delete().in("id", Object.values(L));
    await admin.from("tiers").delete().in("id", Object.values(TIERS));
    const gone = await admin.from("events").delete().in("id", [OLD, AHEAD]);
    const left = await admin.from("listings").select("id").in("id", Object.values(L));
    const files = [...(await admin.storage.from("tickets").list("", { limit: 1000, search: "zz-retention" })).data ?? [], ...((await admin.storage.from("evidence").list(O.held)).data ?? [])];
    check("cleanup: the test shows, orders and files are gone", !gone.error && (left.data?.length ?? 1) === 0 && files.filter((f) => f.id).length === 0, gone.error?.message ?? files.map((f) => f.name).join(", "));
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
