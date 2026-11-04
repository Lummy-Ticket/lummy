// Paying the seller once the window has passed in silence (docs/09 §3.4). One function for the
// order page, which asks when someone opens the order, and for the daily sweep, which asks for
// every order nobody opened: the escrow rule decides, never the caller. On a chain order the
// contract's clock decides, and it may already have been settled by anyone.
import type { Hex } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chainError, chainTarget, operatorSetup, readListing, settle } from "@/lib/chain/server";
import { phaseOf } from "@/lib/mock/escrow";
import type { Database } from "@/lib/supabase/types";
import { HELD, ORDER_SELECT, orderFromRow, type OrderRow } from "./map";

if (typeof window !== "undefined") throw new Error("lib/orders/settle is server-only");

export type SweepReport = { due: number; released: number; left: number; failed: number };

/**
 * The daily sweep: every order whose window has passed in silence is asked the same as the order
 * page asks. Chain releases go one by one through the operator, so a run stops at its budget and
 * leaves the rest, still due, for the next. Orders go least recently tried first (never tried
 * first, then oldest deadline), and each is marked as it is tried: a batch of orders that keep
 * failing, or that the contract's clock keeps refusing, moves to the back instead of taking every
 * run's whole batch (production audit 2 Nov 2026, M4).
 */
export async function settleDue(admin: SupabaseClient<Database>, budgetMs: number, batch = 50): Promise<SweepReport> {
  const started = Date.now();
  const { data, error } = await admin
    .from("orders")
    .select(ORDER_SELECT)
    .in("escrow_status", HELD)
    .eq("disputed", false)
    .lte("dispute_deadline", new Date(started).toISOString())
    .order("settle_tried_at", { ascending: true, nullsFirst: true })
    .order("dispute_deadline")
    .limit(batch);
  if (error) throw new Error(error.message);
  const due = (data ?? []) as unknown as OrderRow[];
  // A full batch may mean more are waiting behind it; the next runs reach them, least tried first.
  if (due.length === batch) console.warn(`[settle] a full batch of ${batch} orders was due; the rest wait for the next run`);
  const report: SweepReport = { due: due.length, released: 0, left: 0, failed: 0 };
  const failures: string[] = [];
  for (const row of due) {
    if (Date.now() - started > budgetMs) {
      report.left++;
      continue;
    }
    const tried = await admin.from("orders").update({ settle_tried_at: new Date().toISOString() }).eq("id", row.id);
    if (tried.error) console.error("[settle] could not mark an order as tried:", row.id, tried.error.message);
    const r = await settleOrder(admin, row, Date.now());
    if (r.ok) report.released += r.released ? 1 : 0;
    // "Not due yet" is the contract's clock running behind the database's; it is picked up next run.
    else if (r.status !== 409) failures.push(r.error);
  }
  report.failed = failures.length;
  if (failures.length) console.error("[settle] payouts that failed:", failures);
  return report;
}

export type SettleOutcome =
  | { ok: true; released: boolean; tx?: { tx: string; withdrawals: string[] } }
  | { ok: false; status: number; error: string };

export async function settleOrder(admin: SupabaseClient<Database>, row: OrderRow, now: number): Promise<SettleOutcome> {
  const order = orderFromRow(row);
  if (order.escrowStatus !== "LOCKED") return { ok: false, status: 409, error: "pesanan ini sudah selesai atau sedang disengketakan" };
  // The show is read here, not taken from the order: an order a cancellation or a postponement
  // missed (its run out of time, a write that failed) must not be paid out on the old schedule. It
  // waits, logged on every daily run, for staff to refund it or move its dates (money audit, 4 Nov
  // 2026). A postponement that reached the order set its event_date to the new start.
  if (row.event_id) {
    const show = await admin.from("events").select("status, starts_at").eq("id", row.event_id).maybeSingle();
    if (show.error) return { ok: false, status: 500, error: show.error.message };
    if (show.data && (show.data.status === "cancelled" || Date.parse(show.data.starts_at) > Date.parse(row.event_date) + 60_000)) {
      return { ok: false, status: 423, error: `${row.id}: acaranya dibatalkan atau diundur setelah pesanan ini, jadi tidak dicairkan; refund atau sesuaikan jadwalnya` };
    }
  }

  if (!order.chain) {
    if (phaseOf(order, now) !== "WINDOW_CLOSED") return { ok: false, status: 409, error: "masa sengketa belum lewat" };
    const r = await admin
      .from("orders")
      .update({ escrow_status: "Released", auto_released: true })
      .eq("id", row.id)
      .in("escrow_status", HELD)
      .eq("disputed", false)
      .select("id");
    if (r.error) return { ok: false, status: 500, error: r.error.message };
    return { ok: true, released: r.data.length > 0 };
  }

  const target = chainTarget();
  if (!target) return { ok: false, status: 503, error: "belum ada kontrak untuk chain ini" };
  try {
    const live = await readListing(target, order.chain.listingId as Hex);
    if (live.status === "Released" || live.status === "Refunded") {
      const r = await admin
        .from("orders")
        .update({ escrow_status: live.status, auto_released: live.status === "Released" && !live.disputed })
        .eq("id", row.id);
      if (r.error) return { ok: false, status: 500, error: r.error.message };
      return { ok: true, released: live.status === "Released" };
    }
    if (live.status !== "DisputeWindow" || live.disputed || live.now <= live.deadline) {
      return { ok: false, status: 409, error: "masa sengketa di kontrak belum lewat" };
    }
    const op = operatorSetup();
    if (!op) return { ok: false, status: 503, error: "mode chain mati: kunci operator belum diset" };
    const tx = await settle(op, order.chain.listingId as Hex, "release");
    const r = await admin
      .from("orders")
      .update({ escrow_status: "Released", auto_released: true, tx_settle: tx.tx, tx_withdrawals: tx.withdrawals })
      .eq("id", row.id);
    if (r.error) return { ok: false, status: 500, error: r.error.message };
    return { ok: true, released: true, tx };
  } catch (e) {
    return { ok: false, status: 502, error: chainError(e) };
  }
}
