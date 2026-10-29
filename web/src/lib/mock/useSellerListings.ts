import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ListingChecks } from "@/lib/tickets/checks";
import type { ListingAI } from "./types";
import { getEventById } from "./seed";

export type SellerListingStatus = "active" | "sold" | "review" | "rejected";

export interface SellerListing {
  id: string;
  eventId: string;
  eventTitle: string;
  tierName: string;
  askPrice: number;
  faceValue: number;
  quantity: number;
  status: SellerListingStatus;
  views: number;
  ai: ListingAI;
  createdAtISO: string;
  /** Held because it was listed close to doors, not because the AI flagged it. */
  lateListing?: boolean;
  /** The venue checks ID, so the seller staged a KTP photo for the buyer at listing time. */
  gateKtp?: boolean;
  /** What the check of a real ticket PDF found. Absent for sample tickets. */
  checks?: ListingChecks | null;
}

// The sample seller's own listings, the same ones the catalogue and the demo accounts carry: on sale
// on Guns N' Roses (seed ls-1), sold on Ye, the show that has happened (ls-18, whose buyer's claim
// waits in the admin queue, lib/mock/seed-orders.ts), and one held for a check since this morning,
// as the presenter's reset holds one in the database (api/demo/reset, ls-demo-held).
const SEED: SellerListing[] = [
  {
    id: "sl-1", eventId: "ev-gnr-jakarta", eventTitle: "Guns N' Roses World Tour 2026, Jakarta",
    tierName: "Tribune B", askPrice: 2_800_000, faceValue: 2_250_000, quantity: 2, status: "active", views: 142,
    ai: { autofilled: true, forgeryScore: 8, barcodeDuplicate: false, pdfSuspicious: false },
    createdAtISO: "2026-10-12T09:00:00+07:00",
  },
  {
    id: "sl-2", eventId: "ev-ye-jakarta", eventTitle: "Ye Live in Jakarta",
    tierName: "Festival A", askPrice: 4_200_000, faceValue: 3_500_000, quantity: 1, status: "sold", views: 310,
    ai: { autofilled: true, forgeryScore: 7, barcodeDuplicate: false, pdfSuspicious: false },
    createdAtISO: "2026-10-06T14:00:00+07:00",
  },
  {
    id: "sl-3", eventId: "ev-5sos-jakarta", eventTitle: "5 Seconds of Summer: Everyone's a Star! Jakarta, Second Show",
    tierName: "CAT 3", askPrice: 1_450_000, faceValue: 1_320_000, quantity: 1, status: "review", views: 12,
    ai: { autofilled: true, forgeryScore: 78, barcodeDuplicate: false, pdfSuspicious: true },
    createdAtISO: new Date(Date.now() - 5 * 3_600_000).toISOString(),
  },
];

interface SellerState {
  listings: SellerListing[];
  add: (l: Omit<SellerListing, "id" | "createdAtISO" | "views">) => void;
  /** Staff clearing a held listing. The sell flow promises this queue exists. */
  approve: (id: string) => void;
  reject: (id: string) => void;
}

export const useSellerListings = create<SellerState>()(
  persist(
    (set) => ({
      listings: SEED,
      add: (l) =>
        set((s) => ({
          listings: [
            { ...l, id: "sl-" + Date.now(), createdAtISO: new Date().toISOString(), views: 0 },
            ...s.listings,
          ],
        })),
      approve: (id) =>
        set((s) => ({
          listings: s.listings.map((l) => (l.id === id ? { ...l, status: "active" } : l)),
        })),
      reject: (id) =>
        set((s) => ({
          listings: s.listings.map((l) => (l.id === id ? { ...l, status: "rejected" } : l)),
        })),
    }),
    {
      name: "lummy:seller",
      // v1: real shows replaced the made-up ones on 23 Oct 2026. The sample listings start over; a
      // listing made in this browser stays while its show is still in the catalogue. v2 (29 Oct 2026):
      // the made-up sample show is gone, so its sold listing became one on Ye.
      version: 2,
      migrate: (persisted) => {
        const stored = (persisted as { listings?: SellerListing[] } | null)?.listings ?? [];
        const made = stored.filter((l) => !SEED.some((s) => s.id === l.id) && !!getEventById(l.eventId));
        return { listings: [...made, ...SEED] };
      },
    }
  )
);
