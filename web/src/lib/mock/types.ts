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
  /** Signed in with a real Supabase account (a sign-in email or a demo account). Absent on sample personas. */
  account?: boolean;
  /** Staff per the database (profiles.role = admin), the only accounts that may open the admin console. */
  staff?: boolean;
}

export interface Tier {
  id: string;
  name: string; // "CAT 1", "Festival", "VIP"
  faceValue: number; // IDR
}

/**
 * How a named ticket can change hands at this show's gate, from the organiser's terms
 * (see lib/mock/transfer.ts). Null when nobody has confirmed it yet.
 */
export type TransferPolicy = "open" | "letter" | "id_match" | "no_resale";

export interface EventItem {
  id: string;
  title: string;
  category: Category;
  dateISO: string;
  venue: string;
  city: string;
  image: string;
  tiers: Tier[];
  fromPrice: number; // lowest buyable ask (IDR), 0 when nothing is buyable. Derived in seed.ts
  listingCount: number; // buyable listings. Derived in seed.ts
  featured?: boolean;
  soldOut?: boolean;
  transferPolicy?: TransferPolicy | null;
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

// Every way a ticket can fail has exactly one path here, so nothing falls
// between the cracks. Two of these are pre-event failures, two are gate
// failures, one is decided by the organiser, and one is refused outright.
//
// NO_SHOW is listed on purpose: it is the one reason the policy rejects. A
// valid ticket you chose not to use is not a refund case; the remedy is
// relisting it before the event ("resell, not refund").
export type DisputeReason =
  | "GATE_DENIED"
  | "BARCODE_USED"
  | "NAME_MISMATCH"
  | "NOT_DELIVERED"
  | "NOT_AS_LISTED"
  | "EVENT_CANCELLED"
  | "NO_SHOW";

/** Organiser-driven state. A cancelled show refunds without anyone filing. */
export type EventStatus = "scheduled" | "postponed" | "cancelled";

/**
 * Remedies in the order a marketplace should reach for them: put the buyer in
 * the seat first, correct the price second, refund third. Releasing to the
 * seller is the outcome when a claim does not hold up.
 */
export type Remedy = "REPLACEMENT" | "REFUND_PARTIAL" | "REFUND_FULL" | "RELEASE_SELLER";

export type EvidenceKind = "SCANNER_PHOTO" | "STAFF_LETTER" | "CHAT_LOG" | "TICKET_PHOTO" | "SYSTEM_RECORD";

// Evidence carries its own capture metadata (mock EXIF). The whole anti-lying
// model rests on it: a buyer who actually walked in has no gate-time rejection
// to photograph, so a late screenshot reads as weak on its face.
export interface DisputeEvidence {
  fileName: string;
  kind: EvidenceKind;
  capturedAtISO: string;
  atVenue: boolean; // geotag matched the venue
  /** Whether this order's barcode is legible in the file. Without it, a photo of
   *  a stranger being turned away would pass the time and place checks. */
  showsBarcode?: boolean;
}

export interface DisputeVerdict {
  toSeller: boolean;
  remedy: Remedy;
  /** What actually moved back to the buyer, in rupiah. */
  refundAmount: number;
  /** Charged to the seller on an upheld claim, on top of losing the sale. */
  sellerPenalty: number;
  /** Kept in both languages so a stored verdict still follows the language switch. */
  rationale: { en: string; id: string };
  decidedAtISO: string;
}

/**
 * A reply on a claim. Deciding on the filer's word alone is how a marketplace
 * ends up refunding people who actually walked in, so the other side gets to
 * answer before an arbiter looks at it.
 */
export interface DisputeReply {
  fromSeller: boolean;
  note: { en: string; id: string };
  evidence?: DisputeEvidence;
  atISO: string;
}

export interface Dispute {
  reason: DisputeReason;
  /** Free text. Seeded demo notes carry both languages; anything a buyer types
   *  is stored as they wrote it, in whichever language they used. */
  note: { en: string; id: string };
  /** Absent for claims the platform settles from its own records. */
  evidence?: DisputeEvidence;
  openedAtISO: string;
  /** Replies from either side, oldest first. */
  replies?: DisputeReply[];
  verdict?: DisputeVerdict;
}

/**
 * A real escrow on Arbitrum. Orders without it are sample data: they never show a
 * contract address or transaction hash, because there is none to show.
 */
export interface OrderChain {
  listingId: string;
  escrow: string;
  /** USDC units (6 decimals) locked on chain, a small testnet stand-in for the rupiah amount. */
  price: string;
  /** Unix seconds. The contract starts the window from this or the handover, whichever is later. */
  eventEndsAt: number;
  /** Last values read from the contract. */
  deadline?: number;
  window?: number;
  status?: string;
  txs: { create: string; fund: string; handover: string; settle?: string; withdrawals?: string[] };
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
  chain?: OrderChain;
  createdAtISO: string;
  /** Set once the event is confirmed over. This is what starts the 48h clock. */
  eventEndedAtISO?: string;
  /**
   * When the show is scheduled to end. Orders kept in the database know it from the start, so
   * their window opens on time without anyone marking the show over.
   */
  eventEndsAtISO?: string;
  /** The two accounts on an order kept in the database. Absent on sample orders. */
  buyerId?: string;
  sellerId?: string;
  /** True when the window elapsed in silence and the contract paid out by itself. */
  autoReleased?: boolean;
  /** Set when the escrow refunded without anyone filing, e.g. a cancelled show. */
  autoRefundReason?: "EVENT_CANCELLED";
  /** Organiser state for this order's event, snapshotted at purchase. */
  eventStatus?: EventStatus;
  /**
   * When the buyer actually opened the handover documents. This is the platform's
   * own record, and it is what settles a "never handed over" claim either way.
   */
  docsAccessed?: { letterAtISO?: string; sellerIdAtISO?: string };
  /** Listed within the high-risk window before doors, so it went through review. */
  lateListing?: boolean;
  dispute?: Dispute;
}
