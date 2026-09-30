import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Dispute, DisputeEvidence, DisputeReason, DisputeReply, EscrowStatus, EventItem, Listing, Order, OrderChain, Remedy, Tier,
} from "./types";
import { DISPUTE_WINDOW_H, canFileDispute, disputeDeadlineISO, partialAmount, penaltyFor } from "./escrow";
import { seedOrders } from "./seed-orders";

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
                  sellerPenalty: penaltyFor(o.dispute.reason, toSeller, o.amount),
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
