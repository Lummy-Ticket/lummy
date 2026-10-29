import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Category, Currency } from "./types";

// A show that is not in the catalogue yet is requested by the first seller who has a ticket for it
// (the Sell page). A seller's PDF shows only their own category and price, sometimes no price at
// all, so the full price list is filled in by staff from the organiser's official source before the
// show goes live, never taken wholesale from one PDF. Accounts' requests live in the database
// (event_requests, api/events/requests); the sample admin sees the ones below.
export interface EventRequest {
  id: string;
  /** The seller's public name: first name and initial. */
  submittedBy: string;
  title: string;
  dateISO: string;
  venue: string;
  city: string;
  country?: string;
  currency?: Currency;
  category: Category;
  /** What the seller filled in: at least their own category when the ticket prints a price. */
  faceValues: { tier: string; value: number }[];
  /** The category on the seller's own ticket, empty when it was not read. */
  pdfTier: string;
  /** The organiser's official page the seller pointed to, a full URL. */
  organizerRef: string;
  /** What the seller added, in their own words, such as what the official page does not say yet. */
  note?: string;
  /** Whether a ticket PDF was checked with the request. Requests carry none yet: the ticket is
   *  checked when the seller lists it, once the show is approved. */
  ticketChecked?: boolean;
  forgeryScore: number;
  pdfSuspicious: boolean;
  status: "pending" | "approved" | "rejected";
  /** The staff's reason, shown to the seller. */
  reviewNote?: string;
  createdAtISO?: string;
  /** The show approval created. */
  eventId?: string;
}

/** A source as a link: stored requests from before 29 Oct 2026 kept it without the scheme. */
export const sourceUrl = (ref: string) => (/^https?:\/\//.test(ref) ? ref : `https://${ref}`);

// Two shows that are announced but not in the catalogue, with the pages they were announced on
// (tasks/real-events-2026.md): neither page lists a price per category yet, which is exactly what
// staff have to settle before approving. Like an account's request, neither carries a checked ticket.
export const SEED_EVENT_REQUESTS: EventRequest[] = [
  {
    id: "req-dmasiv", status: "pending", submittedBy: "Rani K.", title: "D'Masiv, Jakarta",
    dateISO: "2026-12-05T19:00:00+07:00", venue: "Tennis Indoor Senayan", city: "Jakarta",
    category: "Music", forgeryScore: 0, pdfSuspicious: false, pdfTier: "", faceValues: [],
    organizerRef: "https://www.detik.com/pop/music/d-8263273/kalender-konser-2026-dari-musisi-lokal-internasional-di-indonesia",
    note: "Di halamannya baru ada Rp325.000 sampai Rp800.000, belum per kategori.",
    createdAtISO: "2026-10-28T10:15:00+07:00",
  },
  {
    id: "req-babymonster-sg", status: "pending", submittedBy: "Wei Jie T.", title: "BABYMONSTER, Singapore",
    dateISO: "2026-11-28T19:00:00+08:00", venue: "Singapore Indoor Stadium", city: "Singapore", country: "SG", currency: "USDC",
    category: "Music", forgeryScore: 0, pdfSuspicious: false, pdfTier: "", faceValues: [],
    organizerRef: "https://www.livenation.sg/singapore-indoor-stadium-tickets-vdp40651",
    note: "Live Nation lists S$168 to S$358 before the booking fee, not per category yet.",
    createdAtISO: "2026-10-27T21:40:00+07:00",
  },
];

interface ReqState {
  requests: EventRequest[];
  /** A demo seller's request, kept in this browser like the rest of a demo account's data. */
  add: (r: Omit<EventRequest, "id" | "status" | "createdAtISO">) => void;
  approve: (id: string) => void;
  reject: (id: string, reviewNote?: string) => void;
}

export const useEventRequests = create<ReqState>()(
  persist(
    (set) => ({
      requests: SEED_EVENT_REQUESTS,
      add: (r) => set((s) => ({ requests: [{ ...r, id: "req-" + Date.now(), status: "pending", createdAtISO: new Date().toISOString() }, ...s.requests] })),
      approve: (id) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, status: "approved" } : r)) })),
      reject: (id, reviewNote) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, status: "rejected", reviewNote } : r)) })),
    }),
    {
      name: "lummy:eventreq",
      // v2 added pdfTier + organizerRef; v3 (24 Oct 2026) replaced real artists with samples; v4
      // (29 Oct 2026) made them requests for real announced shows, with their real sources. Older
      // stored state is reset either way.
      version: 4,
      migrate: () => ({ requests: SEED_EVENT_REQUESTS }),
    }
  )
);
