// One QRIS hold, for its buyer (docs/09 §6). GET reads it, bringing it up to date with Xendit and
// writing the order once the money is in; the checkout page asks every few seconds. POST cancels
// it, or in test mode pays it through Xendit's simulator.
import { NextResponse } from "next/server";
import { cancelHold, orderIdOf, PAYMENT_ID, paymentView, syncPayment, type PaymentRow } from "@/lib/payments/checkout";
import { simulateQris, xenditConfig, XenditError } from "@/lib/payments/xendit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function load(id: string) {
  const admin = supabaseAdmin();
  const cfg = xenditConfig();
  if (!admin || !cfg) return { error: fail(503, "pembayaran QRIS belum aktif di server ini") } as const;
  const user = await currentUser();
  if (!user) return { error: fail(401, "masuk dulu") } as const;
  if (!PAYMENT_ID.test(id)) return { error: fail(404, "pembayaran tidak ditemukan") } as const;
  const { data: row, error } = await admin.from("payments").select("*").eq("id", id).maybeSingle();
  if (error) return { error: fail(500, error.message) } as const;
  // Someone else's hold reads as missing, not as forbidden.
  if (!row || (row.buyer_id !== user.id && !user.staff)) return { error: fail(404, "pembayaran tidak ditemukan") } as const;
  return { admin, cfg, user, row } as const;
}

async function answer(admin: NonNullable<ReturnType<typeof supabaseAdmin>>, row: PaymentRow) {
  const orderId = row.status === "paid" ? await orderIdOf(admin, row.id) : null;
  return NextResponse.json(paymentView(row, orderId), { headers: noStore });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  if ("error" in r) return r.error;
  try {
    return await answer(r.admin, await syncPayment(r.admin, r.cfg, r.row));
  } catch (e) {
    console.error("[payments] read:", id, (e as Error).message);
    return fail(500, "status pembayaran gagal dibaca");
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  if ("error" in r) return r.error;
  const { admin, cfg, user, row } = r;
  // Staff may read a hold; only its buyer acts on it.
  if (row.buyer_id !== user.id) return fail(403, "hanya pembeli yang bisa mengubah pembayaran ini");
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;

  try {
    if (body?.action === "cancel") return await answer(admin, await cancelHold(admin, cfg, row));

    if (body?.action === "simulate") {
      if (!cfg.testMode) return fail(400, "simulasi cuma ada di mode test");
      if (row.status !== "pending" || !row.provider_ref) return answer(admin, row);
      await simulateQris(cfg, row.provider_ref, Number(row.total));
      // Xendit settles a simulated payment within a second or two; wait for it here so the page
      // can go straight to the order.
      let fresh = row;
      for (let i = 0; i < 6; i++) {
        fresh = await syncPayment(admin, cfg, fresh, true);
        if (fresh.status !== "pending") break;
        await sleep(1000);
      }
      return await answer(admin, fresh);
    }
  } catch (e) {
    const status = e instanceof XenditError ? 502 : 500;
    console.error("[payments] action:", id, (e as Error).message);
    return fail(status, (e as Error).message);
  }
  return fail(400, "aksi tidak dikenal");
}
