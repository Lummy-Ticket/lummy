// A draft letter of authorisation for one order, made in the browser as a PDF (docs/04 §4). Lummy
// does not sign it and adds no stamp: the seller writes in their full name and NIK by hand, signs on
// a Rp10.000 paper stamp, and gives it to the buyer with a copy of their ID card. Lummy holds neither
// the full legal names nor any NIK, so those lines stay blank. A certified e-signature and e-stamp
// through a licensed provider (PSrE) replace the paper once lib/features.ts says eStamp.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type LetterOrder = {
  id: string;
  eventTitle: string;
  eventDateISO: string;
  venue?: string;
  city?: string;
  tierName: string;
  quantity: number;
  /** The buyer's name as their profile has it, if it has one. */
  buyerName?: string;
};

// The standard fonts cover Latin-1 only; anything else (a Korean title, an emoji) is dropped
// rather than failing the whole file.
const latin = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

export async function letterPdf(o: LetterOrder): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Draf surat kuasa ${o.id.toUpperCase()}`);
  doc.setProducer("lummy.id");
  const page = doc.addPage([595, 842]); // A4
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.17, 0.29);
  const grey = rgb(0.37, 0.42, 0.5);
  const left = 64;
  let y = 770;

  const text = (s: string, opts: { font?: PDFFont; size?: number; x?: number; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(latin(s), { x: opts.x ?? left, y, size: opts.size ?? 11, font: opts.font ?? regular, color: opts.color ?? ink });
  };
  const line = (label: string, value?: string) => {
    text(label);
    if (value) text(`: ${value}`, { x: left + 120 });
    else drawBlank(page, left + 120, y, 300);
    y -= 22;
  };
  const para = (s: string, width = 467) => {
    for (const row of wrap(latin(s), regular, 11, width)) {
      text(row);
      y -= 16;
    }
    y -= 6;
  };

  text("SURAT KUASA", { font: bold, size: 16, x: (595 - bold.widthOfTextAtSize("SURAT KUASA", 16)) / 2 });
  y -= 18;
  text(`Draf untuk pesanan Lummy ${o.id.toUpperCase()}`, { size: 9, color: grey, x: (595 - regular.widthOfTextAtSize(`Draf untuk pesanan Lummy ${o.id.toUpperCase()}`, 9)) / 2 });
  y -= 36;

  para("Yang bertanda tangan di bawah ini:");
  line("Nama lengkap");
  line("NIK");
  line("Alamat");
  para("selanjutnya disebut Pemberi Kuasa, dengan ini memberi kuasa kepada:");
  line("Nama lengkap", o.buyerName || undefined);
  line("NIK");
  para("selanjutnya disebut Penerima Kuasa, untuk menukarkan dan menggunakan tiket berikut atas nama Pemberi Kuasa:");
  line("Acara", o.eventTitle);
  line("Tanggal", day(o.eventDateISO));
  if (o.venue || o.city) line("Tempat", [o.venue, o.city].filter(Boolean).join(", "));
  line("Kategori", o.tierName);
  line("Jumlah", `${o.quantity} tiket`);
  y -= 6;
  para("Surat kuasa ini berlaku sampai acara tersebut selesai, dan dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.");
  y -= 8;
  text("Dibuat di", {});
  drawBlank(page, left + 60, y, 140);
  text(", tanggal", { x: left + 206 });
  drawBlank(page, left + 252, y, 140);
  y -= 46;

  // Two signature blocks: the giver signs across the stamp.
  const colRight = 340;
  text("Pemberi Kuasa", { font: bold });
  text("Penerima Kuasa", { font: bold, x: colRight });
  y -= 14;
  page.drawRectangle({ x: left, y: y - 70, width: 92, height: 62, borderColor: grey, borderWidth: 0.6, borderDashArray: [3, 3] });
  page.drawText("Meterai", { x: left + 26, y: y - 34, size: 9, font: regular, color: grey });
  page.drawText("Rp10.000", { x: left + 22, y: y - 46, size: 9, font: regular, color: grey });
  y -= 104;
  drawBlank(page, left, y, 200);
  drawBlank(page, colRight, y, 190);
  y -= 14;
  text("nama jelas", { size: 9, color: grey });
  text("nama jelas", { size: 9, color: grey, x: colRight });

  // The footer says what this is, so nobody mistakes a draft for a signed document.
  const footer =
    "Draf dari lummy.id. Lummy tidak menandatangani surat ini dan belum membubuhkan e-meterai. Pemberi Kuasa menandatanganinya di atas meterai Rp10.000, lalu menyerahkannya kepada Penerima Kuasa bersama fotokopi KTP-nya. Keputusan akhir di pintu masuk ada pada penyelenggara.";
  let fy = 92;
  for (const row of wrap(footer, regular, 8.5, 467)) {
    page.drawText(row, { x: left, y: fy, size: 8.5, font: regular, color: grey });
    fy -= 12;
  }

  return doc.save();
}

function drawBlank(page: PDFPage, x: number, y: number, width: number) {
  page.drawLine({ start: { x, y: y - 3 }, end: { x: x + width, y: y - 3 }, thickness: 0.6, color: rgb(0.6, 0.64, 0.7), dashArray: [2, 2] });
}

function wrap(s: string, font: PDFFont, size: number, width: number): string[] {
  const rows: string[] = [];
  let row = "";
  for (const word of s.split(/\s+/)) {
    const next = row ? `${row} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && row) {
      rows.push(row);
      row = word;
    } else row = next;
  }
  if (row) rows.push(row);
  return rows;
}

/** Makes the draft and hands it to the browser as a download. */
export async function downloadLetter(o: LetterOrder) {
  const bytes = await letterPdf(o);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `draf-surat-kuasa-${o.id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
