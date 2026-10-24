/**
 * The sample ticket PDFs a demo seller can download on /sell (public/samples): one for each sample
 * the page offers, all for the show the demo form starts on (5 Seconds of Summer, Second Show,
 * CAT 3), so the file and the filled-in form agree, and stamped as samples so nobody takes one
 * for a ticket. Lummy Demo Fest is always tomorrow, so a listing on it would wait for review. A demo account only simulates the check on them; a real check reads the stamp
 * and sends the file to a person.
 *
 *   npx tsx scripts/sample-tickets.ts
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { ISSUED, appendRevision, drawCode, initWriter } from "./ticket-fixtures";

const OUT = path.join(process.cwd(), "public", "samples");
const PAYLOAD = "LUMMY-SAMPLE|ev-5sos-jakarta|CAT3|8842-7731-2290";

async function sample(o: { name: string; seat: string; what: string[]; producer: string; modified?: Date; edit?: boolean }) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle("5 Seconds of Summer, Jakarta, Second Show - SAMPLE ticket / tiket CONTOH");
  doc.setProducer(o.producer);
  doc.setCreator("Lummy sample ticket");
  doc.setCreationDate(ISSUED);
  doc.setModificationDate(o.modified ?? ISSUED);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([420, 595]);
  const red = rgb(0.75, 0, 0);
  page.drawText("SAMPLE - NOT A REAL TICKET", { x: 36, y: 560, size: 12, font: bold, color: red });
  page.drawText("CONTOH - BUKAN TIKET ASLI", { x: 36, y: 545, size: 12, font: bold, color: red });
  page.drawText("5 SECONDS OF SUMMER, SECOND SHOW", { x: 36, y: 515, size: 15, font: bold });
  page.drawText("Indonesia Arena, Jakarta. Sun 6 Dec 2026, 18:00 WIB", { x: 36, y: 499, size: 10, font });
  page.drawText(`Name: ${o.name}`, { x: 36, y: 478, size: 12, font });
  page.drawText("Category: CAT 3", { x: 36, y: 462, size: 12, font });
  page.drawText(`Seat: ${o.seat}`, { x: 36, y: 446, size: 12, font });
  if (o.edit) {
    // Typed over the category the way a quick edit does: a white box, and new words in another font.
    page.drawRectangle({ x: 92, y: 459, width: 60, height: 16, color: rgb(1, 1, 1) });
    page.drawText("VIP", { x: 94, y: 462, size: 12, font: bold });
  }
  await drawCode(doc, page, { text: PAYLOAD, format: "QRCode" });
  page.drawText("SAMPLE / CONTOH", { x: 40, y: 362, size: 34, font: bold, rotate: degrees(8), color: red, opacity: 0.35 });
  const lines = [
    "Not valid for entry. Tidak berlaku untuk masuk.",
    "A sample file for trying the checks at lummy.id/sell.",
    "File contoh untuk mencoba cek tiket di lummy.id/sell.",
    "",
    ...o.what,
  ];
  lines.forEach((line, i) => page.drawText(line, { x: 36, y: 120 - i * 14, size: 9, font, color: rgb(0.3, 0.3, 0.3) }));
  return doc.save({ useObjectStreams: false });
}

async function main() {
  await initWriter();
  await mkdir(OUT, { recursive: true });
  const genuine = await sample({
    name: "Zahra Amelia", seat: "Free standing", producer: "Lummy sample issuer",
    what: ["This sample: as issued, never edited.", "Contoh ini: seperti diterbitkan, tidak pernah diedit."],
  });
  // Edited after issue and saved again by an online editor, which appends a revision.
  const edited = appendRevision(
    await sample({
      name: "Zahra Amelia", seat: "Free standing", producer: "iLovePDF", modified: new Date("2026-10-20T21:14:00+07:00"), edit: true,
      what: ["This sample: edited after issue, CAT 3 typed over as VIP.", "Contoh ini: diedit setelah terbit, CAT 3 ditimpa jadi VIP."],
    }),
    "/Producer (iLovePDF) /ModDate (D:20261020211400+07'00')"
  );
  // Another holder, the same barcode: a ticket sold once already.
  const duplicate = await sample({
    name: "Budi Santoso", seat: "Free standing", producer: "Lummy sample issuer",
    what: ["This sample: the same barcode as a ticket already sold.", "Contoh ini: barcode-nya sama dengan tiket yang sudah terjual."],
  });
  const files: [string, Uint8Array][] = [
    ["sample-ticket-genuine.pdf", genuine],
    ["sample-ticket-edited.pdf", edited],
    ["sample-ticket-duplicate.pdf", duplicate],
  ];
  for (const [name, bytes] of files) {
    await writeFile(path.join(OUT, name), bytes);
    console.log(`${name}: ${bytes.length} bytes`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
