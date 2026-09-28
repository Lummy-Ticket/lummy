// Listing rules shared by the sell page and the listing routes, so what the page shows is what
// the server will decide. Until the AI pipeline reads real PDFs, a listing is made from one of
// the sample tickets, and its trust signals come from this table, never from the browser.
import { CAP_PCT, FLOOR_PCT } from "@/lib/mock/seed";
import type { ListingAI } from "@/lib/mock/types";

export type SampleTicket = "good" | "edited" | "dup";

export const SAMPLE_SIGNALS: Record<SampleTicket, ListingAI> = {
  good: { autofilled: true, forgeryScore: 9, barcodeDuplicate: false, pdfSuspicious: false },
  edited: { autofilled: true, forgeryScore: 78, barcodeDuplicate: false, pdfSuspicious: true },
  dup: { autofilled: true, forgeryScore: 11, barcodeDuplicate: true, pdfSuspicious: false },
};

export const isSampleTicket = (v: unknown): v is SampleTicket => v === "good" || v === "edited" || v === "dup";

/** A barcode already sold on Lummy is refused outright. */
export const isBlocked = (ai: ListingAI) => ai.barcodeDuplicate;

/** Tampering or a high score does not go live on its own: a person looks first. */
export const isFlagged = (ai: ListingAI) => !ai.barcodeDuplicate && (ai.pdfSuspicious || ai.forgeryScore >= 60);

/** Asking price per ticket: between FLOOR_PCT and CAP_PCT of face value (FR6, also a DB constraint). */
export const priceBand = (faceValue: number) => ({
  floor: Math.round((faceValue * FLOOR_PCT) / 100),
  cap: Math.round((faceValue * CAP_PCT) / 100),
});

export const inPriceBand = (askPrice: number, faceValue: number) =>
  askPrice * 100 >= faceValue * FLOOR_PCT && askPrice * 100 <= faceValue * CAP_PCT;

/** What buyers see as the seller: a first name and an initial, never the full name. */
export function publicSellerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Lummy seller";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
