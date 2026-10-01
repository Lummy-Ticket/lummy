// A claim photo, for the two people the claim is between and the staff ruling on it: each side
// sees what the other put forward. The bucket is private with no policies, so this is the only
// way in, through a signed link that works for a minute. A month after the decision the photos are
// deleted (lib/retention.ts), and from then on this says so.
import { NextResponse } from "next/server";
import { ownsEvidencePath, type Side } from "@/lib/evidence/server";
import type { DisputeEvidence } from "@/lib/mock/types";
import { EVIDENCE_RETENTION_DAYS, evidenceGoneAt, isGone } from "@/lib/retention";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

type Claim = { evidence: unknown; decided_at: string | null; dispute_replies: { from_seller: boolean; evidence: unknown }[] | null };
type Row = { buyer_id: string; seller_id: string | null; disputes: Claim | Claim[] | null };

const pathOf = (v: unknown) => (v && typeof v === "object" ? (v as DisputeEvidence).upload?.path : undefined);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!/^[\w-]{1,64}$/.test(id)) return fail(404, "pesanan tidak ditemukan");

  const { data, error } = await admin
    .from("orders")
    .select("buyer_id, seller_id, disputes(evidence, decided_at, dispute_replies(from_seller, evidence))")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(500, error.message);
  const row = data as unknown as Row | null;
  if (!row || (row.buyer_id !== user.id && row.seller_id !== user.id && !user.staff)) return fail(404, "pesanan tidak ditemukan");

  const side: Side = new URL(req.url).searchParams.get("side") === "seller" ? "seller" : "buyer";
  const dispute = Array.isArray(row.disputes) ? row.disputes[0] : row.disputes;
  const path =
    side === "buyer"
      ? pathOf(dispute?.evidence) ?? pathOf((dispute?.dispute_replies ?? []).find((r) => !r.from_seller)?.evidence)
      : pathOf((dispute?.dispute_replies ?? []).find((r) => r.from_seller)?.evidence);
  if (!path || !ownsEvidencePath(path, id, side)) return fail(404, "tidak ada foto bukti dari pihak ini");
  if (dispute?.decided_at && isGone(evidenceGoneAt(dispute.decided_at))) {
    return fail(410, `foto bukti dihapus ${EVIDENCE_RETENTION_DAYS} hari setelah klaim diputus, karena memuat data pribadi`);
  }

  const signed = await admin.storage.from("evidence").createSignedUrl(path, 60);
  if (signed.error || !signed.data) return fail(500, signed.error?.message ?? "link foto gagal dibuat");
  return NextResponse.redirect(signed.data.signedUrl, { status: 302, headers: noStore });
}
