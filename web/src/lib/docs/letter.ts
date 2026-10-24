// A draft letter of authorisation for one order, made in the browser as a PDF (docs/04 §4). Lummy
// does not sign it and adds no stamp: each party writes in their full name and NIK or passport
// number by hand, the seller signs over a Rp10.000 paper stamp and gives it to the buyer with a copy
// of their ID. Lummy holds neither the full legal names nor any ID number, so those lines stay blank
// and say who fills them. The letter is in Indonesian, the language venue staff read; the small
// English notes under each heading are for a buyer from abroad. A certified e-signature and e-stamp
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
  /** The seller's name as Lummy shows it on the order, if known. */
  sellerName?: string;
  /** The buyer's name as their profile has it, if it has one. */
  buyerName?: string;
};

type Color = ReturnType<typeof rgb>;

const W = 595; // A4
const H = 842;
const LEFT = 56;
const RIGHT = W - 56;
const INK = rgb(0.11, 0.17, 0.29);
const GREY = rgb(0.37, 0.42, 0.5);
const LINE = rgb(0.6, 0.64, 0.7);
const TINT = rgb(0.94, 0.95, 0.97);
const BY_HAND = "(diisi tangan / fill in by hand)";

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
  const ref = o.id.toUpperCase();
  const doc = await PDFDocument.create();
  doc.setTitle(`Draf surat kuasa ${ref}`);
  doc.setProducer("lummy.id");
  const page = doc.addPage([W, H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  type Style = { font?: PDFFont; size?: number; color?: Color };
  /** Writes one line and returns where it ends, so a note can follow it. */
  const write = (s: string, x: number, y: number, st: Style = {}) => {
    const font = st.font ?? regular;
    const size = st.size ?? 10;
    const clean = latin(s);
    page.drawText(clean, { x, y, size, font, color: st.color ?? INK });
    return x + font.widthOfTextAtSize(clean, size);
  };
  const english = (s: string, x: number, y: number, size = 7.5) => write(s, x, y, { font: italic, size, color: GREY });
  const centred = (s: string, y: number, st: Style = {}) =>
    write(s, (W - (st.font ?? regular).widthOfTextAtSize(latin(s), st.size ?? 10)) / 2, y, st);

  let y = H - 38;

  // Header: whose draft this is, marked as one until both parties fill and sign it.
  write("lummy.id", LEFT, y, { font: bold, size: 9 });
  const badge = "DRAF / DRAFT";
  const badgeW = bold.widthOfTextAtSize(badge, 8) + 14;
  page.drawRectangle({ x: RIGHT - badgeW, y: y - 4.5, width: badgeW, height: 15, borderColor: GREY, borderWidth: 0.8 });
  write(badge, RIGHT - badgeW + 7, y, { font: bold, size: 8, color: GREY });
  y -= 30;
  centred("SURAT KUASA", y, { font: bold, size: 19 });
  y -= 14;
  centred("Letter of authorisation", y, { font: italic, size: 9.5, color: GREY });
  y -= 15;
  const refLabel = "Nomor pesanan / Order no.:";
  const refEnd = write(refLabel, (W - regular.widthOfTextAtSize(refLabel, 9) - 4 - bold.widthOfTextAtSize(ref, 9)) / 2, y, { size: 9 });
  write(ref, refEnd + 4, y, { font: bold, size: 9 });
  y -= 11;
  page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 1.2, color: INK });
  page.drawLine({ start: { x: LEFT, y: y - 2.5 }, end: { x: RIGHT, y: y - 2.5 }, thickness: 0.4, color: INK });
  y -= 12;

  // Who is who, before the letter uses the two terms (a tester could not tell them apart, 24 Oct).
  const note = wrap(
    latin("Baris bertanda (diisi tangan) ditulis sendiri oleh para pihak di kertas ini. Lummy tidak meminta KTP, paspor, atau nomornya dari siapa pun."),
    regular, 7.5, RIGHT - LEFT - 20
  );
  const noteEn = wrap(
    latin("Lines marked (fill in by hand) are written on this paper by the parties themselves. Lummy does not collect anyone's ID card, passport or ID number."),
    italic, 7, RIGHT - LEFT - 20
  );
  const boxH = 18 + 2 * 14 + note.length * 9.5 + noteEn.length * 8.5 + 9;
  page.drawRectangle({ x: LEFT, y: y - boxH, width: RIGHT - LEFT, height: boxH, color: TINT });
  let by = y - 14;
  english("The parties", write("Para pihak", LEFT + 10, by, { font: bold, size: 9 }) + 5, by, 7.5);
  by -= 15;
  for (const [term, meaning, en] of [
    ["Pemberi Kuasa", "= penjual, pemegang tiket asli", "(the seller, who holds the original ticket)"],
    ["Penerima Kuasa", "= pembeli, yang memakai tiket", "(the buyer, who uses the ticket)"],
  ]) {
    write(term, LEFT + 10, by, { font: bold, size: 9 });
    english(en, write(meaning, LEFT + 92, by, { size: 9 }) + 5, by, 7.5);
    by -= 14;
  }
  by -= 1;
  for (const row of note) {
    write(row, LEFT + 10, by, { size: 7.5, color: GREY });
    by -= 9.5;
  }
  for (const row of noteEn) {
    english(row, LEFT + 10, by, 7);
    by -= 8.5;
  }
  y -= boxH + 20;

  // A sentence of the letter, with its English in small type under it.
  const sentence = (id: string, en: string) => {
    for (const row of wrap(latin(id), regular, 10, RIGHT - LEFT)) {
      write(row, LEFT, y);
      y -= 12.5;
    }
    for (const row of wrap(latin(en), italic, 7.5, RIGHT - LEFT)) {
      english(row, LEFT, y + 2);
      y -= 9;
    }
    y -= 7;
  };
  const party = (term: string, en: string) => {
    english(en, write(term, LEFT, y, { font: bold, size: 8.5 }) + 5, y);
    y -= 17;
  };
  // A line a party fills in: the label in Indonesian with its English under it, and the note
  // under the line that it is written by hand.
  const blankLine = (label: string, en: string) => {
    write(label, LEFT, y);
    english(en, LEFT, y - 9);
    drawBlank(page, LEFT + 140, y, RIGHT - LEFT - 140);
    write(BY_HAND, LEFT + 140, y - 12, { size: 6.5, color: GREY });
    y -= 23;
  };

  sentence("Yang bertanda tangan di bawah ini:", "The undersigned:");
  party("PEMBERI KUASA", "Authoriser, the seller");
  blankLine("Nama lengkap", "Full name");
  blankLine("NIK / No. Paspor", "ID or passport no.");
  blankLine("Alamat", "Address");
  y -= 2;
  sentence("selanjutnya disebut Pemberi Kuasa, dengan ini memberi kuasa kepada:", "hereinafter the Authoriser, who hereby authorises:");
  party("PENERIMA KUASA", "Authorised person, the buyer");
  blankLine("Nama lengkap", "Full name");
  blankLine("NIK / No. Paspor", "ID or passport no.");
  y -= 2;
  sentence(
    "selanjutnya disebut Penerima Kuasa, untuk menukarkan dan menggunakan tiket berikut atas nama Pemberi Kuasa:",
    "hereinafter the Authorised person, to redeem and use the following ticket on the Authoriser's behalf:"
  );

  // The ticket, in a box of its own: what the staff at the door compare with the e-ticket.
  const half = (RIGHT - LEFT - 20) / 2;
  const place = [o.venue, o.city].filter(Boolean).join(", ");
  const rows: [string, string, string][][] = [
    [["Acara", "Event", o.eventTitle]],
    [["Tanggal", "Date", day(o.eventDateISO)], ...(place ? [["Tempat", "Venue", place] as [string, string, string]] : [])],
    [["Kategori", "Category", o.tierName], ["Jumlah", "Quantity", `${o.quantity} tiket / ${o.quantity} ${o.quantity === 1 ? "ticket" : "tickets"}`]],
  ];
  const ticketH = 20 + rows.length * 25 + 4;
  page.drawRectangle({ x: LEFT, y: y + 4 - ticketH, width: RIGHT - LEFT, height: ticketH, borderColor: LINE, borderWidth: 0.8 });
  let ty = y - 10;
  english("The ticket covered", write("Tiket yang dikuasakan", LEFT + 10, ty, { font: bold, size: 9 }) + 5, ty, 7.5);
  ty -= 17;
  for (const row of rows) {
    row.forEach(([label, en, value], i) => {
      const x = LEFT + 10 + i * (half + 10);
      const width = row.length === 1 ? RIGHT - LEFT - 20 : half;
      english(`/ ${en}`, write(label.toUpperCase(), x, ty, { font: bold, size: 6.5, color: GREY }) + 3, ty, 6.5);
      write(value, x, ty - 11, { size: fit(latin(value), regular, 10, width) });
    });
    ty -= 25;
  }
  y -= ticketH + 10;

  sentence(
    "Surat kuasa ini berlaku sampai acara tersebut selesai, dan dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.",
    "This letter is valid until the event ends, and is made truthfully, to be used as intended."
  );

  const madeEnd = write("Dibuat di", LEFT, y);
  english("Made at", LEFT, y - 9);
  drawBlank(page, madeEnd + 6, y, 150);
  write(BY_HAND, madeEnd + 6, y - 12, { size: 6.5, color: GREY });
  const dateX = madeEnd + 166;
  const dateEnd = write(", tanggal", dateX, y);
  english("date", dateX + 4, y - 9);
  drawBlank(page, dateEnd + 6, y, RIGHT - dateEnd - 6);
  write(BY_HAND, dateEnd + 6, y - 12, { size: 6.5, color: GREY });
  y -= 32;

  // Two signature blocks, each with the name Lummy knows under its line. The seller signs across
  // the stamp, half on it and half on the paper.
  const colR = LEFT + (RIGHT - LEFT) / 2 + 12;
  const sigW = (RIGHT - LEFT) / 2 - 22;
  const block = (x: number, term: string, en: string, name: string | undefined, stamp: boolean) => {
    write(`${term},`, x, y, { font: bold });
    english(en, x, y - 9.5);
    if (stamp) {
      const sx = x + 4;
      const sy = y - 70;
      page.drawRectangle({ x: sx, y: sy, width: 92, height: 56, borderColor: GREY, borderWidth: 0.7, borderDashArray: [3, 3] });
      const mid = (s: string, yy: number, st: Style) => write(s, sx + (92 - (st.font ?? regular).widthOfTextAtSize(s, st.size ?? 10)) / 2, yy, st);
      mid("METERAI", sy + 40, { font: bold, size: 8, color: GREY });
      mid("Rp10.000", sy + 29, { size: 8, color: GREY });
      mid("tanda tangan di atasnya", sy + 16, { size: 6, color: GREY });
      mid("sign across the stamp", sy + 8, { font: italic, size: 6, color: GREY });
    }
    const lineY = y - 80;
    page.drawLine({ start: { x, y: lineY }, end: { x: x + sigW, y: lineY }, thickness: 0.7, color: INK });
    if (name) {
      write(name, x, lineY - 12, { size: 9.5 });
      english("Nama di Lummy / Name on Lummy", x, lineY - 21, 6.5);
    } else {
      english("/ Full name", write("Nama jelas", x, lineY - 12, { size: 9.5, color: GREY }) + 3, lineY - 12, 8);
      write(BY_HAND, x, lineY - 21, { size: 6.5, color: GREY });
    }
  };
  block(LEFT, "Pemberi Kuasa", "Authoriser (the seller)", o.sellerName, true);
  block(colR, "Penerima Kuasa", "Authorised person (the buyer)", o.buyerName, false);

  // The footer says what this is, so nobody mistakes a draft for a signed document.
  const footer = wrap(
    latin(`Draf dari lummy.id untuk pesanan ${ref}. Lummy tidak menandatangani surat ini dan tidak membubuhkan e-meterai. Pemberi Kuasa menandatanganinya di atas meterai Rp10.000, lalu menyerahkannya kepada Penerima Kuasa bersama fotokopi KTP atau paspornya. Keputusan akhir di pintu masuk ada pada penyelenggara.`),
    regular, 7, RIGHT - LEFT
  );
  const footerEn = wrap(
    latin("A draft from lummy.id. Lummy does not sign this letter or add an e-stamp. The seller signs it over a Rp10,000 meterai (paper duty stamp) and gives it to the buyer with a copy of their ID card or passport. The organiser has the final say at the door."),
    italic, 6.5, RIGHT - LEFT
  );
  let fy = 26 + (footer.length + footerEn.length - 1) * 8;
  page.drawLine({ start: { x: LEFT, y: fy + 11 }, end: { x: RIGHT, y: fy + 11 }, thickness: 0.4, color: LINE });
  for (const row of footer) {
    write(row, LEFT, fy, { size: 7, color: GREY });
    fy -= 8;
  }
  for (const row of footerEn) {
    english(row, LEFT, fy, 6.5);
    fy -= 8;
  }

  return doc.save();
}

function drawBlank(page: PDFPage, x: number, y: number, width: number) {
  page.drawLine({ start: { x, y: y - 3 }, end: { x: x + width, y: y - 3 }, thickness: 0.6, color: LINE, dashArray: [2, 2] });
}

/** The largest size, down to 7pt, at which one line fits the width. */
function fit(s: string, font: PDFFont, size: number, width: number) {
  let n = size;
  while (n > 7 && font.widthOfTextAtSize(s, n) > width) n -= 0.5;
  return n;
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
