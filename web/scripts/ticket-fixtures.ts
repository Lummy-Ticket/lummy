/**
 * Ticket PDFs made on the spot for the ticket checks (tickets-check.ts, tickets-flow-check.ts),
 * so no real ticket is needed or kept: a genuine one, the same ticket edited three ways, a file
 * redrawn around the same barcode, two tickets in one PDF, one with no barcode, one with a script.
 */
import { readFile } from "fs/promises";
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import { packageFile } from "../src/lib/tickets/barcode";

export const ISSUED = new Date("2026-09-01T10:00:00+07:00");
export const GENUINE = "LMY|ev-tulus|VIP|C-12|8842-7731-2290";

export const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const asText = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

export type Code = { text: string; format: "QRCode" | "Code128"; vector?: boolean };

/** The barcode writer's wasm, from node_modules like the reader's. */
export async function initWriter() {
  const wasm = await readFile(packageFile("zxing-wasm/writer/zxing_writer.wasm"));
  await prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }, fireImmediately: true });
}

async function drawCode(doc: PDFDocument, page: PDFPage, code: Code) {
  const out = await writeBarcode(code.text, { format: code.format, sizeHint: 400, withQuietZones: false });
  if (out.error) throw new Error(out.error);
  const [x, y, w, h] = code.format === "QRCode" ? [120, 150, 180, 180] : [60, 200, 300, 80];
  if (!code.vector) {
    const png = await doc.embedPng(new Uint8Array(await out.image!.arrayBuffer()));
    page.drawImage(png, { x, y, width: w, height: h });
    return;
  }
  // As shapes, the way some ticketing systems draw their codes instead of embedding a picture.
  const { data, width, height } = out.symbol;
  const mw = w / width;
  const mh = code.format === "QRCode" ? h / height : h;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (data[row * width + col] !== 0) continue;
      const top = code.format === "QRCode" ? y + h - (row + 1) * mh : y;
      page.drawRectangle({ x: x + col * mw, y: top, width: mw + 0.02, height: mh + 0.02, color: rgb(0, 0, 0) });
    }
    if (code.format !== "QRCode") break; // a linear code is one row of bars
  }
}

export async function ticketPdf(o: { codes: Code[]; name?: string; producer: string; creator?: string; modified?: Date }) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setProducer(o.producer);
  doc.setCreator(o.creator ?? "Lummy test issuer");
  doc.setCreationDate(ISSUED);
  doc.setModificationDate(o.modified ?? ISSUED);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const code of o.codes.length ? o.codes : [null]) {
    const page = doc.addPage([420, 595]);
    page.drawText("TULUS - Tur Manusia 2026", { x: 36, y: 540, size: 16, font });
    page.drawText(`Name: ${o.name ?? "Zahra Amelia"}`, { x: 36, y: 510, size: 12, font });
    page.drawText("VIP - Row C - Seat 12 - Istora Senayan", { x: 36, y: 490, size: 12, font });
    if (code) await drawCode(doc, page, code);
  }
  return doc.save({ useObjectStreams: false });
}

/** What an editor that saves incrementally (Acrobat's plain Save) appends: new objects, a new xref, a /Prev. */
export function appendRevision(pdf: Uint8Array, info: string) {
  const s = asText(pdf);
  const startxref = Number(s.match(/startxref\s+(\d+)\s+%%EOF\s*$/)![1]);
  const trailer = s.slice(s.lastIndexOf("trailer"));
  const size = Number(trailer.match(/\/Size\s+(\d+)/)![1]);
  const root = trailer.match(/\/Root\s+(\d+\s+\d+\s+R)/)![1];
  const obj = `${size} 0 obj\n<< ${info} >>\nendobj\n`;
  const at = pdf.length + 1;
  const tail =
    `\n${obj}xref\n${size} 1\n${String(at).padStart(10, "0")} 00000 n \n` +
    `trailer\n<< /Size ${size + 1} /Root ${root} /Info ${size} 0 R /Prev ${startxref} >>\nstartxref\n${at + obj.length}\n%%EOF\n`;
  const out = new Uint8Array(pdf.length + tail.length);
  out.set(pdf);
  out.set(latin1(tail), pdf.length);
  return out;
}

/** Re-saved whole by another tool, the way online editors write their output. */
export async function rewrite(pdf: Uint8Array, producer: string) {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  doc.setProducer(producer);
  return doc.save({ useObjectStreams: false });
}

/** The same file with a script that runs on opening. */
export async function withScript(pdf: Uint8Array) {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const action = doc.context.obj({ Type: "Action", S: "JavaScript", JS: PDFString.of("app.alert('hi')") });
  doc.catalog.set(PDFName.of("OpenAction"), doc.context.register(action));
  return doc.save({ useObjectStreams: false });
}

/** A genuine ticket around `payload`, the producer a ticketing system would leave. */
export const genuineTicket = (payload = GENUINE) => ticketPdf({ codes: [{ text: payload, format: "QRCode" }], producer: "Lummy test issuer PDF engine" });
