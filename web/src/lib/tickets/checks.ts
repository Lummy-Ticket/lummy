// What the ticket check tells the seller and staff, shared by the sell page, the review queue and
// the routes. Safe for the browser: no barcode payload or key ever appears here, only formats,
// pages, the last four characters for the seller who uploaded the file, and the reasons.
import type { ForensicReason } from "./forensics";

export type { ForensicReason };

/** The check route's answer to the seller who uploaded the file. */
export type TicketCheck = {
  pages: number;
  /** Pages read in full. Fewer than `pages` means some were not checked. */
  scannedPages: number;
  barcodes: { format: string; tail: string; page: number; taken: boolean }[];
  /** The very same file is already behind a live listing. */
  sameFile: boolean;
  score: number;
  suspicious: boolean;
  reasons: ForensicReason[];
  producer: string | null;
};

/**
 * What the AI step read off a ticket (docs/09 §5.1, lib/tickets/ai.ts). It holds the show's facts
 * only: the text it came from had every name and number taken out first.
 */
export type TicketFacts = {
  eventTitle: string | null;
  /** The show date printed on the ticket, YYYY-MM-DD; the first day of a pass for several days. */
  date: string | null;
  venue: string | null;
  /** One of the offered categories, or null when none fits what is printed. */
  tierId: string | null;
  /** The category as printed, so a person can see what was matched. */
  tierPrinted: string | null;
  seat: string | null;
  /** The price of one ticket in rupiah, as printed, without fees. */
  printedPrice: number | null;
  quantity: number | null;
};

/** Where the ticket and the seller disagree: another category, or another day. */
export type FactDiff = "tier" | "date";

/** Stored with the listing (listings.checks) for its seller and staff: counts, not barcodes. */
export type ListingChecks = {
  barcodes: number;
  formats: string[];
  pages: number;
  scannedPages: number;
  score: number;
  suspicious: boolean;
  reasons: ForensicReason[];
  producer: string | null;
  /** The AI step at publish, when the server has one: what it read, and where that differs. */
  ai?: { model: string; facts: TicketFacts; differs: FactDiff[] } | null;
};

/** A show's date in Jakarta as YYYY-MM-DD, the way a ticket prints it. */
export const showDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

/**
 * Where what the ticket prints disagrees with what the seller picked. Something the ticket does not
 * print disagrees with nothing; a printed category that fits none of the show's is a difference,
 * since that is how a cheaper ticket would be listed under a dearer category.
 */
export function factDiffs(f: TicketFacts, chosen: { tierId: string; startsAt: string }): FactDiff[] {
  const out: FactDiff[] = [];
  if ((f.tierId || f.tierPrinted) && f.tierId !== chosen.tierId) out.push("tier");
  if (f.date && f.date !== showDay(chosen.startsAt)) out.push("date");
  return out;
}

export const toListingChecks = (c: TicketCheck): ListingChecks => ({
  barcodes: c.barcodes.length,
  formats: [...new Set(c.barcodes.map((b) => b.format))],
  pages: c.pages,
  scannedPages: c.scannedPages,
  score: c.score,
  suspicious: c.suspicious,
  reasons: c.reasons,
  producer: c.producer,
});

/** A barcode, or the file itself, already sits behind another live listing: refused outright. */
export const isDuplicate = (c: TicketCheck) => c.sameFile || c.barcodes.some((b) => b.taken);

/**
 * Why a person looks before the listing goes live: a forensic flag or a high score, no barcode
 * to hold (so nothing stops the same ticket being listed twice), pages left unread, or a ticket
 * that prints another category or day than the seller picked.
 */
export function reviewReasons(c: ListingChecks) {
  const out: ("flagged" | "no_barcode" | "unread_pages" | "details_differ")[] = [];
  if (c.suspicious || c.score >= 60) out.push("flagged");
  if (c.barcodes === 0) out.push("no_barcode");
  if (c.scannedPages < c.pages) out.push("unread_pages");
  if (c.ai?.differs.length) out.push("details_differ");
  return out;
}

type T = (en: string, id: string) => string;

export function reasonText(r: ForensicReason, t: T) {
  switch (r.code) {
    case "revised":
      return t(`Changed after it was issued: saved ${r.extra} more time${r.extra === 1 ? "" : "s"}`, `Diubah setelah diterbitkan: disimpan ulang ${r.extra} kali`);
    case "signed_then_changed":
      return t("Changed after it was signed", "Diubah setelah ditandatangani");
    case "editor":
      return t(`Made or re-saved with a PDF editor (${r.tool})`, `Dibuat atau disimpan ulang dengan editor PDF (${r.tool})`);
    case "design":
      return t(`Made with a design or office app (${r.tool})`, `Dibuat dengan aplikasi desain atau office (${r.tool})`);
    case "print":
      return t(`Printed to PDF (${r.tool}): a copy, not the file the organiser sent`, `Dicetak ke PDF (${r.tool}): salinan, bukan file dari penyelenggara`);
    case "modified_later":
      return t(`Modified ${r.days} day${r.days === 1 ? "" : "s"} after it was created`, `Diubah ${r.days} hari setelah dibuat`);
    case "active_content":
      return t(`Contains ${r.what.join(", ")}, which no ticket needs`, `Berisi ${r.what.join(", ")}, yang tidak dibutuhkan tiket`);
    case "appended":
      return t("Has extra data after the end of the file", "Ada data tambahan setelah akhir file");
  }
}

/** QRCode -> "QR", Code128 -> "Code 128", the way a person would name it. */
export const formatName = (f: string) => (f === "QRCode" ? "QR" : f.replace(/^Code(\d+)$/, "Code $1").replace(/^EAN(\d+)$/, "EAN-$1"));
