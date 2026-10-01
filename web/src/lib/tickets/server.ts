// The server side of the ticket check: the pepper, the duplicate lookup and a self-test. The check
// route and the listing route both go through checkTicket, so what the seller is shown before
// publishing is what publishing decides.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { MAX_TICKET_BYTES, analyzeTicket, type TicketAnalysis, type TicketErrorCode } from "./analyze";
import type { TicketCheck } from "./checks";

if (typeof window !== "undefined") throw new Error("lib/tickets/server is server-only");

/** What the routes answer when a file cannot be checked at all. */
export const TICKET_ERRORS: Record<TicketErrorCode, string> = {
  not_pdf: "file ini bukan PDF",
  too_big: `file lebih dari ${MAX_TICKET_BYTES / 1024 / 1024} MB`,
  password: "PDF ini dikunci kata sandi, upload versi tanpa kata sandi dari penyelenggara",
  unreadable: "PDF ini tidak bisa dibaca",
};

/** The HMAC pepper. Under 32 characters the check stays off, since a short one makes keys guessable. */
export function ticketPepper() {
  const v = process.env.TICKET_BARCODE_PEPPER?.trim() ?? "";
  return v.length >= 32 ? v : null;
}

export async function checkTicket(
  admin: SupabaseClient<Database>,
  bytes: Uint8Array,
  pepper: string
): Promise<{ analysis: TicketAnalysis; check: TicketCheck }> {
  const analysis = await analyzeTicket(bytes, pepper);
  const keys = analysis.barcodes.map((b) => b.key);
  const [held, sameFile] = await Promise.all([
    keys.length
      ? admin.from("listing_barcodes").select("barcode_hmac").eq("held", true).in("barcode_hmac", keys)
      : Promise.resolve({ data: [] as { barcode_hmac: string }[], error: null }),
    admin.from("listings").select("id", { count: "exact", head: true }).eq("ticket_sha256", analysis.sha256).not("status", "in", "(cancelled,rejected)"),
  ]);
  if (held.error) throw new Error(held.error.message);
  if (sameFile.error) throw new Error(sameFile.error.message);
  const taken = new Set((held.data ?? []).map((r) => r.barcode_hmac));
  const f = analysis.forensics;
  return {
    analysis,
    check: {
      pages: analysis.pages,
      scannedPages: analysis.scannedPages,
      barcodes: analysis.barcodes.map((b) => ({ format: b.format, tail: b.tail, page: b.page, taken: taken.has(b.key) })),
      sameFile: (sameFile.count ?? 0) > 0,
      score: f.score,
      suspicious: f.suspicious,
      reasons: f.reasons,
      producer: f.producer,
    },
  };
}

/**
 * The key of a listing's whole set, kept in listings.barcode_hmac and meant for the contract's
 * barcodeCommit: the barcode's own key when there is one, else a hash over the sorted keys.
 */
export function setKey(keys: string[]) {
  if (keys.length === 1) return keys[0];
  return createHash("sha256").update([...keys].sort().join(",")).digest("hex");
}

// A one-page PDF with a filled square, built in memory: nothing on it to read, so the reader
// runs its full second pass (pdf.js, the canvas and the decoder) and must come back empty.
function tinyPdf() {
  const content = "0 0 0 rg 50 50 100 100 re f";
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>",
    `<</Length ${content.length}>>stream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

let selfTest: Promise<boolean> | null = null;
/** Whether this deployment can read tickets at all: native canvas, pdf.js worker and wasm all load. */
export function readerWorks() {
  selfTest ??= analyzeTicket(tinyPdf(), "self-test, not a pepper, 0123456789abcdef")
    .then((a) => a.pages === 1 && a.barcodes.length === 0)
    .catch((e) => {
      console.error("ticket reader self-test failed:", e);
      selfTest = null;
      return false;
    });
  return selfTest;
}
