// Xendit's webhook for QRIS payments (docs/09 §6), registered in the Xendit dashboard as
// https://lummy.id/api/payments/xendit/webhook. It must carry the dashboard's verification token
// in x-callback-token. Even then it is only a nudge: the hold is read back from Xendit with our
// own key before anything is written, so a forged or replayed call cannot make an order.
// Answers 2xx once handled (Xendit retries anything else, up to six times over a day).
import { NextResponse } from "next/server";
import { PAYMENT_ID, syncPayment } from "@/lib/payments/checkout";
import { callbackTokenMatches, PAYMENT_REQUEST_ID, xenditConfig } from "@/lib/payments/xendit";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const cfg = xenditConfig();
  const admin = supabaseAdmin();
  if (!cfg || !admin) return NextResponse.json({ error: "pembayaran QRIS belum aktif" }, { status: 503, headers: noStore });
  if (!callbackTokenMatches(req.headers.get("x-callback-token"), cfg)) {
    return NextResponse.json({ error: "token tidak cocok" }, { status: 401, headers: noStore });
  }

  const body = (await req.json().catch(() => null)) as { event?: unknown; data?: { payment_request_id?: unknown; reference_id?: unknown } } | null;
  const prId = typeof body?.data?.payment_request_id === "string" ? body.data.payment_request_id : "";
  const reference = typeof body?.data?.reference_id === "string" ? body.data.reference_id : "";

  let found = null;
  if (PAYMENT_REQUEST_ID.test(prId)) {
    const r = await admin.from("payments").select("*").eq("provider_ref", prId).maybeSingle();
    if (r.error) return NextResponse.json({ error: "database" }, { status: 500, headers: noStore });
    found = r.data;
  }
  if (!found && PAYMENT_ID.test(reference)) {
    const r = await admin.from("payments").select("*").eq("id", reference).maybeSingle();
    if (r.error) return NextResponse.json({ error: "database" }, { status: 500, headers: noStore });
    found = r.data;
  }
  // Not one of ours (another integration on the account, or a dashboard test): acknowledge it.
  if (!found) return NextResponse.json({ ignored: true }, { headers: noStore });

  try {
    const fresh = await syncPayment(admin, cfg, found, true);
    return NextResponse.json({ status: fresh.status }, { headers: noStore });
  } catch (e) {
    console.error("[payments] webhook:", found.id, (e as Error).message);
    return NextResponse.json({ error: "gagal diproses, akan dicoba lagi" }, { status: 500, headers: noStore });
  }
}
