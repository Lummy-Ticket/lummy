/**
 * The ticket check through the app, the way a seller meets it: signs in to the demo seller account
 * from the Dev Panel, uploads PDFs made on the spot on /sell and reads what the page says. Nothing
 * is published by default. WRITE=1 also publishes one, so the database has to refuse the same
 * barcode in another file, then deletes what it created; it writes to the database the server
 * uses, so run it only where that is fine.
 *
 *   BASE=http://localhost:3000 DEMO_KEY=... npm run tickets:flow
 */
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright-core";
import type { Database } from "../src/lib/supabase/types";
import { GENUINE, genuineTicket, initWriter, latin1, rewrite, ticketPdf } from "./ticket-fixtures";

try {
  process.loadEnvFile(".env.local");
} catch {
  // the server's env is enough without WRITE=1
}
const BASE = process.env.BASE ?? "http://localhost:3000";
const DEMO_KEY = process.env.DEMO_KEY ?? "";
const WRITE = process.env.WRITE === "1";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

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

/** The read-only field listing the barcodes read; an input's value is not part of the page text. */
const barcodesField = (page: Page) => page.locator("input[readonly]").first().inputValue();

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
  };

  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 90)));
  const created: string[] = [];

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
    const toggle = page.getByRole("button", { name: /^Dev panel$/ });
    if (await toggle.isVisible()) await toggle.click();
    await page.getByText("Persona (demo account)").waitFor({ timeout: 15000 });
    await page.locator("div.fixed.bottom-5").getByRole("button", { name: /^Seller$/ }).click();
    await page.waitForURL((u) => u.pathname === "/seller", { timeout: 30000 });

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
      const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
      if (!env.url || !env.key) throw new Error("WRITE=1 needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
      const admin = createClient<Database>(env.url, env.key, { auth: { persistSession: false } });
      const sha = createHash("sha256").update(files.genuine).digest("hex");

      await checked(page, "genuine.pdf", files.genuine);
      await page.getByRole("button", { name: "Continue to price" }).click();
      await page.getByRole("button", { name: /^(Publish listing|Submit for review)$/ }).click();
      await page.waitForURL((u) => u.pathname === "/seller", { timeout: 60000 });
      const row = await admin.from("listings").select("id, status, quantity, ticket_path, checks").eq("ticket_sha256", sha).neq("status", "cancelled").maybeSingle();
      if (row.data) created.push(row.data.id);
      check("publish: listing stored with its file and checks", !!row.data?.ticket_path && row.data.quantity === 1 && !!row.data.checks, JSON.stringify(row.data ?? row.error));
      const held = await admin.from("listing_barcodes").select("held").eq("listing_id", row.data?.id ?? "");
      check("publish: its barcode is held", held.data?.length === 1 && held.data[0].held === true, JSON.stringify(held.data ?? held.error));
      const stored = row.data?.ticket_path ? await admin.storage.from("tickets").download(row.data.ticket_path) : null;
      check("publish: the stored file is the uploaded file", !!stored?.data && createHash("sha256").update(Buffer.from(await stored.data.arrayBuffer())).digest("hex") === sha);

      text = await checked(page, "redrawn.pdf", files.redrawn);
      check("same barcode in another file: blocked before publishing", text.includes("Already behind another listing on Lummy"), text.slice(0, 300));
      await page.getByRole("button", { name: "Continue to price" }).click();
      check("same barcode: publish button says blocked", await page.getByRole("button", { name: "Blocked (duplicate)" }).isDisabled());
      const direct = await page.evaluate(async (bytes) => {
        const form = new FormData();
        for (const [k, v] of Object.entries({ eventId: "ev-tulus", tierId: "t-tl-vip", askPrice: "1500000", quantity: "1", splittable: "false", gateKtp: "false" })) form.append(k, v);
        form.append("ticket", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), "redrawn.pdf");
        const r = await fetch("/api/listings", { method: "POST", body: form });
        return { status: r.status, body: await r.text() };
      }, [...files.redrawn]);
      check("same barcode: the server refuses it too (409)", direct.status === 409, JSON.stringify(direct));
    }
  } catch (e) {
    check("flow ran to the end", false, (e as Error).message.split("\n")[0].slice(0, 200));
  } finally {
    if (created.length) {
      const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! };
      const admin = createClient<Database>(env.url, env.key, { auth: { persistSession: false } });
      const paths = (await admin.from("listings").select("ticket_path").in("id", created)).data?.map((r) => r.ticket_path).filter((p): p is string => !!p) ?? [];
      if (paths.length) await admin.storage.from("tickets").remove(paths);
      const gone = await admin.from("listings").delete().in("id", created);
      const left = await admin.from("listing_barcodes").select("listing_id").in("listing_id", created);
      check("cleanup: test listings, files and barcodes removed", !gone.error && (left.data?.length ?? 1) === 0, gone.error?.message);
    }
    check("no page errors", pageErrors.length === 0, [...new Set(pageErrors)].join(" | "));
    await browser.close();
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note.slice(0, 200)})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass${WRITE ? "" : " (read-only; WRITE=1 also publishes and cleans up)"}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
