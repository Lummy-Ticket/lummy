// Staff record that the organiser cancelled a show. Its tickets stop selling, and every order still
// held in escrow is refunded in full, the fee too: a cancellation is no one's fault, so the
// platform carries it (docs/09, decision E) and no seller is penalised. On a chain order the
// contract refunds first and the database records it. Safe to press again: a run that reaches its
// time budget leaves the rest for the next one, and finished orders are never touched twice.
import type { Hex } from "viem";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { chainError, operatorSetup, settle } from "@/lib/chain/server";
import { HELD, ORDER_SELECT, orderFromRow, type OrderRow } from "@/lib/orders/map";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Chain refunds go one by one through the operator, so a run stops before the function would. */
const BUDGET_MS = 45_000;
const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

const RATIONALE = {
  en: "The organiser cancelled the show, so the order was refunded in full without a ruling. The seller is not penalised.",
  id: "Penyelenggara membatalkan acaranya, jadi pesanan direfund penuh tanpa putusan. Penjual tidak dikenai penalti.",
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!user.staff) return fail(403, "cuma staf yang bisa membatalkan acara");
  if (!/^[\w-]{1,64}$/.test(id)) return fail(404, "acara tidak ditemukan");
  const { action } = ((await req.json().catch(() => null)) ?? {}) as { action?: unknown };
  if (action !== "cancel") return fail(400, "aksi tidak dikenal");

  const started = Date.now();
  const at = new Date(started).toISOString();
  const { data: event, error } = await admin.from("events").select("id, status").eq("id", id).maybeSingle();
  if (error) return fail(500, error.message);
  if (!event) return fail(404, "acara tidak ditemukan");
  if (event.status !== "cancelled") {
    const r = await admin.from("events").update({ status: "cancelled" }).eq("id", id);
    if (r.error) return fail(500, r.error.message);
  }

  // Nothing more is sold. Files of listings that never sold go, like a withdrawal.
  const open = await admin.from("listings").select("id, ticket_path").eq("event_id", id).in("status", ["active", "review"]);
  if (open.error) return fail(500, open.error.message);
  if (open.data.length) {
    const closed = await admin.from("listings").update({ status: "cancelled" }).in("id", open.data.map((l) => l.id)).in("status", ["active", "review"]);
    if (closed.error) return fail(500, closed.error.message);
    const files = open.data.flatMap((l) => (l.ticket_path ? [l.ticket_path] : []));
    if (files.length) {
      const removed = await admin.storage.from("tickets").remove(files);
      if (removed.error) console.error("[events] cancelled, but listing files stayed:", removed.error.message);
      else await admin.from("listings").update({ ticket_path: null }).in("id", open.data.map((l) => l.id));
    }
  }

  // Every order still holding money is refunded.
  const held = await admin.from("orders").select(ORDER_SELECT).eq("event_id", id).in("escrow_status", HELD);
  if (held.error) return fail(500, held.error.message);
  const rows = (held.data ?? []) as unknown as OrderRow[];
  let refunded = 0;
  let remaining = 0;
  const failures: string[] = [];
  for (const row of rows) {
    if (Date.now() - started > BUDGET_MS) {
      remaining++;
      continue;
    }
    const order = orderFromRow(row);
    let tx: { tx: string; withdrawals: string[] } | null = null;
    if (order.chain) {
      const op = operatorSetup();
      if (!op) {
        failures.push("mode chain mati: kunci operator belum diset");
        continue;
      }
      try {
        tx = await settle(op, order.chain.listingId as Hex, "refund");
      } catch (e) {
        // The contract refuses once the window has closed: that order is left for a person.
        failures.push(chainError(e));
        continue;
      }
    }
    const done = await admin
      .from("orders")
      .update({
        escrow_status: "Refunded",
        auto_refund_reason: "EVENT_CANCELLED",
        event_status: "cancelled",
        ...(tx ? { tx_settle: tx.tx, tx_withdrawals: tx.withdrawals } : {}),
      })
      .eq("id", row.id)
      .in("escrow_status", HELD)
      .select("id");
    if (done.error) {
      failures.push(done.error.message);
      continue;
    }
    if (!done.data.length) continue; // settled by someone else in the meantime
    refunded++;
    // A claim still open on it is closed the same way: refunded in full, no penalty.
    if (order.dispute && !order.dispute.verdict) {
      await admin
        .from("disputes")
        .update({
          verdict_remedy: "REFUND_FULL",
          verdict_to_seller: false,
          refund_amount: order.amount,
          seller_penalty: 0,
          rationale_en: RATIONALE.en,
          rationale_id: RATIONALE.id,
          decided_at: at,
          decided_by: user.id,
        })
        .eq("order_id", row.id)
        .is("decided_at", null);
    }
  }
  if (failures.length) console.error(`[events] ${id} cancelled; refunds that failed:`, failures);

  revalidateTag("catalogue", { expire: 0 });
  return NextResponse.json(
    { ok: true, listingsClosed: open.data.length, refunded, failed: failures.length, remaining, errors: failures.slice(0, 3) },
    { headers: noStore }
  );
}
