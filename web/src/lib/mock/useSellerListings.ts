import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ListingAI } from "./types";

export type SellerListingStatus = "active" | "sold" | "review";

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
}

const SEED: SellerListing[] = [
  {
    id: "sl-1", eventId: "ev-coldplay", eventTitle: "Coldplay: Music of the Spheres",
    tierName: "CAT 1", askPrice: 2_800_000, faceValue: 2_250_000, quantity: 2, status: "active", views: 142,
    ai: { autofilled: true, forgeryScore: 8, barcodeDuplicate: false, pdfSuspicious: false },
    createdAtISO: "2026-07-28T09:00:00+07:00",
  },
  {
    id: "sl-2", eventId: "ev-newjeans", eventTitle: "NewJeans Fan Meeting: Bunnies Jakarta",
    tierName: "CAT 1", askPrice: 1_650_000, faceValue: 1_500_000, quantity: 1, status: "sold", views: 310,
    ai: { autofilled: true, forgeryScore: 6, barcodeDuplicate: false, pdfSuspicious: false },
    createdAtISO: "2026-07-15T14:00:00+07:00",
  },
  {
    id: "sl-3", eventId: "ev-tulus", eventTitle: "Tulus: Manusia Tour",
    tierName: "VIP", askPrice: 1_380_000, faceValue: 1_200_000, quantity: 1, status: "review", views: 12,
    ai: { autofilled: true, forgeryScore: 78, barcodeDuplicate: false, pdfSuspicious: true },
    createdAtISO: "2026-08-05T11:00:00+07:00",
  },
];

interface SellerState {
  listings: SellerListing[];
  add: (l: Omit<SellerListing, "id" | "createdAtISO" | "views">) => void;
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
    }),
    { name: "lummy:seller" }
  )
);
