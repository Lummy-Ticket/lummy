// A ticket PDF made ready for the AI extraction (docs/09 §5.1): the text layer of each page and the
// barcode payloads read off it, both held in memory only, then cleaned by lib/tickets/clean.ts. No
// model is called here and nothing is stored: the caller sends the cleaned text, or nothing, to the
// model in lib/tickets/ai.ts (Claude, docs/config/01).
import type { PDFPageProxy } from "pdfjs-dist";
import { MAX_TICKET_BYTES, mayHoldBarcode, openPdf, readPage, TicketError } from "./analyze";
import { cleanTicketText, type CleanResult } from "./clean";

if (typeof window !== "undefined") throw new Error("lib/tickets/extract is server-only");

/** The same bounds as the barcode reader: a stranger's file gets a fixed amount of work. */
const MAX_PAGES = 40;
const TIME_BUDGET_MS = 20_000;
const DPI = 150;
const MAX_IMAGE = 4_000_000;

/**
 * What a glyph the font maps to no character becomes. pdf.js gives it as U+0000, most often for a
 * ligature: tiket.com's e-tickets print "fi" that way, so "confirmed" read "con rmed" and an email
 * starting "luthfi" lost "luth" to the cleaner (20 Oct 2026). It stays inside its word as U+FFFD,
 * which the cleaner's email and name patterns accept in place of those letters.
 */
export const UNMAPPED = "�";

/** pdf.js text items joined line by line. A glyph with no character joins its neighbours with no space. */
export function joinTextItems(items: { str: string; hasEOL?: boolean }[]) {
  let out = "";
  for (const item of items) {
    const str = item.str.replace(/\u0000/g, UNMAPPED);
    if (str && /^�+$/.test(str)) {
      out = out.replace(/ $/, "") + str + (item.hasEOL ? "\n" : "");
      continue;
    }
    out += str + (item.hasEOL ? "\n" : " ");
  }
  return out;
}

/** A page's text layer, line by line as pdf.js reports it. */
async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  return joinTextItems(content.items.flatMap((item) => ("str" in item ? [item] : [])));
}

/** `barcodePages`: the pages (from 1) a barcode was read on, one per ticket in most files. */
export type TicketText = { pages: string[]; payloads: string[]; barcodePages: number[] };

/**
 * The text of every page, the payload of every barcode the decoder reads, and the pages it read
 * them on. The payloads exist only so the cleaner can take them out of the text (a ticket often
 * prints its code under it); the pages, so each ticket's own page goes to the model first.
 */
export async function readTicketText(bytes: Uint8Array): Promise<TicketText> {
  if (bytes.length > MAX_TICKET_BYTES) throw new TicketError("too_big", `file is over ${MAX_TICKET_BYTES / 1024 / 1024} MB`);
  if (!new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-")) throw new TicketError("not_pdf", "not a PDF file");
  const deadline = Date.now() + TIME_BUDGET_MS;
  const { task, doc, OPS } = await openPdf(bytes, MAX_IMAGE);
  const pages: string[] = [];
  const payloads = new Set<string>();
  const barcodePages: number[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && Date.now() < deadline; n++) {
      const page = await doc.getPage(n);
      try {
        pages.push(await pageText(page));
        if (mayHoldBarcode(await page.getOperatorList(), OPS)) {
          const codes = await readPage(page, DPI);
          for (const c of codes) payloads.add(c.text);
          if (codes.length) barcodePages.push(n);
        }
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await task.destroy();
  }
  return { pages, payloads: [...payloads], barcodePages };
}

/**
 * The ticket as it may leave for the model, or why it may not, and how many barcodes it holds.
 * `names`: the seller's account name and the like, taken out wherever they appear; `holder`: the
 * holder's name as the seller typed it, which must also be printed on the ticket; `known`: words of
 * the shows on sale (lib/tickets/clean.ts).
 */
export async function prepareForExtraction(
  bytes: Uint8Array,
  names: string[],
  o: { holder?: string; known?: string[] } = {}
): Promise<CleanResult & { barcodes: number }> {
  const { pages, payloads, barcodePages } = await readTicketText(bytes);
  return { ...cleanTicketText({ pages, payloads, names, barcodePages, ...o }), barcodes: payloads.length };
}
