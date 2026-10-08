/**
 * The ticket check through the app, the way a seller meets it: signs in to the demo seller account
 * from the Dev Panel, uploads PDFs made on the spot on /sell and reads what the page says. Nothing
 * is published by default.
 *
 * WRITE=1 goes on to the whole life of a real ticket with the demo accounts: publish one and see
 * the same barcode refused in another file; publish an edited one, clear it as staff, buy it as the
 * buyer and download the very file the seller uploaded; withdraw the first and see its file go.
 * Then it deletes what it created. It writes to the database the server uses, so run it only where
 * that is fine.
 *
 *   BASE=http://localhost:3000 DEMO_KEY=... npm run tickets:flow
 */
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright-core";
import type { Database } from "../src/lib/supabase/types";
import { GENUINE, genuineTicket, initWriter, latin1, photo, rewrite, ticketPdf, withExif } from "./ticket-fixtures";

try {
  process.loadEnvFile(".env.local");
} catch {
  // the server's env is enough without WRITE=1
}
const BASE = process.env.BASE ?? "http://localhost:3000";
const DEMO_KEY = process.env.DEMO_KEY ?? "";
const WRITE = process.env.WRITE === "1";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
/** A second ticket, so the edited one is not a duplicate of the first. */
const SECOND = "LMY|ev-tulus|VIP|C-14|5555-6666-7777";

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function upload(page: Page, name: string, bytes: Uint8Array) {
  await page.goto(`${BASE}/sell`, { waitUntil: "networkidle" });
  await page.locator('[data-upload="real"]').waitFor({ timeout: 30000 });
  await page.locator('input[type=file][accept="application/pdf"]').setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
  await page.getByRole("button", { name: "Check the ticket" }).click();
}

async function checked(page: Page, name: string, bytes: Uint8Array) {
  await upload(page, name, bytes);
  await page.getByRole("heading", { name: "Ticket check" }).waitFor({ timeout: 60000 });
  return (await page.locator("main").innerText()).replace(/\s+/g, " ");
}

/** Checks the file, then publishes it at the suggested price. */
async function publish(page: Page, name: string, bytes: Uint8Array) {
  await checked(page, name, bytes);
  await page.getByRole("button", { name: "Continue to price" }).click();
  // A real ticket asks for consent first: the button stays off until the box is ticked.
  const button = page.getByRole("button", { name: /^(Publish listing|Submit for review)$/ });
  check(`${name}: publish waits for consent`, await button.isDisabled());
  await page.locator("[data-consent]").check();
  await button.click();
  await page.waitForURL((u) => u.pathname === "/seller", { timeout: 60000 });
}

/** Signs the browser in to a demo account through the Dev Panel and waits for its home page. */
async function persona(page: Page, label: "Seller" | "Buyer" | "Admin", home: string) {
  const toggle = page.getByRole("button", { name: /^Dev panel$/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByText("Persona (demo account)").waitFor({ timeout: 15000 });
  await page.locator("div.fixed.bottom-5").getByRole("button", { name: new RegExp(`^${label}$`) }).click();
  await page.waitForURL((u) => u.pathname === home, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}

/** A listing action through the same route the console and the dashboard use. */
const listingAction = (page: Page, id: string, action: "approve" | "withdraw") =>
  page.evaluate(
    async ([id, action]) =>
      (await fetch(`/api/listings/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) })).status,
    [id, action] as const
  );

/** The read-only field listing the barcodes read; an input's value is not part of the page text. */
const barcodesField = (page: Page) => page.locator("input[readonly]").first().inputValue();

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("WRITE=1 needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

async function main() {
  await initWriter();
  const genuine = await genuineTicket();
  const files = {
    genuine,
    ilovepdf: await rewrite(genuine, "iLovePDF"),
    none: await ticketPdf({ codes: [], producer: "Lummy test issuer PDF engine" }),
    two: await ticketPdf({
      codes: [{ text: "LMY|ev-tulus|VIP|C-13|1111-2222-3333", format: "QRCode" }, { text: "TIX88427731", format: "Code128", vector: true }],
      producer: "Lummy test issuer PDF engine",
    }),
    // The genuine ticket's barcode, redrawn in another file under another name.
    redrawn: await ticketPdf({ codes: [{ text: GENUINE, format: "QRCode", vector: true }], producer: "Canva", creator: "Canva", name: "Budi Santoso" }),
    // Another ticket, re-saved in an editor: flagged, so it waits for staff.
    editedSecond: await rewrite(await genuineTicket(SECOND), "iLovePDF"),
  };

  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 90)));
  const created: string[] = [];
  const orders: string[] = [];

  try {
    const reader = (await (await fetch(`${BASE}/api/tickets/check`)).json()) as { available?: boolean };
    check("the server checks real PDFs (pepper set, reader works)", !!reader.available);
    if (!reader.available) throw new Error("reader not available on this server");

    // The demo seller, signed in for real through the Dev Panel.
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate((key) => {
      localStorage.setItem("lummy:demo-accounts", "1");
      if (key) localStorage.setItem("lummy:demo-key", key);
    }, DEMO_KEY);
    await page.reload({ waitUntil: "networkidle" });
    await persona(page, "Seller", "/seller");

    let text = await checked(page, "genuine.pdf", files.genuine);
    check("genuine: one barcode read, none listed before", text.includes("1 read, none listed before"), text.slice(0, 200));
    check("genuine: count locked to the barcodes", await page.locator("[data-locked-qty]").isVisible());
    check("genuine: no reasons, not flagged", (await page.locator("[data-check-reasons]").count()) === 0 && !text.includes("Flagged"));
    const field = await barcodesField(page);
    check("genuine: the seller sees the last characters, never the payload", field === "QR ...2290" && !text.includes(GENUINE), field);
    check("genuine: no claim that AI read the file", !text.includes("AI fills in") && !text.includes("AI check"), text.slice(0, 160));

    text = await checked(page, "edited.pdf", files.ilovepdf);
    check("iLovePDF: editor named, goes to review", text.includes("Made or re-saved with a PDF editor (iLovePDF)") && text.includes("Flagged"), text.slice(0, 300));

    text = await checked(page, "no-barcode.pdf", files.none);
    check("no barcode: said plainly, goes to review", text.includes("None could be read") && text.includes("No barcode could be read"), text.slice(0, 300));
    check("no barcode: the seller sets the count", (await page.locator("[data-locked-qty]").count()) === 0);

    text = await checked(page, "two-tickets.pdf", files.two);
    const both = await barcodesField(page);
    check("two tickets: both read and counted", text.includes("2 read, none listed before") && both === "QR ...3333, Code 128 ...7731", both);

    await upload(page, "photo.pdf", latin1("this is not a pdf at all"));
    check("not a PDF: refused with the reason", await page.getByText("file ini bukan PDF").first().waitFor({ timeout: 30000 }).then(() => true, () => false));

    if (WRITE) {
      const admin = adminClient();

      // --- Publish one, and its barcode is held: the same barcode in another file is refused.
      await publish(page, "genuine.pdf", files.genuine);
      const first = await admin.from("listings").select("id, status, quantity, splittable, ticket_path, checks").eq("ticket_sha256", sha(files.genuine)).neq("status", "cancelled").maybeSingle();
      if (first.data) created.push(first.data.id);
      check("publish: listing stored with its file and checks", !!first.data?.ticket_path && first.data.quantity === 1 && !!first.data.checks, JSON.stringify(first.data ?? first.error));
      check("publish: a real ticket's set is never split", first.data?.splittable === false);
      const held = await admin.from("listing_barcodes").select("held").eq("listing_id", first.data?.id ?? "");
      check("publish: its barcode is held", held.data?.length === 1 && held.data[0].held === true, JSON.stringify(held.data ?? held.error));
      const stored = first.data?.ticket_path ? await admin.storage.from("tickets").download(first.data.ticket_path) : null;
      check("publish: the stored file is the uploaded file", !!stored?.data && sha(new Uint8Array(await stored.data.arrayBuffer())) === sha(files.genuine));

      text = await checked(page, "redrawn.pdf", files.redrawn);
      check("same barcode in another file: blocked before publishing", text.includes("Already behind another listing on Lummy"), text.slice(0, 300));
      await page.getByRole("button", { name: "Continue to price" }).click();
      check("same barcode: publish button says blocked", await page.getByRole("button", { name: "Blocked (duplicate)" }).isDisabled());
      const direct = await page.evaluate(async (bytes) => {
        const form = new FormData();
        for (const [k, v] of Object.entries({ eventId: "ev-tulus", tierId: "t-tl-vip", askPrice: "1500000", quantity: "1", splittable: "true", gateKtp: "false" })) form.append(k, v);
        form.append("ticket", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), "redrawn.pdf");
        const r = await fetch("/api/listings", { method: "POST", body: form });
        return { status: r.status, body: await r.text() };
      }, [...files.redrawn]);
      check("same barcode: the server refuses it too (409)", direct.status === 409, JSON.stringify(direct));

      // --- An edited ticket waits for staff; once cleared it is live and can be bought.
      await publish(page, "edited-second.pdf", files.editedSecond);
      const second = await admin.from("listings").select("id, status").eq("ticket_sha256", sha(files.editedSecond)).neq("status", "cancelled").maybeSingle();
      if (second.data) created.push(second.data.id);
      check("edited ticket: held for review, not live", second.data?.status === "review", JSON.stringify(second.data ?? second.error));
      const secondId = second.data?.id ?? "";

      await persona(page, "Admin", "/admin");
      const approved = await listingAction(page, secondId, "approve");
      const cleared = await admin.from("listings").select("status, cleared_at, pdf_suspicious").eq("id", secondId).single();
      check(
        "cleared by staff: live and marked cleared, flags kept for the record",
        approved === 200 && cleared.data?.status === "active" && !!cleared.data.cleared_at && cleared.data.pdf_suspicious === true,
        JSON.stringify({ approved, ...cleared.data })
      );

      // --- The buyer pays and receives the very file the seller uploaded.
      await persona(page, "Buyer", "/");
      await page.goto(`${BASE}/checkout?listing=${secondId}&qty=1`, { waitUntil: "networkidle" });
      // With QRIS on, Xendit's simulator pays the code (test mode, docs/09 §6).
      const qris = await page.locator("[data-qris-note]").isVisible();
      await page.getByRole("button", { name: /^Pay / }).click();
      if (qris) await page.locator("[data-qris-simulate]").click();
      await page.waitForURL(/\/tickets\/[\w-]+$/, { timeout: 60000 });
      const orderId = new URL(page.url()).pathname.split("/").pop() ?? "";
      orders.push(orderId);
      await page.locator('[data-ticket-file="open"]').waitFor({ timeout: 30000 });
      check("order page offers the ticket file", true);
      const handed = await page.request.get(`${BASE}/api/orders/${orderId}/ticket`, { maxRedirects: 0 });
      check("ticket route answers with a signed link", handed.status() === 302 && !!handed.headers()["location"], `HTTP ${handed.status()}`);
      const file = handed.headers()["location"] ? await page.request.get(handed.headers()["location"]) : null;
      check("the buyer gets the seller's file, byte for byte", !!file && sha(new Uint8Array(await file.body())) === sha(files.editedSecond));
      const logged = await admin.from("orders").select("ticket_file, docs_ticket_at").eq("id", orderId).single();
      check("the download is logged as the handover", logged.data?.ticket_file === true && !!logged.data.docs_ticket_at, JSON.stringify(logged.data ?? logged.error));

      // --- The buyer claims with a photo of their own: the server reads this order's code off it.
      await page.goto(`${BASE}/tickets/${orderId}`, { waitUntil: "networkidle" });
      // Before the show the button asks about the ticket; after it, about the gate.
      await page.getByRole("button", { name: /^(Problem with this ticket\?|Something went wrong at the gate)$/ }).click();
      await page.getByText("Ticket differs from the listing").click();
      await page.locator('input[type=file][accept="image/jpeg,image/png,image/webp"]').setInputFiles({
        name: "my-ticket.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(withExif(await photo(SECOND, "jpeg"))),
      });
      await page.getByText("Read from your photo").waitFor({ timeout: 60000 });
      check("claim photo: read by the server, this order's code found", await page.getByText("The code in the photo is this order's ticket.").isVisible());
      await page.locator("input[type=checkbox]").check();
      await page.getByRole("button", { name: "File dispute" }).click();
      await page.waitForFunction(() => document.body.innerText.includes("Under review"), undefined, { timeout: 30000 }).catch(() => undefined);
      const claim = await admin.from("disputes").select("reason, evidence").eq("order_id", orderId).maybeSingle();
      const filedPhoto = claim.data?.evidence as { showsBarcode?: boolean; upload?: { path?: string; editedWith?: string } } | null;
      check(
        "claim filed with the photo the server read",
        claim.data?.reason === "NOT_AS_LISTED" && filedPhoto?.showsBarcode === true && !!filedPhoto.upload?.path?.startsWith(`${orderId}/buyer-`) && filedPhoto.upload.editedWith === "Snapseed",
        JSON.stringify(claim.data ?? claim.error).slice(0, 200)
      );
      const ownPhoto = await page.request.get(`${BASE}/api/orders/${orderId}/evidence?side=buyer`, { maxRedirects: 0 });
      check("the buyer can open their own photo", ownPhoto.status() === 302, `HTTP ${ownPhoto.status()}`);

      // --- Nobody else opens the buyer's file; the seller sees the photo, answers with one, and withdraws the first listing.
      await persona(page, "Seller", "/seller");
      const stranger = await page.request.get(`${BASE}/api/orders/${orderId}/ticket`, { maxRedirects: 0 });
      check("the seller cannot open the buyer's order file (404)", stranger.status() === 404, `HTTP ${stranger.status()}`);
      const sellerSees = await page.request.get(`${BASE}/api/orders/${orderId}/evidence?side=buyer`, { maxRedirects: 0 });
      check("the seller can open the buyer's claim photo", sellerSees.status() === 302, `HTTP ${sellerSees.status()}`);
      const card = page.locator(`[data-claim="${orderId}"]`);
      await card.waitFor({ timeout: 30000 });
      await card.getByText("Answer this claim").click();
      await card.locator("textarea").fill("Tiketnya sudah saya serahkan lewat Lummy.");
      await card.locator('input[type=file][accept="image/jpeg,image/png,image/webp"]').setInputFiles({
        name: "handover.png",
        mimeType: "image/png",
        buffer: Buffer.from(await photo(null, "png")),
      });
      await card.locator('[data-evidence-photo="seller"]').waitFor({ timeout: 60000 });
      await card.getByRole("button", { name: "Send answer" }).click();
      await card.getByText("Your answer is on file").waitFor({ timeout: 30000 }).catch(() => undefined);
      const reply = await admin.from("dispute_replies").select("from_seller, evidence").eq("order_id", orderId);
      const replied = reply.data?.[0]?.evidence as { upload?: { path?: string } } | null;
      check(
        "the seller's answer carries their own upload",
        reply.data?.length === 1 && reply.data[0].from_seller && !!replied?.upload?.path?.startsWith(`${orderId}/seller-`),
        JSON.stringify(reply.data ?? reply.error).slice(0, 200)
      );
      const firstId = first.data?.id ?? "";
      const withdrawn = await listingAction(page, firstId, "withdraw");
      const after = await admin.from("listings").select("status, ticket_path").eq("id", firstId).single();
      const left = await admin.storage.from("tickets").list("", { search: `${firstId}.pdf` });
      check(
        "withdrawn: cancelled, its file deleted",
        withdrawn === 200 && after.data?.status === "cancelled" && !after.data.ticket_path && (left.data ?? []).length === 0,
        JSON.stringify({ withdrawn, ...after.data, files: left.data?.length })
      );
      const freed = await admin.from("listing_barcodes").select("held").eq("listing_id", firstId);
      check("withdrawn: its barcode is free to be listed again", freed.data?.length === 1 && freed.data[0].held === false);

      // --- Staff ruling on the claim open both photos.
      await persona(page, "Admin", "/admin");
      const both = await Promise.all(
        (["buyer", "seller"] as const).map((side) => page.request.get(`${BASE}/api/orders/${orderId}/evidence?side=${side}`, { maxRedirects: 0 }))
      );
      check("staff can open both sides' photos", both.every((r) => r.status() === 302), both.map((r) => r.status()).join(","));
    }
  } catch (e) {
    check("flow ran to the end", false, (e as Error).message.split("\n")[0].slice(0, 200));
  } finally {
    if (created.length || orders.length) {
      const admin = adminClient();
      // Claims point at their order, and orders at their listing, so they go first; then the photos.
      if (orders.length) {
        await admin.from("dispute_replies").delete().in("order_id", orders);
        await admin.from("disputes").delete().in("order_id", orders);
        await admin.from("orders").delete().in("id", orders);
        await admin.from("payments").delete().in("listing_id", created);
        for (const o of orders) {
          const photos = (await admin.storage.from("evidence").list(o)).data ?? [];
          if (photos.length) await admin.storage.from("evidence").remove(photos.map((p) => `${o}/${p.name}`));
        }
      }
      let photosLeft = 0;
      for (const o of orders) photosLeft += ((await admin.storage.from("evidence").list(o)).data ?? []).length;
      const paths = (await admin.from("listings").select("ticket_path").in("id", created)).data?.map((r) => r.ticket_path).filter((p): p is string => !!p) ?? [];
      if (paths.length) await admin.storage.from("tickets").remove(paths);
      const gone = await admin.from("listings").delete().in("id", created);
      const left = await admin.from("listing_barcodes").select("listing_id").in("listing_id", created);
      const stray = await admin.from("orders").select("id").in("id", orders);
      check(
        "cleanup: test orders, claims, photos, listings, files and barcodes removed",
        !gone.error && (left.data?.length ?? 1) === 0 && (stray.data?.length ?? 1) === 0 && photosLeft === 0,
        gone.error?.message ?? `photos left: ${photosLeft}`
      );
    }
    check("no page errors", pageErrors.length === 0, [...new Set(pageErrors)].join(" | "));
    await browser.close();
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note.slice(0, 200)})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass${WRITE ? "" : " (read-only; WRITE=1 also publishes, buys and cleans up)"}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
