/**
 * Ticket PDFs made on the spot for the ticket checks (tickets-check.ts, tickets-flow-check.ts),
 * so no real ticket is needed or kept: a genuine one, the same ticket edited three ways, a file
 * redrawn around the same barcode, two tickets in one PDF, one with no barcode, one with a script,
 * one stamped as a sample.
 */
import { readFile } from "fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb, type PDFPage } from "pdf-lib";
import piexif from "piexifjs";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import { packageFile } from "../src/lib/tickets/barcode";

export const ISSUED = new Date("2026-09-01T10:00:00+07:00");
export const GENUINE = "LMY|ev-5sos-jakarta|CAT3|C-12|8842-7731-2290";

export const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const asText = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

export type Code = { text: string; format: "QRCode" | "Code128"; vector?: boolean };

/** The barcode writer's wasm, from node_modules like the reader's. */
export async function initWriter() {
  const wasm = await readFile(packageFile("zxing-wasm/writer/zxing_writer.wasm"));
  await prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }, fireImmediately: true });
}

/** Draws a barcode on a page: a PNG image, or shapes when `vector` is set. */
export async function drawCode(doc: PDFDocument, page: PDFPage, code: Code) {
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

export async function ticketPdf(o: {
  codes: Code[];
  name?: string;
  producer: string;
  creator?: string;
  modified?: Date;
  extra?: string[];
  /** Printed large and slanted across the page, clear of the code, the way a sample is watermarked. */
  stamp?: string;
}) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setProducer(o.producer);
  doc.setCreator(o.creator ?? "Lummy test issuer");
  doc.setCreationDate(ISSUED);
  doc.setModificationDate(o.modified ?? ISSUED);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const code of o.codes.length ? o.codes : [null]) {
    const page = doc.addPage([420, 595]);
    // The catalogue's 5 Seconds of Summer second show (lib/mock/seed.ts): its day, name and venue, so
    // a model that checks them against the show finds it, as it should not for the first night or
    // the same tour elsewhere.
    page.drawText("5SOS: EVERYONE'S A STAR! JAKARTA", { x: 36, y: 540, size: 16, font });
    page.drawText("Minggu, 6 Desember 2026 - 18:00 WIB - Second Show", { x: 36, y: 524, size: 10, font });
    page.drawText(`Name: ${o.name ?? "Zahra Amelia"}`, { x: 36, y: 506, size: 12, font });
    page.drawText("CAT 3 - Row C - Seat 12 - Indonesia Arena", { x: 36, y: 490, size: 12, font });
    (o.extra ?? []).forEach((line, i) => page.drawText(line, { x: 36, y: 470 - i * 16, size: 10, font }));
    if (o.stamp) page.drawText(o.stamp, { x: 60, y: 360, size: 40, font, rotate: degrees(20), color: rgb(0.85, 0, 0), opacity: 0.4 });
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

/** A 1600x1200 "photo" for claims: a grey scene, with the code on a phone-like white panel when given. */
export async function photo(code: string | null, format: "jpeg" | "png") {
  const canvas = createCanvas(1600, 1200);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(0, 0, 1600, 1200);
  if (code) {
    const out = await writeBarcode(code, { format: "QRCode", withQuietZones: true });
    const { data, width, height } = out.symbol;
    const cell = 12;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(500, 250, width * cell + 40, height * cell + 40);
    ctx.fillStyle = "#000000";
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[y * width + x] === 0) ctx.fillRect(520 + x * cell, 270 + y * cell, cell, cell);
  }
  return new Uint8Array(format === "jpeg" ? await canvas.encode("jpeg") : await canvas.encode("png"));
}

/** A camera's EXIF (time, place, phone, an editing app), written into a JPEG the way a phone would. */
export function withExif(jpeg: Uint8Array) {
  const exif = piexif.dump({
    "0th": { [piexif.ImageIFD.Make]: "samsung", [piexif.ImageIFD.Model]: "SM-S918B", [piexif.ImageIFD.Software]: "Snapseed 2.0" },
    Exif: { [piexif.ExifIFD.DateTimeOriginal]: "2026:12:20 19:30:00" },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: "S",
      [piexif.GPSIFD.GPSLatitude]: [[6, 1], [13, 1], [700, 100]],
      [piexif.GPSIFD.GPSLongitudeRef]: "E",
      [piexif.GPSIFD.GPSLongitude]: [[106, 1], [48, 1], [800, 100]],
    },
  });
  return new Uint8Array(Buffer.from(piexif.insert(exif, Buffer.from(jpeg).toString("binary")), "binary"));
}
