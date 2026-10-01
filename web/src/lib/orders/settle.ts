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
 * page asks, oldest first. Chain releases go one by one through the operator, so a run stops at its
 * budget and leaves the rest, still due, for the next.
 */
export async function settleDue(admin: SupabaseClient<Database>, budgetMs: number, batch = 50): Promise<SweepReport> {
  const started = Date.now();
  const { data, error } = await admin
    .from("orders")
    .select(ORDER_SELECT)
    .in("escrow_status", HELD)
    .eq("disputed", false)
    .lte("dispute_deadline", new Date(started).toISOString())
    .order("dispute_deadline")
    .limit(batch);
  if (error) throw new Error(error.message);
  const due = (data ?? []) as unknown as OrderRow[];
  const report: SweepReport = { due: due.length, released: 0, left: 0, failed: 0 };
  const failures: string[] = [];
  for (const row of due) {
    if (Date.now() - started > budgetMs) {
      report.left++;
      continue;
    }
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
