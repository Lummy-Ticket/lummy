// One payment through NEAR Intents, for its buyer: reads how the swap is going and, once the money has
// reached the receiver, locks it in the escrow and writes the order (lib/payments/intents.ts). The
// checkout page asks every few seconds. Cancelling goes through /api/payments/[id], as for any hold.
import { NextResponse } from "next/server";
import { chainError } from "@/lib/chain/server";
import { orderIdOf, PAYMENT_ID } from "@/lib/payments/checkout";
import { advanceIntentPayment, intentsOperator, intentView } from "@/lib/payments/intents";
import { errorBody } from "@/lib/route-errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Up to three transactions on Arbitrum, each waiting for its receipt.
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json(errorBody(error), { status, headers: noStore });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();
  const op = intentsOperator();
  if (!admin || !op) return fail(503, "pembayaran lewat NEAR Intents belum aktif di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!PAYMENT_ID.test(id)) return fail(404, "pembayaran tidak ditemukan");
  const { data: row, error } = await admin.from("payments").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[intents] read:", id, error.message);
    return fail(500, "status pembayaran gagal dibaca");
  }
  if (!row || row.channel !== "INTENTS" || (row.buyer_id !== user.id && !user.staff)) return fail(404, "pembayaran tidak ditemukan");
  try {
    const latest = await advanceIntentPayment(admin, op, row);
    const orderId = latest.status === "paid" ? await orderIdOf(admin, latest.id) : null;
    return NextResponse.json(intentView(latest, orderId), { headers: noStore });
  } catch (e) {
    console.error("[intents] read:", id, chainError(e));
    return fail(502, "status pembayaran gagal dibaca");
  }
}
