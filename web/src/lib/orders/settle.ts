// Paying the seller once the window has passed in silence (docs/09 §3.4). One function for the
// order page, which asks when someone opens the order, and for the daily sweep, which asks for
// every order nobody opened: the escrow rule decides, never the caller. On a chain order the
// contract's clock decides, and it may already have been settled by anyone.
import type { Hex } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chainError, chainTarget, operatorSetup, readListing, settle } from "@/lib/chain/server";
import { phaseOf } from "@/lib/mock/escrow";
import type { Database } from "@/lib/supabase/types";
import { HELD, orderFromRow, type OrderRow } from "./map";

if (typeof window !== "undefined") throw new Error("lib/orders/settle is server-only");

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
