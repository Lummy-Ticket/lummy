// The wallet signed a USDC hold (tasks/founder-house-usdc.md): the server checks both signatures,
// the operator locks the money in LummyEscrow with them and pays the gas, and the order is written.
// Only the hold's buyer may send it, and only once: a second send gets the same order.
import { isHex } from "viem";
import { NextResponse } from "next/server";
import { chainError } from "@/lib/chain/server";
import { PAYMENT_ID } from "@/lib/payments/checkout";
import { submitUsdcPayment, usdcRail } from "@/lib/payments/usdc";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Three transactions on Arbitrum, each waiting for its receipt.
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });
/** A 65-byte signature, as wallets return it. */
const signature = (v: unknown): v is `0x${string}` => typeof v === "string" && isHex(v) && v.length === 132;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();
  const op = usdcRail();
  if (!admin || !op) return fail(503, "pembayaran USDC belum aktif di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!PAYMENT_ID.test(id)) return fail(404, "pembayaran tidak ditemukan");

  const body = (await req.json().catch(() => null)) as { authSig?: unknown; fundSig?: unknown } | null;
  if (!signature(body?.authSig) || !signature(body?.fundSig)) return fail(400, "tanda tangan tidak lengkap");

  try {
    const r = await submitUsdcPayment(admin, op, user.id, id, body.authSig, body.fundSig);
    if (!r.ok) return fail(r.status, r.error);
    return NextResponse.json(r.value, { headers: noStore });
  } catch (e) {
    console.error("[payments] usdc submit:", id, (e as Error).message);
    return fail(500, chainError(e));
  }
}
