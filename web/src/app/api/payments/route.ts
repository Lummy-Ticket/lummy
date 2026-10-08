// QRIS checkout (docs/09 §6). GET says whether QRIS is switched on here, so the checkout page
// knows which way to pay; POST holds the seats and opens the QRIS for the signed-in buyer.
import { NextResponse } from "next/server";
import { HELD } from "@/lib/orders/map";
import { startCheckout } from "@/lib/payments/checkout";
import { QRIS_MAX, xenditConfig } from "@/lib/payments/xendit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isDemoEmail } from "@/lib/supabase/demo";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/** In test mode paying costs nothing, so the cap on open orders from POST /api/orders holds here too. */
const OPEN_ORDER_LIMIT = 3;
const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

export async function GET() {
  const cfg = xenditConfig();
  return NextResponse.json({ enabled: !!cfg && !!supabaseAdmin(), testMode: cfg?.testMode ?? false, max: QRIS_MAX }, { headers: noStore });
}

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  const cfg = xenditConfig();
  if (!admin || !cfg) return fail(503, "pembayaran QRIS belum aktif di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu untuk membeli");

  const body = (await req.json().catch(() => null)) as { listingId?: unknown; quantity?: unknown } | null;
  const listingId = typeof body?.listingId === "string" ? body.listingId : "";
  const quantity = Number(body?.quantity);
  if (!/^[\w-]{1,64}$/.test(listingId)) return fail(400, "listing tidak dikenal");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 8) return fail(400, "jumlah tiket 1 sampai 8");

  if (cfg.testMode && !user.staff && !isDemoEmail(user.email)) {
    const open = await admin.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", user.id).in("escrow_status", HELD);
    if (open.error) return fail(500, open.error.message);
    if ((open.count ?? 0) >= OPEN_ORDER_LIMIT) {
      return fail(429, `selama pembayaran masih mode test, satu akun paling banyak punya ${OPEN_ORDER_LIMIT} pesanan berjalan`);
    }
  }

  try {
    const r = await startCheckout(admin, cfg, user.id, listingId, quantity);
    if (!r.ok) return fail(r.status, r.error);
    return NextResponse.json(r.value, { headers: noStore });
  } catch (e) {
    console.error("[payments] start:", (e as Error).message);
    return fail(500, "pembayaran gagal dimulai, coba lagi");
  }
}
