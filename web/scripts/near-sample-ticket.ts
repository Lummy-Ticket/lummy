/**
 * The sample ticket the team lists for the NEAR HACKATHON demo: Binance Blockchain Week 2026, Early
 * Bird, stamped as a sample Lummy made, with a barcode no other file carries. Listed by a team seller
 * on lummy.id, it gives the demo a file to read in NEAR AI's TEE and to hand over to the buyer. The
 * real check reads the stamp and sends the listing to a person, who clears it. Nobody could use it at
 * a door: it is not issued by the organiser.
 *
 *   npx tsx scripts/near-sample-ticket.ts [out.pdf]
 *
 * Each run makes a new barcode, so a second listing is not refused as a duplicate of the first.
 * The holder printed on it is the sample persona, Maya Kusuma: type that name on /sell.
 */
import { randomInt } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { ISSUED, drawCode, initWriter } from "./ticket-fixtures";

const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join("");

async function main() {
  const out = path.resolve(process.argv[2] ?? "near-sample-ticket.pdf");
  const serial = `${digits(4)}-${digits(4)}-${digits(4)}`;
  const payload = `LUMMY-SAMPLE|ev-bbw-2026|EARLY-BIRD|${serial}`;

  await initWriter();
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle("Binance Blockchain Week 2026, Bangkok - SAMPLE ticket made by Lummy");
  doc.setProducer("Lummy sample issuer");
  doc.setCreator("Lummy sample ticket (NEAR HACKATHON demo)");
  doc.setCreationDate(ISSUED);
  doc.setModificationDate(ISSUED);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([420, 595]);
  const red = rgb(0.75, 0, 0);

  page.drawText("SAMPLE - NOT A REAL TICKET", { x: 36, y: 560, size: 12, font: bold, color: red });
  page.drawText("Made by Lummy for its NEAR HACKATHON demo", { x: 36, y: 545, size: 10, font: bold, color: red });
  page.drawText("BINANCE BLOCKCHAIN WEEK 2026", { x: 36, y: 515, size: 14, font: bold });
  page.drawText("Queen Sirikit National Convention Center, Bangkok", { x: 36, y: 499, size: 10, font });
  page.drawText("Sat 28 Nov 2026, 09:00 (GMT+7)", { x: 36, y: 485, size: 10, font });
  page.drawText("Name: Maya Kusuma", { x: 36, y: 462, size: 12, font });
  page.drawText("Ticket type: Early Bird", { x: 36, y: 446, size: 12, font });
  page.drawText("Price: USD 19.00", { x: 36, y: 430, size: 12, font });
  page.drawText(`Order: BBW26-${digits(6)}`, { x: 36, y: 414, size: 10, font });
  await drawCode(doc, page, { text: payload, format: "QRCode" });
  page.drawText("SAMPLE", { x: 70, y: 362, size: 40, font: bold, rotate: degrees(8), color: red, opacity: 0.35 });
  const lines = [
    "Not valid for entry. Not issued by the organiser.",
    "A sample file for the Lummy demo at lummy.id/near.",
    "Admission: one person, show this code at the door.",
  ];
  lines.forEach((line, i) => page.drawText(line, { x: 36, y: 120 - i * 14, size: 9, font, color: rgb(0.3, 0.3, 0.3) }));

  await writeFile(out, await doc.save({ useObjectStreams: false }));
  console.log(`written: ${out}`);
  console.log(`barcode ends ...${serial.slice(-4)}; holder to type on /sell: Maya Kusuma`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
