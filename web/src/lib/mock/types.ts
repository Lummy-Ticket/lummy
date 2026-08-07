// Mock-layer types for OperTix FE mock. Mirror the eventual Supabase schema
// (docs/09) loosely so swapping mock -> real is mechanical.

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
  forgeryScore: number; // 0-100, sinyal review (bukan gate)
  barcodeDuplicate: boolean;
  pdfSuspicious: boolean; // hasil forensik struktur PDF
}

export interface Listing {
  id: string;
  eventId: string;
  tierId: string;
  sellerName: string;
  askPrice: number; // IDR
  faceValue: number; // IDR
  status: ListingStatus;
  gateKtp: boolean; // event tipe gate-KTP (butuh foto KTP)
  ai: ListingAI;
}

export type EscrowStatus = "LOCKED" | "RELEASED" | "REFUNDED";

export interface Escrow {
  id: string;
  listingId: string;
  amount: number;
  status: EscrowStatus;
  txHash: string;
  contractAddress: string;
  disputeDeadlineISO: string;
}
