import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Category } from "./types";

// New events are requested by whoever lists a ticket first. Reality check from real
// tickets: a seller's PDF only shows THEIR tier and THEIR price, sometimes no price at
// all. So the full tier table is completed by an admin from the ORGANISER'S OFFICIAL
// SOURCE (site, socials, poster), not extracted wholesale from one PDF.
export interface EventRequest {
  id: string;
  submittedBy: string;
  title: string;
  dateISO: string;
  venue: string;
  city: string;
  category: Category;
  faceValues: { tier: string; value: number }[];
  pdfTier: string; // the only tier readable from the seller's own PDF
  organizerRef: string; // official source used to verify prices
  forgeryScore: number;
  pdfSuspicious: boolean;
  status: "pending" | "approved" | "rejected";
}

// Samples, so the queue has one clean request and one flagged: no real artist or promoter is named,
// and the "official source" is a placeholder address (example.com is reserved for examples).
export const SEED_EVENT_REQUESTS: EventRequest[] = [
  {
    id: "req-1", status: "pending", submittedBy: "Zahra A.", title: "Lummy Stadium Night (sample)",
    dateISO: "2027-02-08T20:00:00+07:00", venue: "Stadion Utama GBK", city: "Jakarta",
    category: "Music", forgeryScore: 7, pdfSuspicious: false,
    pdfTier: "CAT 1", organizerRef: "example.com/lummy-stadium-night",
    faceValues: [
      { tier: "Front CAT", value: 4_500_000 },
      { tier: "CAT 1", value: 2_500_000 },
      { tier: "Festival", value: 1_800_000 },
    ],
  },
  {
    id: "req-2", status: "pending", submittedBy: "Bagas W.", title: "Lummy Beach Fest (sample)",
    dateISO: "2026-12-20T19:30:00+07:00", venue: "Beach City International Stadium", city: "Jakarta",
    category: "Music", forgeryScore: 63, pdfSuspicious: true,
    pdfTier: "VIP", organizerRef: "example.com/lummy-beach-fest",
    faceValues: [
      { tier: "VIP", value: 850_000 },
      { tier: "Regular", value: 450_000 },
    ],
  },
];

interface ReqState {
  requests: EventRequest[];
  approve: (id: string) => void;
  reject: (id: string) => void;
}

export const useEventRequests = create<ReqState>()(
  persist(
    (set) => ({
      requests: SEED_EVENT_REQUESTS,
      approve: (id) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, status: "approved" } : r)) })),
      reject: (id) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, status: "rejected" } : r)) })),
    }),
    {
      name: "lummy:eventreq",
      // v2 added pdfTier + organizerRef; v3 (24 Oct 2026) replaced real artists with samples. Older
      // stored state is reset either way.
      version: 3,
      migrate: () => ({ requests: SEED_EVENT_REQUESTS }),
    }
  )
);
