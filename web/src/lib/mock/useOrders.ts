import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Dispute, DisputeEvidence, DisputeReason, EventItem, Listing, Order, Tier } from "./types";
import { CONTRACT_ADDRESS, mockTxHash } from "./util";
import { DISPUTE_WINDOW_H, canFileDispute, disputeDeadlineISO } from "./escrow";

const H = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();

// Seeds cover every settlement phase at once so the demo never needs setup:
// upcoming, window running, auto-released, in review, refunded. Dates for the
// settled ones are relative to now, which keeps the 48h countdown live whenever
// the prototype is opened. Tour stops differ from the catalog on purpose: those
// shows already happened, so they are no longer listed for sale.
const seedOrders = (): Order[] => [
  {
    id: "or-seed-1", listingId: "ls-2", eventId: "ev-coldplay",
    eventTitle: "Coldplay: Music of the Spheres",
    eventImage: "/assets/events/coldplay-hd.jpg",
    eventDateISO: "2026-11-14T19:00:00+07:00", tierName: "CAT 3", sellerName: "Rian P.",
    quantity: 1, amount: 1_400_000, gateKtp: true, escrowStatus: "LOCKED",
    contractAddress: CONTRACT_ADDRESS, fundTxHash: mockTxHash(),
    createdAtISO: ago(20 * 24),
  },
  {
    // Show ended 6 hours ago: dispute window running, roughly 42h on the clock.
    id: "or-seed-2", listingId: "ls-x1", eventId: "ev-tulus",
    eventTitle: "Tulus: Manusia Tour, Surabaya",
    eventImage: "/assets/events/tulus-hd.jpg",
    eventDateISO: ago(10), tierName: "Festival", sellerName: "Bagas W.",
    quantity: 1, amount: 950_000, gateKtp: false, escrowStatus: "LOCKED",
    contractAddress: CONTRACT_ADDRESS, fundTxHash: mockTxHash(),
    createdAtISO: ago(16 * 24), eventEndedAtISO: ago(6),
  },
  {
    // Nobody filed anything, so the contract paid the seller by itself.
    id: "or-seed-3", listingId: "ls-x2", eventId: "ev-dwp",
    eventTitle: "Djakarta Warehouse Project 2026",
    eventImage: "/assets/events/dwp-hd.jpg",
    eventDateISO: "2026-08-09T20:00:00+07:00", tierName: "GA", sellerName: "Rizky T.",
    quantity: 1, amount: 1_250_000, gateKtp: false, escrowStatus: "RELEASED",
    contractAddress: CONTRACT_ADDRESS, fundTxHash: mockTxHash(), settleTxHash: mockTxHash(),
    createdAtISO: "2026-07-18T13:00:00+07:00",
    eventEndedAtISO: "2026-08-10T00:00:00+07:00", autoReleased: true,
  },
  {
    // Filed 20h ago with gate-time evidence, still with the arbiter.
    id: "or-seed-4", listingId: "ls-x3", eventId: "ev-pandji",
    eventTitle: "Pandji Pragiwaksono: Menyala, Bandung",
    eventImage: "/assets/events/pandji-hd.jpg",
    eventDateISO: ago(30), tierName: "Silver", sellerName: "Dinda K.",
    quantity: 1, amount: 430_000, gateKtp: false, escrowStatus: "DISPUTED",
    contractAddress: CONTRACT_ADDRESS, fundTxHash: mockTxHash(),
    createdAtISO: ago(24 * 24), eventEndedAtISO: ago(26),
    dispute: {
      reason: "BARCODE_USED",
      note: "Scanner showed the code had already been used. Staff turned me away at gate 3.",
      evidence: {
        fileName: "gate-scanner-rejected.jpg",
        kind: "SCANNER_PHOTO",
        capturedAtISO: ago(29),
        atVenue: true,
      },
      openedAtISO: ago(20),
    },
  },
  {
    // Arbiter sided with the buyer, so the escrow refunded instead of paying out.
    id: "or-seed-5", listingId: "ls-x4", eventId: "ev-sos",
    eventTitle: "Sheila on 7: Tunggu Aku, Yogyakarta",
    eventImage: "/assets/events/sheila-hd.jpg",
    eventDateISO: ago(21 * 24), tierName: "Tribune", sellerName: "Farhan A.",
    quantity: 2, amount: 700_000, gateKtp: false, escrowStatus: "REFUNDED",
    contractAddress: CONTRACT_ADDRESS, fundTxHash: mockTxHash(), settleTxHash: mockTxHash(),
    createdAtISO: ago(40 * 24), eventEndedAtISO: ago(21 * 24 - 4),
    dispute: {
      reason: "GATE_DENIED",
      note: "Barcode was rejected twice, the crew wrote a rejection note.",
      evidence: {
        fileName: "staff-rejection-note.jpg",
        kind: "STAFF_LETTER",
        capturedAtISO: ago(21 * 24 - 3),
        atVenue: true,
      },
      openedAtISO: ago(21 * 24 - 6),
      verdict: {
        toSeller: false,
        rationale: "Gate-time evidence is consistent with a denied entry: timestamp and location both check out.",
        decidedAtISO: ago(20 * 24),
      },
    },
  },
];

const SEED_ORDERS = seedOrders();

interface OrderState {
  orders: Order[];
  buy: (listing: Listing, event: EventItem, tier: Tier, quantity: number) => string;
  /** Confirms the show is over. In production this comes from the event schedule. */
  markEventFinished: (id: string) => void;
  /** Demo shortcut: jump to the end of the 48h window. */
  fastForwardWindow: (id: string) => void;
  /** Pays out every locked order whose window has elapsed in silence. */
  sweepAutoRelease: () => void;
  openDispute: (id: string, input: { reason: DisputeReason; note: string; evidence: DisputeEvidence }) => void;
  resolveDispute: (id: string, toSeller: boolean, rationale: string) => void;
  getById: (id: string) => Order | undefined;
}

const patch = (orders: Order[], id: string, fn: (o: Order) => Order) =>
  orders.map((o) => (o.id === id ? fn(o) : o));

export const useOrders = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: SEED_ORDERS,

      buy: (listing, event, tier, quantity) => {
        const id = "or-" + Date.now();
        const order: Order = {
          id, listingId: listing.id, eventId: event.id, eventTitle: event.title,
          eventImage: event.image, eventDateISO: event.dateISO, tierName: tier.name,
          sellerName: listing.sellerName, quantity, amount: listing.askPrice * quantity,
          gateKtp: listing.gateKtp, escrowStatus: "LOCKED", contractAddress: CONTRACT_ADDRESS,
          fundTxHash: mockTxHash(), createdAtISO: new Date().toISOString(),
        };
        set((s) => ({ orders: [order, ...s.orders] }));
        return id;
      },

      markEventFinished: (id) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) =>
            o.escrowStatus === "LOCKED" && !o.eventEndedAtISO
              ? { ...o, eventEndedAtISO: new Date().toISOString() }
              : o
          ),
        })),

      fastForwardWindow: (id) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) => {
            if (o.escrowStatus !== "LOCKED") return o;
            // Backdate the end of the show so the deadline lands one minute ago.
            const ended = new Date(Date.now() - DISPUTE_WINDOW_H * H - 60_000).toISOString();
            return { ...o, eventEndedAtISO: ended };
          }),
        })),

      sweepAutoRelease: () => {
        const now = Date.now();
        const due = get().orders.some((o) => {
          if (o.escrowStatus !== "LOCKED") return false;
          const deadline = disputeDeadlineISO(o);
          return !!deadline && now >= new Date(deadline).getTime();
        });
        if (!due) return; // avoid pointless state writes on every tick
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.escrowStatus !== "LOCKED") return o;
            const deadline = disputeDeadlineISO(o);
            if (!deadline || now < new Date(deadline).getTime()) return o;
            return { ...o, escrowStatus: "RELEASED", autoReleased: true, settleTxHash: mockTxHash() };
          }),
        }));
      },

      // Filing is only possible inside the window, and only with evidence attached.
      openDispute: (id, input) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) => {
            if (!canFileDispute(o)) return o;
            const dispute: Dispute = { ...input, openedAtISO: new Date().toISOString() };
            return { ...o, escrowStatus: "DISPUTED", dispute };
          }),
        })),

      // The arbiter decides. Silence and weak evidence both land on the seller.
      resolveDispute: (id, toSeller, rationale) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) =>
            o.escrowStatus === "DISPUTED"
              ? {
                  ...o,
                  escrowStatus: toSeller ? "RELEASED" : "REFUNDED",
                  settleTxHash: mockTxHash(),
                  dispute: o.dispute
                    ? { ...o.dispute, verdict: { toSeller, rationale, decidedAtISO: new Date().toISOString() } }
                    : o.dispute,
                }
              : o
          ),
        })),

      getById: (id) => get().orders.find((o) => o.id === id),
    }),
    {
      name: "lummy:orders",
      version: 1,
      migrate: () => ({ orders: seedOrders() }),
    }
  )
);
