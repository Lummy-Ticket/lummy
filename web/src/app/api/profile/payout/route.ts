// The payout account, changed only here (production audit 2 Nov 2026, M7): the browser roles lost
// their grant on payout_bank and payout_number, so a stolen session cannot change them through the
// Data API either. This asks for a sign-in made in the last FRESH_SIGN_IN_MINUTES (read from the
// session's own token), takes only a known bank and a plain account number, and emails the account
// that it changed, so the owner hears of a change they did not make.
import { NextResponse, type NextRequest } from "next/server";
import { notifyPayoutChanged } from "@/lib/email/notify";
import { FRESH_SIGN_IN_MINUTES, freshSignIn, isPayoutBank, payoutNumberOf, signedInAt } from "@/lib/profile/payout";
import { postedFromThisSite, publicOrigin } from "@/lib/public-origin";
import { errorBody } from "@/lib/route-errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string, code?: string) => NextResponse.json({ ...errorBody(error), code }, { status, headers: noStore });

export async function POST(req: NextRequest) {
  const admin = supabaseAdmin();
  const sb = await supabaseServer();
  if (!admin || !sb) return fail(503, "database belum tersambung di server ini");
  // Changed only from this site's own profile page.
  if (!postedFromThisSite(req.headers, publicOrigin(req))) return fail(403, "permintaan ini bukan dari halaman Lummy");
  const { data, error } = await sb.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return fail(401, "masuk dulu");
  if (!freshSignIn(signedInAt(claims))) {
    return fail(403, `demi keamanan, masuk ulang dulu: rekening hanya bisa diganti dalam ${FRESH_SIGN_IN_MINUTES} menit setelah masuk`, "reauth");
  }

  const body = (await req.json().catch(() => null)) as { bank?: unknown; number?: unknown } | null;
  if (!isPayoutBank(body?.bank)) return fail(400, "bank tidak dikenal");
  const number = payoutNumberOf(body?.number);
  if (!number) return fail(400, "nomor rekening 6 sampai 20 angka");

  const { data: row, error: saveError } = await admin
    .from("profiles")
    .update({ payout_bank: body.bank, payout_number: number })
    .eq("id", claims.sub)
    .select("payout_bank, payout_number")
    .maybeSingle();
  if (saveError) return fail(500, saveError.message);
  if (!row) return fail(404, "akun tidak ditemukan");
  notifyPayoutChanged(admin, claims.sub, body.bank, number);
  return NextResponse.json({ ok: true, payout_bank: row.payout_bank, payout_number: row.payout_number }, { headers: noStore });
}
