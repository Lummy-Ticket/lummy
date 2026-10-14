// A ticket PDF made ready for the AI extraction (docs/09 §5.1): the text layer of each page and the
// barcode payloads read off it, both held in memory only, then cleaned by lib/tickets/clean.ts. No
// model is called here and nothing is stored: the caller sends the cleaned text, or nothing, to the
// model in lib/tickets/ai.ts (Gemini, docs/config/01).
import type { PDFPageProxy } from "pdfjs-dist";
import { MAX_TICKET_BYTES, mayHoldBarcode, openPdf, readPage, TicketError } from "./analyze";
import { cleanTicketText, type CleanResult } from "./clean";

if (typeof window !== "undefined") throw new Error("lib/tickets/extract is server-only");

/** The same bounds as the barcode reader: a stranger's file gets a fixed amount of work. */
const MAX_PAGES = 40;
const TIME_BUDGET_MS = 20_000;
const DPI = 150;
const MAX_IMAGE = 4_000_000;

/** A page's text layer, line by line as pdf.js reports it. */
async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  let out = "";
  for (const item of content.items) {
    if (!("str" in item)) continue;
    out += item.str + (item.hasEOL ? "\n" : " ");
  }
  return out;
}

export type TicketText = { pages: string[]; payloads: string[] };

/**
 * The text of every page, and the payload of every barcode the decoder reads. The payloads exist
 * only so the cleaner can take them out of the text (a ticket often prints its code under it).
 */
export async function readTicketText(bytes: Uint8Array): Promise<TicketText> {
  if (bytes.length > MAX_TICKET_BYTES) throw new TicketError("too_big", `file is over ${MAX_TICKET_BYTES / 1024 / 1024} MB`);
  if (!new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-")) throw new TicketError("not_pdf", "not a PDF file");
  const deadline = Date.now() + TIME_BUDGET_MS;
  const { task, doc, OPS } = await openPdf(bytes, MAX_IMAGE);
  const pages: string[] = [];
  const payloads = new Set<string>();
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && Date.now() < deadline; n++) {
      const page = await doc.getPage(n);
      try {
        pages.push(await pageText(page));
        if (mayHoldBarcode(await page.getOperatorList(), OPS)) {
          for (const c of await readPage(page, DPI)) payloads.add(c.text);
        }
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await task.destroy();
  }
  return { pages, payloads: [...payloads] };
}

/**
 * The ticket as it may leave for the model, or why it may not. `names`: the seller's account name
 * and the holder's name the seller typed, both taken out wherever they appear.
 */
export async function prepareForExtraction(bytes: Uint8Array, names: string[]): Promise<CleanResult> {
  const { pages, payloads } = await readTicketText(bytes);
  return cleanTicketText({ pages, payloads, names });
}
