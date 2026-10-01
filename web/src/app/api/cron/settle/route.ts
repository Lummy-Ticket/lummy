// Pays out every order whose window has passed in silence, so the clock settles it even when nobody
// opens the order: until this ran, a payout waited for the buyer or the seller to look. Vercel Cron
// calls it once a day (vercel.json). It needs no secret: it can only do what the escrow rules
// already allow, the same as the order page asking (lib/orders/settle.ts), and an order it pays is
// no longer due the next time.
import { NextResponse } from "next/server";
import { HELD, ORDER_SELECT, type OrderRow } from "@/lib/orders/map";
import { settleOrder } from "@/lib/orders/settle";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Chain releases go one by one through the operator, so a run stops before the function would. */
const BUDGET_MS = 45_000;
const BATCH = 50;
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "database belum tersambung di server ini" }, { status: 503, headers: noStore });
  const started = Date.now();
  const { data, error } = await admin
    .from("orders")
    .select(ORDER_SELECT)
    .in("escrow_status", HELD)
    .eq("disputed", false)
    .lte("dispute_deadline", new Date(started).toISOString())
    .order("dispute_deadline")
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });

  const due = (data ?? []) as unknown as OrderRow[];
  let released = 0;
  let left = 0;
  const failures: string[] = [];
  for (const row of due) {
    if (Date.now() - started > BUDGET_MS) {
      left++;
      continue;
    }
    const r = await settleOrder(admin, row, Date.now());
    if (r.ok) released += r.released ? 1 : 0;
    // "Not due yet" is the contract's clock running behind the database's; it is picked up next run.
    else if (r.status !== 409) failures.push(r.error);
  }
  if (failures.length) console.error("[cron/settle] payouts that failed:", failures);
  // Counts only: which orders exist is nobody's business here.
  return NextResponse.json({ due: due.length, released, left, failed: failures.length }, { headers: noStore });
}
