import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Dispute, DisputeEvidence, DisputeReason, DisputeReply, EscrowStatus, EventItem, Listing, Order, OrderChain, Remedy, Tier,
} from "./types";
import { DISPUTE_WINDOW_H, canFileDispute, disputeDeadlineISO, partialAmount, sellerPenalty } from "./escrow";

/** What the contract reports for an on-chain order, as read through /api/chain/listing. */
export interface ChainSnapshot {
  status: string;
  disputed: boolean;
  eventEndsAt: number;
  deadline: number;
  disputeWindow: number;
}

/** A settlement that happened on chain: the transaction and the payouts it triggered. */
export interface ChainSettlement {
  escrowStatus: EscrowStatus;
  tx: string;
  withdrawals: string[];
  autoReleased?: boolean;
  autoRefundReason?: "EVENT_CANCELLED";
}

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
    createdAtISO: ago(20 * 24),
  },
  {
    // Show ended 6 hours ago: dispute window running, roughly 42h on the clock.
    id: "or-seed-2", listingId: "ls-x1", eventId: "ev-tulus",
    eventTitle: "Tulus: Manusia Tour, Surabaya",
    eventImage: "/assets/events/tulus-hd.jpg",
    eventDateISO: ago(10), tierName: "Festival", sellerName: "Bagas W.",
    quantity: 1, amount: 950_000, gateKtp: false, escrowStatus: "LOCKED",
    createdAtISO: ago(16 * 24), eventEndedAtISO: ago(6),
  },
  {
    // Nobody filed anything, so the contract paid the seller by itself.
    id: "or-seed-3", listingId: "ls-x2", eventId: "ev-dwp",
    eventTitle: "Djakarta Warehouse Project 2026",
    eventImage: "/assets/events/dwp-hd.jpg",
    eventDateISO: "2026-08-09T20:00:00+07:00", tierName: "GA", sellerName: "Rizky T.",
    quantity: 1, amount: 1_250_000, gateKtp: false, escrowStatus: "RELEASED",
    createdAtISO: "2026-07-18T13:00:00+07:00",
    eventEndedAtISO: "2026-08-10T00:00:00+07:00", autoReleased: true,
  },
  {
    // Filed 20h ago with gate-time evidence, still with the arbiter.
    id: "or-seed-4", listingId: "ls-x3", eventId: "ev-pandji",
    eventTitle: "Pandji Pragiwaksono: Menyala, Bandung",
    eventImage: "/assets/events/pandji-hd.jpg",
    eventDateISO: ago(30), tierName: "Silver", sellerName: "Zahra Amelia",
    quantity: 1, amount: 430_000, gateKtp: false, escrowStatus: "DISPUTED",
    createdAtISO: ago(24 * 24), eventEndedAtISO: ago(26),
    dispute: {
      reason: "BARCODE_USED",
      note: {
        en: "Scanner showed the code had already been used. Staff turned me away at gate 3.",
        id: "Scanner menunjukkan kodenya sudah pernah dipakai. Petugas menolak saya di gate 3.",
      },
      evidence: {
        fileName: "gate-scanner-rejected.jpg",
        kind: "SCANNER_PHOTO",
        capturedAtISO: ago(29),
        atVenue: true,
        showsBarcode: true,
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
    createdAtISO: ago(40 * 24), eventEndedAtISO: ago(21 * 24 - 4),
    dispute: {
      reason: "GATE_DENIED",
      note: {
        en: "Barcode was rejected twice, the crew wrote a rejection note.",
        id: "Barcode ditolak dua kali, petugas menuliskan surat penolakan.",
      },
      evidence: {
        fileName: "staff-rejection-note.jpg",
        kind: "STAFF_LETTER",
        capturedAtISO: ago(21 * 24 - 3),
        atVenue: true,
        showsBarcode: true,
      },
      openedAtISO: ago(21 * 24 - 6),
      verdict: {
        toSeller: false,
        remedy: "REFUND_FULL",
        refundAmount: 700_000,
        sellerPenalty: 280_000,
        rationale: {
          en: "Gate-time evidence is consistent with a denied entry: timestamp and location both check out.",
          id: "Bukti dari gate konsisten dengan penolakan masuk: waktu dan lokasi sama-sama cocok.",
        },
        decidedAtISO: ago(20 * 24),
      },
    },
  },
];

const SEED_ORDERS = seedOrders();

interface OrderState {
  orders: Order[];
  /** Places an order. With `chain`, it is a real escrow on Arbitrum; without, sample data. */
  buy: (listing: Listing, event: EventItem, tier: Tier, quantity: number, chain?: OrderChain) => string;
  /** Confirms the show is over. In production this comes from the event schedule. */
  markEventFinished: (id: string) => void;
  /** Demo shortcut: jump to the end of the 48h window. */
  fastForwardWindow: (id: string) => void;
  /** Pays out every locked sample order whose window has elapsed in silence. On-chain
   *  orders are paid by the contract instead, see `settleChain`. */
  sweepAutoRelease: () => void;
  /** Mirrors what the contract reports for an on-chain order. */
  syncChain: (id: string, snap: ChainSnapshot) => void;
  /** Records a settlement that already happened on chain. */
  settleChain: (id: string, s: ChainSettlement) => void;
  openDispute: (id: string, input: { reason: DisputeReason; note: { en: string; id: string }; evidence?: DisputeEvidence }) => void;
  /** Either side answering an open claim, before the arbiter rules. */
  replyToDispute: (id: string, reply: Omit<DisputeReply, "atISO">) => void;
  /** Records that the buyer opened a handover document. This log is what
   *  settles a later "never handed over" claim, in either direction. */
  markDocsAccessed: (id: string, which: "letter" | "sellerId") => void;
  /** Organiser pulled the show. Every locked order for it refunds on its own. */
  cancelEvent: (eventId: string) => void;
  /** Organiser moved the date. The buyer chooses: keep the seat or take the money. */
  postponeEvent: (eventId: string) => void;
  /** Buyer opting out of a postponed show, which needs no arbiter. */
  refundPostponed: (id: string) => void;
  /** Records the arbiter's verdict. For an on-chain order, pass the settlement that carried it out. */
  resolveDispute: (id: string, remedy: Remedy, rationale: { en: string; id: string }, onchain?: ChainSettlement) => void;
  getById: (id: string) => Order | undefined;
}

/** An on-chain order as the contract reports it: status, window and deadline come from there. */
export function withChainSnapshot(o: Order, snap: ChainSnapshot, now: number = Date.now()): Order {
  if (!o.chain) return o;
  const settled = snap.status === "Released" ? "RELEASED" : snap.status === "Refunded" ? "REFUNDED" : null;
  // A dispute only shows as one when its details were filed here; the contract flag alone has no reason attached.
  const escrowStatus: EscrowStatus = settled ?? (snap.disputed && o.dispute ? "DISPUTED" : "LOCKED");
  const ended = snap.eventEndsAt * 1000 <= now ? new Date(snap.eventEndsAt * 1000).toISOString() : undefined;
  const unchanged =
    o.escrowStatus === escrowStatus &&
    o.eventEndedAtISO === (ended ?? o.eventEndedAtISO) &&
    o.chain.deadline === snap.deadline &&
    o.chain.window === snap.disputeWindow &&
    o.chain.status === snap.status;
  if (unchanged) return o; // polling every few seconds must not rewrite storage each time
  return {
    ...o,
    escrowStatus,
    eventEndedAtISO: ended ?? o.eventEndedAtISO,
    autoReleased: o.autoReleased || (settled === "RELEASED" && !o.dispute),
    chain: { ...o.chain, deadline: snap.deadline, window: snap.disputeWindow, status: snap.status },
  };
}

/** On-chain orders keep their transactions next to the order, so the UI can link each one. */
const withSettlement = (o: Order, s?: ChainSettlement): Order =>
  o.chain && s ? { ...o, chain: { ...o.chain, txs: { ...o.chain.txs, settle: s.tx, withdrawals: s.withdrawals } } } : o;

const patch = (orders: Order[], id: string, fn: (o: Order) => Order) =>
  orders.map((o) => (o.id === id ? fn(o) : o));

export const useOrders = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: SEED_ORDERS,

      buy: (listing, event, tier, quantity, chain) => {
        const id = "or-" + Date.now();
        const order: Order = {
          id, listingId: listing.id, eventId: event.id, eventTitle: event.title,
          eventImage: event.image, eventDateISO: event.dateISO, tierName: tier.name,
          sellerName: listing.sellerName, quantity, amount: listing.askPrice * quantity,
          gateKtp: listing.gateKtp, escrowStatus: "LOCKED", chain,
          createdAtISO: new Date().toISOString(),
        };
        set((s) => ({ orders: [order, ...s.orders] }));
        return id;
      },

      // The two shortcuts below bend the clock, which only a sample order allows.
      // An on-chain order runs on the contract's clock.
      markEventFinished: (id) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) =>
            o.escrowStatus === "LOCKED" && !o.eventEndedAtISO && !o.chain
              ? { ...o, eventEndedAtISO: new Date().toISOString() }
              : o
          ),
        })),

      fastForwardWindow: (id) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) => {
            if (o.escrowStatus !== "LOCKED" || o.chain) return o;
            // Backdate the end of the show so the deadline lands one minute ago.
            const ended = new Date(Date.now() - DISPUTE_WINDOW_H * H - 60_000).toISOString();
            return { ...o, eventEndedAtISO: ended };
          }),
        })),

      sweepAutoRelease: () => {
        const now = Date.now();
        const due = get().orders.some((o) => {
          if (o.escrowStatus !== "LOCKED" || o.chain) return false;
          const deadline = disputeDeadlineISO(o);
          return !!deadline && now >= new Date(deadline).getTime();
        });
        if (!due) return; // avoid pointless state writes on every tick
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.escrowStatus !== "LOCKED" || o.chain) return o;
            const deadline = disputeDeadlineISO(o);
            if (!deadline || now < new Date(deadline).getTime()) return o;
            return { ...o, escrowStatus: "RELEASED", autoReleased: true };
          }),
        }));
      },

      syncChain: (id, snap) =>
        set((s) => ({ orders: patch(s.orders, id, (o) => withChainSnapshot(o, snap)) })),

      settleChain: (id, st) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) =>
            withSettlement(
              {
                ...o,
                escrowStatus: st.escrowStatus,
                autoReleased: st.autoReleased ?? o.autoReleased,
                autoRefundReason: st.autoRefundReason ?? o.autoRefundReason,
                eventStatus: st.autoRefundReason === "EVENT_CANCELLED" ? "cancelled" : o.eventStatus,
              },
              st
            )
          ),
        })),

      // Filing is only possible inside the window, and only with evidence attached.
      openDispute: (id, input) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) => {
            if (!canFileDispute(o)) return o;
            const dispute: Dispute = { ...input, openedAtISO: new Date().toISOString() };
            return { ...o, escrowStatus: "DISPUTED", dispute };
          }),
        })),

      // The arbiter picks a rung on the remedy ladder. Anything other than
      // releasing to the seller costs the seller the sale plus a penalty.
      resolveDispute: (id, remedy, rationale, onchain) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) => {
            if (o.escrowStatus !== "DISPUTED" || !o.dispute) return o;
            const toSeller = remedy === "RELEASE_SELLER";
            const refundAmount =
              remedy === "REFUND_FULL" ? o.amount
              : remedy === "REFUND_PARTIAL" ? partialAmount(o, o.dispute.reason)
              : 0;
            return withSettlement({
              ...o,
              // A replacement keeps the escrow open on the new seat; the mock
              // settles it as a full refund so the money is never left in limbo.
              escrowStatus: toSeller ? "RELEASED" : "REFUNDED",
              dispute: {
                ...o.dispute,
                verdict: {
                  toSeller,
                  remedy,
                  refundAmount: remedy === "REPLACEMENT" ? o.amount : refundAmount,
                  sellerPenalty: toSeller ? 0 : sellerPenalty(o.amount),
                  rationale,
                  decidedAtISO: new Date().toISOString(),
                },
              },
            }, onchain);
          }),
        })),

      replyToDispute: (id, reply) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) =>
            o.escrowStatus === "DISPUTED" && o.dispute
              ? {
                  ...o,
                  dispute: {
                    ...o.dispute,
                    replies: [...(o.dispute.replies ?? []), { ...reply, atISO: new Date().toISOString() }],
                  },
                }
              : o
          ),
        })),

      markDocsAccessed: (id, which) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) => {
            const key = which === "letter" ? "letterAtISO" : "sellerIdAtISO";
            if (o.docsAccessed?.[key]) return o; // first open is the one that counts
            return { ...o, docsAccessed: { ...o.docsAccessed, [key]: new Date().toISOString() } };
          }),
        })),

      // A cancelled show is not a dispute: nobody did anything wrong, so the
      // escrow simply reverses. This is the case that would otherwise pay a
      // seller for a concert that never happened.
      // On-chain orders are left alone here: their refund has to happen on chain
      // first, and `settleChain` records it.
      cancelEvent: (eventId) =>
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.eventId !== eventId || o.chain) return o;
            if (o.escrowStatus !== "LOCKED") return { ...o, eventStatus: "cancelled" };
            return {
              ...o,
              eventStatus: "cancelled",
              escrowStatus: "REFUNDED",
              autoRefundReason: "EVENT_CANCELLED",
            };
          }),
        })),

      postponeEvent: (eventId) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.eventId === eventId && !o.chain ? { ...o, eventStatus: "postponed" } : o)),
        })),

      refundPostponed: (id) =>
        set((s) => ({
          orders: patch(s.orders, id, (o) =>
            o.escrowStatus === "LOCKED" && o.eventStatus === "postponed" && !o.chain
              ? { ...o, escrowStatus: "REFUNDED" }
              : o
          ),
        })),

      getById: (id) => get().orders.find((o) => o.id === id),
    }),
    {
      name: "lummy:orders",
      // v2 dropped the fake contract address and transaction hashes that sample orders used to carry.
      version: 2,
      migrate: () => ({ orders: seedOrders() }),
    }
  )
);
