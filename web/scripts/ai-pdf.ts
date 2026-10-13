/**
 * The made-up tickets of ai-eval-cases.ts drawn into PDFs, so the AI step is measured on the path a
 * real upload takes: pdf.js reads the text layer, the decoder reads the QR codes, the cleaner takes
 * out what they found, and only then does anything leave. Two layouts: one line after another, and a
 * table whose labels and values are separate pieces of text, the way HTML printed to PDF comes out.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { EvalCase } from "./ai-eval-cases";
import { drawCode } from "./ticket-fixtures";

export type Layout = "lines" | "table";

export async function casePdf(c: EvalCase, layout: Layout): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setProducer("Lummy eval PDF engine");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [i, text] of c.pages.entries()) {
    const page = doc.addPage([595, 842]);
    let y = 790;
    for (const line of text.split("\n")) {
      const cut = layout === "table" ? line.indexOf(": ") : -1;
      if (cut > 0 && cut < 40) {
        page.drawText(line.slice(0, cut + 1), { x: 40, y, size: 10.5, font });
        page.drawText(line.slice(cut + 2), { x: 230, y, size: 10.5, font });
      } else {
        page.drawText(line, { x: 40, y, size: 10.5, font });
      }
      y -= 16;
    }
    // A ticket's code as a QR image under its text, which the decoder reads and the cleaner removes.
    if (i === 0) for (const payload of c.payloads ?? []) await drawCode(doc, page, { text: payload, format: "QRCode" });
  }
  return doc.save({ useObjectStreams: false });
}
