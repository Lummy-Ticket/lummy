// The file a buyer downloads instead of the seller's ticket while every payment is simulated
// (lib/features.ts, `payouts` off). Anyone with an account can press "Simulate payment", so handing
// over the real PDF would give a real ticket away. The stand-in carries the order's facts and no
// barcode, and says plainly that it is not a ticket. Nothing personal is printed on it.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

if (typeof window !== "undefined") throw new Error("lib/docs/standin hanya untuk server");

export interface StandInOrder {
  id: string;
  eventTitle: string;
  eventDate: string | null;
  venue?: string | null;
  city?: string | null;
  tierName: string;
  quantity: number;
}

const day = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))
    : "";

/** The standard fonts only draw WinAnsi characters; anything else becomes "?" rather than failing. */
const drawable = (font: PDFFont, text: string) => {
  try {
    font.encodeText(text);
    return text;
  } catch {
    return [...text].map((c) => { try { font.encodeText(c); return c; } catch { return "?"; } }).join("");
  }
};

export async function standInTicket(o: StandInOrder): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Lummy beta: not a ticket (${o.id})`);
  doc.setProducer("Lummy");
  doc.setCreator("Lummy beta stand-in");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([420, 595]);
  const red = rgb(0.75, 0, 0);
  const gray = rgb(0.3, 0.3, 0.3);
  let y = 555;
  const line = (text: string, size: number, f: PDFFont = font, color = rgb(0, 0, 0), gap = 6) => {
    // Long titles wrap at the page width rather than run off it.
    const words = drawable(f, text).split(" ");
    let row = "";
    for (const w of words) {
      const next = row ? `${row} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) > 348 && row) {
        page.drawText(row, { x: 36, y, size, font: f, color });
        y -= size + 3;
        row = w;
      } else row = next;
    }
    if (row) page.drawText(row, { x: 36, y, size, font: f, color });
    y -= size + gap;
  };

  line("NOT A TICKET - LUMMY BETA", 13, bold, red, 2);
  line("BUKAN TIKET - BETA LUMMY", 13, bold, red, 18);
  line(o.eventTitle, 15, bold, rgb(0, 0, 0), 4);
  line([day(o.eventDate), [o.venue, o.city].filter(Boolean).join(", ")].filter(Boolean).join(". "), 10, font, gray, 14);
  line(`Category / Kategori: ${o.tierName}`, 11);
  line(`Tickets / Jumlah tiket: ${o.quantity}`, 11);
  line(`Order / Pesanan: ${o.id.toUpperCase()}`, 11, font, rgb(0, 0, 0), 22);
  for (const text of [
    "The payment for this order was simulated: Lummy is in beta and no real money moves yet. So the seller's ticket is not handed over, and this file stands in for it. It has no barcode and is not valid for entry.",
    "On an order paid with real money, the seller's own ticket file opens here instead.",
  ]) line(text, 10, font, gray, 8);
  y -= 8;
  for (const text of [
    "Pembayaran pesanan ini disimulasikan: Lummy masih beta dan belum ada uang sungguhan yang berpindah. Karena itu tiket penjual tidak diserahkan, dan file ini menggantikannya. File ini tidak punya barcode dan tidak berlaku untuk masuk.",
    "Di pesanan yang dibayar dengan uang sungguhan, file tiket dari penjual terbuka di sini.",
  ]) line(text, 10, font, gray, 8);
  page.drawText("lummy.id", { x: 36, y: 40, size: 9, font, color: gray });
  return doc.save();
}
