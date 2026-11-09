// Start a payment from any chain through NEAR Intents (lib/payments/intents.ts): hold the seats and get
// an address to pay. Real money on Arbitrum One, so only the team may (lib/near/team.ts); anyone can see
// a live quote at /api/near/quote.
import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";
import { chainError } from "@/lib/chain/server";
import { nearTeam } from "@/lib/near/team";
import { intentsOperator, startIntentCheckout } from "@/lib/payments/intents";
import { errorBody } from "@/lib/route-errors";
import { postedFromThisSite, publicOrigin } from "@/lib/public-origin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json(errorBody(error), { status, headers: noStore });

export async function POST(req: NextRequest) {
  if (!postedFromThisSite(req.headers, publicOrigin(req))) return fail(403, "permintaan ini harus dari halaman Lummy");
  const admin = supabaseAdmin();
  const op = intentsOperator();
  if (!admin || !op) return fail(503, "pembayaran lewat NEAR Intents belum aktif di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu untuk membeli");
  if (!nearTeam(user)) return fail(403, "pembayaran mainnet lewat NEAR Intents khusus akun tim selama hackathon");

  const body = (await req.json().catch(() => null)) as { listingId?: unknown; quantity?: unknown; originAsset?: unknown; refundTo?: unknown; originRefund?: unknown } | null;
  const listingId = typeof body?.listingId === "string" ? body.listingId : "";
  const quantity = Number(body?.quantity);
  const originAsset = typeof body?.originAsset === "string" ? body.originAsset : "";
  const originRefund = typeof body?.originRefund === "string" ? body.originRefund.trim() : "";
  if (!/^[\w-]{1,64}$/.test(listingId)) return fail(400, "listing tidak dikenal");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 8) return fail(400, "jumlah tiket 1 sampai 8");
  if (!originAsset || originAsset.length > 200) return fail(400, "aset tidak dikenal");
  if (typeof body?.refundTo !== "string" || !isAddress(body.refundTo)) return fail(400, "alamat refund harus alamat EVM");
  if (originRefund.length < 20 || originRefund.length > 120) return fail(400, "alamat wallet di chain asal tidak valid");

  try {
    const r = await startIntentCheckout(admin, op, user.id, listingId, quantity, { originAsset, refundTo: body.refundTo, originRefund });
    if (!r.ok) return fail(r.status, r.error);
    return NextResponse.json(r.value, { headers: noStore });
  } catch (e) {
    console.error("[intents] start:", (e as Error).message);
    return fail(500, `pembayaran gagal dimulai: ${chainError(e)}`);
  }
}
