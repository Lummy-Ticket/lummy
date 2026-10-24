// Reads a ticket PDF the way the gate and a careful person would: renders each page and reads
// every barcode on it (docs/09 §5.2), inspects how the file was made and changed, and reads its
// text for a "VOID" or "CONTOH" stamp (§5.3).
// The PDF comes from a stranger, so the work is bounded: file size, pages, image size and time.
import { createHash } from "node:crypto";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { barcodeKey, decodeImage, packageFile, payloadTail } from "./barcode";
import { judge, scanStructure, type Forensics, type TextRun } from "./forensics";

if (typeof window !== "undefined") throw new Error("lib/tickets/analyze is server-only");

/** Vercel refuses request bodies over 4.5 MB, and e-tickets are far smaller. */
export const MAX_TICKET_BYTES = 4 * 1024 * 1024;
/**
 * One PDF often carries a whole order: a real one tried here holds four tickets, each followed by
 * seven pages of terms. Pages of only text are skipped cheaply, so the limit can be generous.
 */
const MAX_PAGES = 40;
const TIME_BUDGET_MS = 20_000;
const MAX_SIDE_PX = 5000;
/** Separate vector shapes from which a page counts as possibly drawing a barcode. */
const MIN_SHAPES = 20;

/**
 * Two passes. The first renders only pages that draw a picture or many vector shapes, and skips
 * very large pictures: ticket PDFs printed from a web page carry a full-page background photo on
 * every page, pdf.js decodes JPEG in plain JavaScript on a server (seconds per picture), and the
 * barcode itself is a small picture or vector shapes. Only when the first pass reads nothing at
 * all does the second render the first pages in full, sharper: a ticket that is one big scan or
 * screenshot, a dense code, or a code set in a barcode font.
 */
const PASSES = [
  // 150 DPI read every code on the real e-tickets this was tried on (QR and Code 128, from
  // Chrome, jsPDF and openhtmltopdf), at about half the cost of 200.
  { dpi: 150, maxImageSize: 4_000_000, pages: MAX_PAGES, onlyGraphics: true },
  // Above this, a picture is a decompression bomb rather than a ticket.
  { dpi: 300, maxImageSize: 40_000_000, pages: 3, onlyGraphics: false },
];

type OperatorList = { fnArray: number[]; argsArray: unknown[] };

/** Whether a page draws something a barcode could be: a picture, or many separate shapes. */
export function mayHoldBarcode(ops: OperatorList, OPS: Record<string, number>) {
  const pictures = new Set(Object.entries(OPS).filter(([name]) => name.includes("Image")).map(([, fn]) => fn));
  let shapes = 0;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (pictures.has(fn)) return true;
    if (fn !== OPS.constructPath) continue;
    // [paint op, [path], bbox]; the path is pdf.js draw ops: 0 moveTo x y, 1 lineTo x y,
    // 2 curveTo (6 numbers), 3 quadraticCurveTo (4), 4 closePath.
    const path = (ops.argsArray[i] as [number, [ArrayLike<number> | null]] | undefined)?.[1]?.[0];
    for (let j = 0; path && j < path.length; ) {
      const op = path[j];
      if (op === 0) shapes++;
      j += op === 0 || op === 1 ? 3 : op === 2 ? 7 : op === 3 ? 5 : 1;
    }
    if (shapes >= MIN_SHAPES) return true;
  }
  return false;
}

export type TicketBarcode = {
  /** HMAC of the payload: what is stored and compared, never the payload itself. */
  key: string;
  format: string;
  /** Last characters of the payload, for the seller to recognise the ticket. */
  tail: string;
  page: number;
};

export type TicketAnalysis = {
  sha256: string;
  size: number;
  pages: number;
  /** Pages read in full by the first pass. Fewer than `pages` means some were not checked. */
  scannedPages: number;
  barcodes: TicketBarcode[];
  forensics: Forensics;
};

export type TicketErrorCode = "not_pdf" | "too_big" | "password" | "unreadable";

export class TicketError extends Error {
  constructor(
    readonly code: TicketErrorCode,
    message: string
  ) {
    super(message);
  }
}

const nonEmpty = (x: unknown) => (x instanceof Map ? x.size > 0 : !!x && typeof x === "object" && Object.keys(x).length > 0);

export async function openPdf(
  bytes: Uint8Array,
  maxImageSize: number
): Promise<{ task: PDFDocumentLoadingTask; doc: PDFDocumentProxy; OPS: Record<string, number> }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const root = path.dirname(packageFile("pdfjs-dist/package.json"));
  const task = pdfjs.getDocument({
    // pdf.js takes the buffer it is given, so it gets a copy.
    data: bytes.slice(),
    standardFontDataUrl: `${root}/standard_fonts/`,
    cMapUrl: `${root}/cmaps/`,
    wasmUrl: `${root}/wasm/`,
    iccUrl: `${root}/iccs/`,
    useSystemFonts: false,
    enableXfa: false,
    maxImageSize,
    verbosity: 0,
  });
  try {
    return { task, doc: await task.promise, OPS: pdfjs.OPS as Record<string, number> };
  } catch (e) {
    await task.destroy();
    if ((e as Error)?.name === "PasswordException") throw new TicketError("password", "the PDF needs a password");
    throw new TicketError("unreadable", "the PDF could not be read");
  }
}

export async function readPage(page: PDFPageProxy, dpi: number) {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(dpi / 72, MAX_SIDE_PX / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  // Transparent pixels read as black, so the page goes on white paper first.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport, background: "#ffffff" }).promise;
  return decodeImage({ data: ctx.getImageData(0, 0, width, height).data, width, height });
}

/** A page's text, each run with its size: the vertical scale of its matrix, so slanted text counts too. */
async function textRuns(page: PDFPageProxy): Promise<TextRun[]> {
  const content = await page.getTextContent();
  return content.items.flatMap((item) => ("str" in item ? [{ str: item.str, size: Math.hypot(item.transform[2], item.transform[3]), eol: item.hasEOL }] : []));
}

export async function analyzeTicket(bytes: Uint8Array, pepper: string): Promise<TicketAnalysis> {
  if (bytes.length > MAX_TICKET_BYTES) throw new TicketError("too_big", `file is over ${MAX_TICKET_BYTES / 1024 / 1024} MB`);
  if (!new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-")) throw new TicketError("not_pdf", "not a PDF file");
  const deadline = Date.now() + TIME_BUDGET_MS;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const structure = scanStructure(bytes);

  const found = new Map<string, TicketBarcode>();
  let pages = 0;
  let scannedPages = 0;
  let forensics: Forensics | null = null;

  for (const [i, pass] of PASSES.entries()) {
    if (i > 0 && (found.size > 0 || Date.now() >= deadline)) break;
    const { task, doc, OPS } = await openPdf(bytes, pass.maxImageSize);
    try {
      pages = doc.numPages;
      const scripts: string[] = [];
      const text: TextRun[][] = [];
      for (let n = 1; n <= Math.min(pages, pass.pages) && Date.now() < deadline; n++) {
        const page = await doc.getPage(n);
        try {
          if (i === 0 && nonEmpty(await page.getJSActions())) scripts.push("JavaScript");
          if (i === 0) text.push(await textRuns(page));
          // The operator list is cached and reused by render, so the look costs nothing extra.
          if (!pass.onlyGraphics || mayHoldBarcode(await page.getOperatorList(), OPS)) {
            for (const c of await readPage(page, pass.dpi)) {
              const key = barcodeKey(c.bytes, pepper);
              if (!found.has(key)) found.set(key, { key, format: c.format, tail: payloadTail(c.text), page: n });
            }
          }
          if (i === 0) scannedPages = n;
        } finally {
          page.cleanup();
        }
      }

      if (i === 0) {
        // pdf.js types the info dictionary as a bare Object.
        const { info, metadata } = (await doc.getMetadata()) as unknown as {
          info: Record<string, unknown>;
          metadata: { getRaw(): string } | null;
        };
        const str = (v: unknown) => (typeof v === "string" ? v : null);
        const active = [...scripts];
        if (nonEmpty(await doc.getJSActions())) active.push("JavaScript");
        if (nonEmpty(await doc.getAttachments())) active.push("EmbeddedFile");
        if (doc.isPureXfa) active.push("XFA");
        forensics = judge(structure, {
          producer: str(info.Producer),
          creator: str(info.Creator),
          creationDate: str(info.CreationDate),
          modDate: str(info.ModDate),
          xmp: metadata?.getRaw() ?? null,
          activeContent: [...new Set(active)],
          text,
        });
      }
    } finally {
      await task.destroy();
    }
  }

  return { sha256, size: bytes.length, pages, scannedPages, barcodes: [...found.values()], forensics: forensics! };
}
