// Orders kept in the database, in the shape the pages already render. Shared by the browser
// (reads under RLS) and the order routes (which check every action against the same escrow
// rules), so both sides agree on what state an order is in.
import { DISPUTE_WINDOW_H, EVENT_DURATION_H } from "@/lib/mock/escrow";
import type { Dispute, DisputeEvidence, EscrowStatus, Order } from "@/lib/mock/types";
import { MATERAI, platformFee } from "@/lib/mock/util";
import { eventPoster } from "@/lib/poster";
import type { Database, Json, Tables, TablesInsert } from "@/lib/supabase/types";

/** One order with its claim thread. */
export const ORDER_SELECT = "*, disputes(*, dispute_replies(*))";

type ReplyRow = Tables<"dispute_replies">;
type DisputeRow = Tables<"disputes"> & { dispute_replies?: ReplyRow[] | null };
export type OrderRow = Tables<"orders"> & { disputes?: DisputeRow | DisputeRow[] | null };

export type DbEscrowStatus = Database["public"]["Enums"]["escrow_status"];

/** Escrow states that still hold the money. */
export const HELD: DbEscrowStatus[] = ["Listed", "Funded", "DisputeWindow"];

/** The contract's states, in the four the app speaks. */
export function escrowStatusOf(status: DbEscrowStatus, disputed: boolean): EscrowStatus {
  if (status === "Released") return "RELEASED";
  if (status === "Refunded" || status === "Cancelled") return "REFUNDED";
  return disputed ? "DISPUTED" : "LOCKED";
}

const evidenceOf = (v: Json | null): DisputeEvidence | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as unknown as DisputeEvidence) : undefined;

const unix = (iso: string | null) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined);

function disputeOf(raw: OrderRow["disputes"]): Dispute | undefined {
  const d = Array.isArray(raw) ? raw[0] : raw;
  if (!d) return undefined;
  return {
    reason: d.reason,
    note: { en: d.note_en, id: d.note_id },
    evidence: evidenceOf(d.evidence),
    openedAtISO: d.opened_at,
    replies: [...(d.dispute_replies ?? [])]
      .sort((a, b) => a.id - b.id)
      .map((r) => ({ fromSeller: r.from_seller, note: { en: r.note_en, id: r.note_id }, evidence: evidenceOf(r.evidence), atISO: r.created_at })),
    verdict:
      d.verdict_remedy && d.decided_at
        ? {
            toSeller: !!d.verdict_to_seller,
            remedy: d.verdict_remedy,
            refundAmount: d.refund_amount ?? 0,
            sellerPenalty: d.seller_penalty ?? 0,
            rationale: { en: d.rationale_en ?? "", id: d.rationale_id ?? "" },
            decidedAtISO: d.decided_at,
          }
        : undefined,
  };
}

export function orderFromRow(r: OrderRow): Order {
  const onchain =
    r.onchain_listing_id && r.contract_address && r.onchain_price && r.event_ends_at && r.tx_create && r.tx_fund && r.tx_handover
      ? {
          listingId: r.onchain_listing_id,
          escrow: r.contract_address,
          price: r.onchain_price,
          eventEndsAt: unix(r.event_ends_at)!,
          deadline: unix(r.dispute_deadline),
          txs: {
            create: r.tx_create,
            fund: r.tx_fund,
            handover: r.tx_handover,
            settle: r.tx_settle ?? undefined,
            withdrawals: r.tx_withdrawals,
          },
        }
      : undefined;
  return {
    id: r.id,
    listingId: r.listing_id ?? "",
    eventId: r.event_id ?? "",
    eventTitle: r.event_title,
    eventImage: r.event_image ?? eventPoster(r.event_id ?? r.id),
    eventDateISO: r.event_date,
    tierName: r.tier_name,
    sellerName: r.seller_name,
    quantity: r.quantity,
    amount: r.amount,
    gateKtp: r.gate_ktp,
    escrowStatus: escrowStatusOf(r.escrow_status, r.disputed),
    chain: onchain,
    createdAtISO: r.created_at,
    eventEndedAtISO: r.event_ended_at ?? undefined,
    eventEndsAtISO: r.event_ends_at ?? undefined,
    autoReleased: r.auto_released || undefined,
    autoRefundReason: r.auto_refund_reason === "EVENT_CANCELLED" || r.auto_refund_reason === "EVENT_POSTPONED" ? r.auto_refund_reason : undefined,
    eventStatus: r.event_status,
    docsAccessed:
      r.docs_letter_at || r.docs_seller_id_at || r.docs_ticket_at
        ? {
            letterAtISO: r.docs_letter_at ?? undefined,
            sellerIdAtISO: r.docs_seller_id_at ?? undefined,
            ticketAtISO: r.docs_ticket_at ?? undefined,
          }
        : undefined,
    ticketFile: r.ticket_file || undefined,
    lateListing: r.late_listing || undefined,
    dispute: disputeOf(r.disputes),
    buyerId: r.buyer_id,
    sellerId: r.seller_id ?? undefined,
  };
}

const H = 3_600_000;

/**
 * The other direction, for orders the server writes whole: the demo accounts' seed. Links to an
 * event or listing are kept only when that row exists (past tour stops have none). Payment on
 * these is simulated, so the chain columns stay empty.
 */
export function rowsFromOrder(
  o: Order,
  who: { buyerId: string; sellerId: string | null; decidedBy: string | null; eventIds: Set<string>; listingIds: Set<string> }
) {
  const endsAt = o.eventEndedAtISO ?? new Date(new Date(o.eventDateISO).getTime() + EVENT_DURATION_H * H).toISOString();
  const order: TablesInsert<"orders"> = {
    id: o.id,
    listing_id: who.listingIds.has(o.listingId) ? o.listingId : null,
    event_id: who.eventIds.has(o.eventId) ? o.eventId : null,
    buyer_id: who.buyerId,
    seller_id: who.sellerId,
    event_title: o.eventTitle,
    event_image: o.eventImage,
    event_date: o.eventDateISO,
    tier_name: o.tierName,
    seller_name: o.sellerName,
    quantity: o.quantity,
    amount: o.amount,
    fee: platformFee(o.amount),
    materai: MATERAI,
    gate_ktp: o.gateKtp,
    late_listing: !!o.lateListing,
    escrow_status: o.escrowStatus === "RELEASED" ? "Released" : o.escrowStatus === "REFUNDED" ? "Refunded" : "Funded",
    disputed: !!o.dispute,
    event_status: o.eventStatus ?? "scheduled",
    event_ends_at: endsAt,
    dispute_deadline: new Date(new Date(endsAt).getTime() + DISPUTE_WINDOW_H * H).toISOString(),
    auto_released: !!o.autoReleased,
    auto_refund_reason: o.autoRefundReason ?? null,
    created_at: o.createdAtISO,
  };
  const d = o.dispute;
  const v = d?.verdict;
  const dispute: TablesInsert<"disputes"> | null = d
    ? {
        order_id: o.id,
        reason: d.reason,
        note_en: d.note.en,
        note_id: d.note.id,
        evidence: d.evidence ? (d.evidence as unknown as Json) : null,
        opened_at: d.openedAtISO,
        ...(v
          ? {
              verdict_remedy: v.remedy,
              verdict_to_seller: v.toSeller,
              refund_amount: v.refundAmount,
              seller_penalty: v.sellerPenalty,
              rationale_en: v.rationale.en,
              rationale_id: v.rationale.id,
              decided_at: v.decidedAtISO,
              decided_by: who.decidedBy,
            }
          : {}),
      }
    : null;
  return { order, dispute };
}
