import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EscrowStatus, EventItem, Listing, Tier } from "./types";
import { CONTRACT_ADDRESS, mockTxHash, releaseDeadline } from "./util";

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
  disputeDeadlineISO: string;
}

const SEED_ORDERS: Order[] = [
  {
    id: "or-seed-1", listingId: "ls-2", eventId: "ev-coldplay",
    eventTitle: "Coldplay: Music of the Spheres",
    eventImage: "https://picsum.photos/seed/coldplay/600/440",
    eventDateISO: "2026-11-14T19:00:00+07:00", tierName: "CAT 3", sellerName: "Rian P.", quantity: 1,
    amount: 1_400_000, gateKtp: true, escrowStatus: "LOCKED",
    contractAddress: CONTRACT_ADDRESS, fundTxHash: mockTxHash(),
    createdAtISO: "2026-08-01T10:12:00+07:00",
    disputeDeadlineISO: releaseDeadline("2026-11-14T19:00:00+07:00"),
  },
  {
    id: "or-seed-2", listingId: "ls-x1", eventId: "ev-wtf",
    eventTitle: "We The Fest 2026",
    eventImage: "https://picsum.photos/seed/wtf/600/440",
    eventDateISO: "2026-08-21T14:00:00+07:00", tierName: "1-Day Pass", sellerName: "Bagas W.", quantity: 1,
    amount: 950_000, gateKtp: false, escrowStatus: "RELEASED",
    contractAddress: CONTRACT_ADDRESS, fundTxHash: mockTxHash(), settleTxHash: mockTxHash(),
    createdAtISO: "2026-07-20T15:30:00+07:00",
    disputeDeadlineISO: releaseDeadline("2026-08-21T14:00:00+07:00"),
  },
  {
    id: "or-seed-3", listingId: "ls-x2", eventId: "ev-pandji",
    eventTitle: "Pandji Pragiwaksono: Menyala",
    eventImage: "https://picsum.photos/seed/pandji/600/440",
    eventDateISO: "2026-09-06T19:00:00+07:00", tierName: "Silver", sellerName: "Dinda K.", quantity: 1,
    amount: 430_000, gateKtp: false, escrowStatus: "REFUNDED",
    contractAddress: CONTRACT_ADDRESS, fundTxHash: mockTxHash(), settleTxHash: mockTxHash(),
    createdAtISO: "2026-07-25T09:00:00+07:00",
    disputeDeadlineISO: releaseDeadline("2026-09-06T19:00:00+07:00"),
  },
];

interface OrderState {
  orders: Order[];
  buy: (listing: Listing, event: EventItem, tier: Tier, quantity: number) => string;
  release: (id: string) => void;
  refund: (id: string) => void;
  getById: (id: string) => Order | undefined;
}

export const useOrders = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: SEED_ORDERS,
      buy: (listing, event, tier, quantity) => {
        const id = "or-" + Date.now();
        const order: Order = {
          id, listingId: listing.id, eventId: event.id, eventTitle: event.title,
          eventImage: event.image, eventDateISO: event.dateISO, tierName: tier.name,
          sellerName: listing.sellerName, quantity, amount: listing.askPrice * quantity, gateKtp: listing.gateKtp,
          escrowStatus: "LOCKED", contractAddress: CONTRACT_ADDRESS, fundTxHash: mockTxHash(),
          createdAtISO: new Date().toISOString(), disputeDeadlineISO: releaseDeadline(event.dateISO),
        };
        set((s) => ({ orders: [order, ...s.orders] }));
        return id;
      },
      release: (id) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, escrowStatus: "RELEASED", settleTxHash: mockTxHash() } : o
          ),
        })),
      refund: (id) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, escrowStatus: "REFUNDED", settleTxHash: mockTxHash() } : o
          ),
        })),
      getById: (id) => get().orders.find((o) => o.id === id),
    }),
    { name: "opertix:orders" }
  )
);
