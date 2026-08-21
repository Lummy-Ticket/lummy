// Mock-layer types for the Lummy FE mock. These mirror the eventual Supabase
// schema (docs/09) loosely, so swapping mock -> real stays mechanical.

export type Role = "BUYER" | "SELLER" | "ADMIN";

// Kept in sync with Card.Event's CategoryT so the reused card renders badges.
export type Category =
  | "Music"
  | "Sports"
  | "Theater"
  | "Arts"
  | "Technology"
  | "Education"
  | "Food"
  | "Movies";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Tier {
  id: string;
  name: string; // "CAT 1", "Festival", "VIP"
  faceValue: number; // IDR
}

export interface EventItem {
  id: string;
  title: string;
  category: Category;
  dateISO: string;
  venue: string;
  city: string;
  image: string;
  tiers: Tier[];
  fromPrice: number; // lowest active resale ask (IDR), for the card
  listingCount: number;
  featured?: boolean;
  soldOut?: boolean;
}

export type ListingStatus = "active" | "sold";

export interface ListingAI {
  autofilled: boolean;
  forgeryScore: number; // 0-100, a review signal rather than a hard gate
  barcodeDuplicate: boolean;
  pdfSuspicious: boolean; // result of the PDF structure forensics
}

export interface Listing {
  id: string;
  eventId: string;
  tierId: string;
  sellerName: string;
  askPrice: number; // IDR PER TICKET (Viagogo style: per ticket, not per set)
  faceValue: number; // IDR per ticket
  quantity: number; // tickets in one set / PDF (seated together)
  splittable: boolean; // true = part of the set can be bought; false = all or nothing
  status: ListingStatus;
  gateKtp: boolean; // venue checks ID at the gate, so the seller ID photo is needed
  ai: ListingAI;
}

// --- Escrow -----------------------------------------------------------------
// Settlement is TIME-triggered, never buyer-confirmed: there is deliberately no
// "I got in" button. Silence wins for the seller once the window closes.
// See docs/01-vision-product.md "Kebijakan sengketa & refund".

// LOCKED = funds held (Funded/DisputeWindow). DISPUTED = buyer filed, arbiter
// deciding. RELEASED = paid out to seller. REFUNDED = returned to buyer.
export type EscrowStatus = "LOCKED" | "DISPUTED" | "RELEASED" | "REFUNDED";

// Derived from stored status + the clock. Never persisted.
export type EscrowPhase =
  | "PRE_EVENT"      // funds locked, event has not happened yet
  | "WINDOW_OPEN"    // event finished, 48h dispute window running
  | "WINDOW_CLOSED"  // window elapsed with no dispute, auto-release due
  | "IN_REVIEW"      // dispute filed, waiting on the arbiter
  | "RELEASED"
  | "REFUNDED";

// NO_SHOW is listed on purpose: it is the one reason the policy rejects
// outright. A valid ticket you chose not to use is not a refund case, the
// remedy is relisting it before the event ("resell, not refund").
export type DisputeReason =
  | "GATE_DENIED"
  | "BARCODE_USED"
  | "NOT_DELIVERED"
  | "NOT_AS_LISTED"
  | "NO_SHOW";

export type EvidenceKind = "SCANNER_PHOTO" | "STAFF_LETTER" | "CHAT_LOG";

// Evidence carries its own capture metadata (mock EXIF). The whole anti-lying
// model rests on it: a buyer who actually walked in has no gate-time rejection
// to photograph, so a late screenshot reads as weak on its face.
export interface DisputeEvidence {
  fileName: string;
  kind: EvidenceKind;
  capturedAtISO: string;
  atVenue: boolean; // geotag matched the venue
}

export interface DisputeVerdict {
  toSeller: boolean;
  /** Kept in both languages so a stored verdict still follows the language switch. */
  rationale: { en: string; id: string };
  decidedAtISO: string;
}

export interface Dispute {
  reason: DisputeReason;
  /** Free text. Seeded demo notes carry both languages; anything a buyer types
   *  is stored as they wrote it, in whichever language they used. */
  note: { en: string; id: string };
  evidence: DisputeEvidence;
  openedAtISO: string;
  verdict?: DisputeVerdict;
}

export interface Escrow {
  id: string;
  listingId: string;
  amount: number;
  status: EscrowStatus;
  txHash: string;
  contractAddress: string;
  disputeDeadlineISO: string;
}

export interface Order {
  id: string;
  listingId: string;
  eventId: string;
  eventTitle: string;
  eventImage: string;
  eventDateISO: string;
  tierName: string;
  sellerName: string;
  quantity: number;
  amount: number;
  gateKtp: boolean;
  escrowStatus: EscrowStatus;
  contractAddress: string;
  fundTxHash: string;
  settleTxHash?: string;
  createdAtISO: string;
  /** Set once the event is confirmed over. This is what starts the 48h clock. */
  eventEndedAtISO?: string;
  /** True when the window elapsed in silence and the contract paid out by itself. */
  autoReleased?: boolean;
  dispute?: Dispute;
}
