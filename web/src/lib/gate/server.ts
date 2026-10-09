// The gate at a show's door (docs/09 §8), on the server. A ticket goes in once: its first scan is
// admitted and every later one refused, and the database keeps it so (gate_scans: one admission per
// ticket and show, so two scans in the same second still let one in). A buyer shows their Lummy pass,
// a code only the server can make for their order. When the pass is refused because the ticket went in
// before on something else (the seller's copy), that refusal is the proof: the order is refunded in
// full at once and the seller charged the penalty, with no claim to file and nobody to judge it.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hex } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chainError, operatorSetup, settle } from "@/lib/chain/server";
import { penaltyFor } from "@/lib/mock/escrow";
import type { DisputeEvidence } from "@/lib/mock/types";
import { queueLedgerSync } from "@/lib/orders/ledger";
import { HELD, ORDER_SELECT, orderFromRow, type OrderRow } from "@/lib/orders/map";
import { barcodeKey } from "@/lib/tickets/barcode";
import { ticketPepper } from "@/lib/tickets/server";
import type { Database, Json } from "@/lib/supabase/types";

if (typeof window !== "undefined") throw new Error("lib/gate/server hanya boleh dipakai di server");

type Admin = SupabaseClient<Database>;
type Credential = "pass" | "barcode" | "copy";

export class GateError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export type GateReason = "ALREADY_USED" | "ALREADY_ADMITTED" | "WRONG_SHOW" | "ORDER_CLOSED" | "NOT_LUMMY" | "BAD_PASS" | "LIVE_MONEY";

export type GateOutcome = {
  /** unknown: not a ticket Lummy knows; the organiser's own system decides those. */
  result: "admitted" | "refused" | "unknown";
  reason?: GateReason;
  credential?: Credential;
  orderId?: string;
  eventTitle?: string;
  tierName?: string;
  quantity?: number;
  /** On a refusal: when the ticket first went in, on what, and whether that was this same buyer. */
  firstUse?: { at: string; credential: string; byThisBuyer: boolean };
  /** A refusal that refunded the buyer, or why the refund could not be made here. */
  refund?: { amount: number; penalty: number; onChain: boolean } | { error: string };
  scanId?: number;
};

const PASS = /^LUMMY1\.([\w-]{1,64})\.([A-Za-z0-9_-]{22})$/;

const NOTE = {
  en: "Refused at the gate: the ticket had already been used.",
  id: "Ditolak di gate: tiketnya sudah dipakai lebih dulu.",
};
const RATIONALE = {
  en: "The gate refused this order's pass because its ticket had already gone in. The refusal is the proof, so the order was refunded in full without a claim, and the seller is charged the penalty.",
  id: "Gate menolak pass pesanan ini karena tiketnya sudah lebih dulu masuk. Penolakan itu buktinya, jadi pesanan direfund penuh tanpa klaim, dan penjual dikenai penalti.",
};

function pepper(): string {
  const p = ticketPepper();
  if (!p) throw new GateError("pemindai gate butuh TICKET_BARCODE_PEPPER di server", 503);
  return p;
}

/** 132 bits of HMAC over the order id, domain-separated from the barcode keys under the same pepper. */
function passMac(orderId: string, key: string) {
  return createHmac("sha256", key).update("lummy/pass/v1\0").update(orderId).digest("base64url").slice(0, 22);
}

/**
 * The code a buyer shows at the door: their order and the server's signature over it. The seller can
 * read the order id, but cannot make the signature, so they cannot walk in on the buyer's pass.
 */
export function passFor(orderId: string): string {
  return `LUMMY1.${orderId}.${passMac(orderId, pepper())}`;
}

function readPass(code: string): { orderId: string } | "bad" | null {
  if (!code.startsWith("LUMMY1.")) return null;
  const m = PASS.exec(code);
  if (!m) return "bad";
  const expected = Buffer.from(passMac(m[1], pepper()));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? { orderId: m[1] } : "bad";
}

/** What goes in for an order: each barcode of its ticket file, or the order itself for a sample ticket. */
async function unitsOf(admin: Admin, row: { id: string; listing_id: string | null }): Promise<string[]> {
  if (row.listing_id) {
    const { data, error } = await admin.from("listing_barcodes").select("barcode_hmac").eq("listing_id", row.listing_id);
    if (error) throw new Error(error.message);
    if (data.length) return data.map((b) => b.barcode_hmac);
  }
  return [`order:${row.id}`];
}

type Scan = { eventId: string; gate: string; staffId: string };

async function record(admin: Admin, s: Scan, rows: { unit: string; orderId: string | null; credential: Credential; result: "admitted" | "refused"; reason?: GateReason }[]) {
  return admin
    .from("gate_scans")
    .insert(
      rows.map((r) => ({
        event_id: s.eventId,
        unit: r.unit,
        order_id: r.orderId,
        credential: r.credential,
        result: r.result,
        reason: r.reason ?? null,
        gate: s.gate,
        scanned_by: s.staffId,
      }))
    )
    .select("id, created_at");
}

/** The first admission among these units at this show. */
async function firstUse(admin: Admin, eventId: string, units: string[]) {
  const { data, error } = await admin
    .from("gate_scans")
    .select("id, order_id, credential, created_at")
    .eq("event_id", eventId)
    .eq("result", "admitted")
    .in("unit", units)
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function loadOrder(admin: Admin, orderId: string): Promise<OrderRow | null> {
  const { data, error } = await admin.from("orders").select(ORDER_SELECT).eq("id", orderId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as OrderRow | null;
}

/** One code read at the door of `eventId`: a Lummy pass, or a ticket's own barcode. */
export async function scan(admin: Admin, code: string, s: Scan): Promise<GateOutcome> {
  const text = code.trim();
  const pass = readPass(text);
  // An altered or made-up pass is turned away without a record: it is nobody's ticket.
  if (pass === "bad") return { result: "refused", reason: "BAD_PASS", credential: "pass" };
  if (pass) return scanPass(admin, pass.orderId, s);
  return scanBarcode(admin, text, s);
}

async function scanPass(admin: Admin, orderId: string, s: Scan): Promise<GateOutcome> {
  const row = await loadOrder(admin, orderId);
  if (!row) return { result: "refused", reason: "BAD_PASS", credential: "pass" };
  const base = { credential: "pass" as const, orderId, eventTitle: row.event_title, tierName: row.tier_name, quantity: row.quantity };
  const units = await unitsOf(admin, row);

  /** Records the refusal; the outcome for the gate, and when it happened. */
  const refuse = async (reason: GateReason): Promise<{ outcome: GateOutcome; scanId: number; at: string }> => {
    const r = await record(admin, s, [{ unit: units[0], orderId, credential: "pass", result: "refused", reason }]);
    if (r.error) throw new Error(r.error.message);
    const scanId = r.data[0].id;
    return { outcome: { ...base, result: "refused", reason, scanId }, scanId, at: r.data[0].created_at };
  };
  if (row.event_id !== s.eventId) return (await refuse("WRONG_SHOW")).outcome;
  if (!HELD.includes(row.escrow_status)) return (await refuse("ORDER_CLOSED")).outcome;

  // Every ticket of the order goes in together, or none: one insert, and the index decides.
  const admitted = await record(admin, s, units.map((unit) => ({ unit, orderId, credential: "pass" as const, result: "admitted" as const })));
  if (!admitted.error) return { ...base, result: "admitted", scanId: admitted.data[0].id };
  if (admitted.error.code !== "23505") throw new Error(admitted.error.message);

  const first = await firstUse(admin, s.eventId, units);
  const byThisBuyer = first.order_id === orderId;
  const refused = await refuse(byThisBuyer ? "ALREADY_ADMITTED" : "ALREADY_USED");
  const outcome: GateOutcome = { ...refused.outcome, firstUse: { at: first.created_at, credential: first.credential, byThisBuyer } };
  // The same pass twice: they are already inside. Anything else went in on this ticket first, and
  // this refusal is what proves the buyer never got the seat they paid for.
  if (!byThisBuyer) {
    outcome.refund = await refundAtGate(admin, row, {
      scanId: refused.scanId,
      gate: s.gate,
      at: refused.at,
      firstUseAtISO: first.created_at,
      firstUse: first.credential === "copy" ? "copy" : "barcode",
    });
  }
  return outcome;
}

async function scanBarcode(admin: Admin, text: string, s: Scan): Promise<GateOutcome> {
  const key = barcodeKey(new TextEncoder().encode(text), pepper());
  const held = await admin.from("listing_barcodes").select("listing_id").eq("barcode_hmac", key).limit(1).maybeSingle();
  if (held.error) throw new Error(held.error.message);
  // Not a ticket sold through Lummy: the organiser's own system decides, and Lummy records nothing.
  if (!held.data) return { result: "unknown", reason: "NOT_LUMMY", credential: "barcode" };
  const listing = await admin.from("listings").select("event_id").eq("id", held.data.listing_id).single();
  if (listing.error) throw new Error(listing.error.message);

  const base = { credential: "barcode" as const };
  if (listing.data.event_id !== s.eventId) {
    const r = await record(admin, s, [{ unit: key, orderId: null, credential: "barcode", result: "refused", reason: "WRONG_SHOW" }]);
    if (r.error) throw new Error(r.error.message);
    return { ...base, result: "refused", reason: "WRONG_SHOW", scanId: r.data[0].id };
  }
  const admitted = await record(admin, s, [{ unit: key, orderId: null, credential: "barcode", result: "admitted" }]);
  if (!admitted.error) return { ...base, result: "admitted", scanId: admitted.data[0].id };
  if (admitted.error.code !== "23505") throw new Error(admitted.error.message);
  // Whoever holds this copy is not the one who went in. If that was the Lummy buyer, on their pass,
  // the buyer is fine; this is the copy that was sold twice.
  const first = await firstUse(admin, s.eventId, [key]);
  const r = await record(admin, s, [{ unit: key, orderId: null, credential: "barcode", result: "refused", reason: "ALREADY_USED" }]);
  if (r.error) throw new Error(r.error.message);
  return {
    ...base,
    result: "refused",
    reason: "ALREADY_USED",
    scanId: r.data[0].id,
    firstUse: { at: first.created_at, credential: first.credential, byThisBuyer: false },
  };
}

/**
 * Presenter demo: someone walks in first on a copy of this order's ticket (the seller kept one).
 * Refused when real money paid for the order, so it can never be used against a live sale.
 */
export async function simulateCopy(admin: Admin, orderId: string, s: Scan): Promise<GateOutcome> {
  const row = await loadOrder(admin, orderId);
  if (!row) throw new GateError("pesanan tidak ditemukan", 404);
  if (row.event_id !== s.eventId) throw new GateError("pesanan ini untuk acara lain", 409);
  if (row.payment_id) {
    const pay = await admin.from("payments").select("test_mode").eq("id", row.payment_id).single();
    if (pay.error) throw new Error(pay.error.message);
    if (!pay.data.test_mode) return { result: "refused", reason: "LIVE_MONEY", credential: "copy", orderId };
  }
  const units = await unitsOf(admin, row);
  const admitted = await record(admin, s, units.map((unit) => ({ unit, orderId: null, credential: "copy" as const, result: "admitted" as const })));
  if (!admitted.error) return { result: "admitted", credential: "copy", orderId, eventTitle: row.event_title, scanId: admitted.data[0].id };
  if (admitted.error.code !== "23505") throw new Error(admitted.error.message);
  return { result: "refused", reason: "ALREADY_USED", credential: "copy", orderId, eventTitle: row.event_title };
}

/**
 * The refund a gate refusal triggers: a claim filed and decided by the gate's own record. On a chain
 * escrow the contract moves the money first, as with every verdict on it; a QRIS order's public
 * record follows in the background.
 */
async function refundAtGate(
  admin: Admin,
  row: OrderRow,
  gate: { scanId: number; gate: string; at: string; firstUseAtISO: string; firstUse: "barcode" | "copy" }
): Promise<GateOutcome["refund"]> {
  const order = orderFromRow(row);
  const amount = order.amount;
  const penalty = penaltyFor("BARCODE_USED", false, amount);
  const evidence: DisputeEvidence = {
    fileName: `${gate.gate} · scan #${gate.scanId}`,
    kind: "SYSTEM_RECORD",
    capturedAtISO: gate.at,
    atVenue: true,
    showsBarcode: true,
    gate: { scanId: gate.scanId, gate: gate.gate, firstUseAtISO: gate.firstUseAtISO, firstUse: gate.firstUse },
  };

  let tx: { tx: string; withdrawals: string[] } | null = null;
  if (order.chain) {
    const op = operatorSetup();
    if (!op) return { error: "mode chain mati: kunci operator belum diset" };
    try {
      if (!row.disputed) await settle(op, order.chain.listingId as Hex, "dispute");
      tx = await settle(op, order.chain.listingId as Hex, "resolve", BigInt(order.chain.price));
    } catch (e) {
      return { error: chainError(e) };
    }
  }

  const at = new Date().toISOString();
  if (!order.dispute) {
    const filed = await admin
      .from("disputes")
      .insert({ order_id: row.id, reason: "BARCODE_USED", note_en: NOTE.en, note_id: NOTE.id, evidence: evidence as unknown as Json, opened_at: at });
    if (filed.error && filed.error.code !== "23505") return { error: filed.error.message };
  }
  const ruled = await admin
    .from("disputes")
    .update({
      verdict_remedy: "REFUND_FULL",
      verdict_to_seller: false,
      refund_amount: amount,
      seller_penalty: penalty,
      rationale_en: RATIONALE.en,
      rationale_id: RATIONALE.id,
      decided_at: at,
      decided_by: null,
    })
    .eq("order_id", row.id)
    .is("decided_at", null);
  if (ruled.error) return { error: ruled.error.message };
  const settled = await admin
    .from("orders")
    .update({ disputed: true, escrow_status: "Refunded", ...(tx ? { tx_settle: tx.tx, tx_withdrawals: tx.withdrawals } : {}) })
    .eq("id", row.id)
    .in("escrow_status", HELD);
  if (settled.error) return { error: settled.error.message };
  if (row.payment_id) queueLedgerSync(admin, row.id);
  return { amount, penalty, onChain: !!tx };
}

/** Whether, and when, this order went in through the gate. */
export async function admissionOf(admin: Admin, orderId: string) {
  const { data, error } = await admin
    .from("gate_scans")
    .select("created_at, gate")
    .eq("order_id", orderId)
    .eq("result", "admitted")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { at: data.created_at, gate: data.gate } : null;
}
