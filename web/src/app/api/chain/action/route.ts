// Aksi penyelesaian on-chain lewat operator: sengketa atas nama pembeli, putusan, rilis, refund.
// Aturan waktu dan hak akses tetap dijaga kontrak; route ini cuma meneruskan. Cuma untuk pesanan
// contoh, yang tidak punya baris di database: escrow milik pesanan atau pembayaran akun ditolak,
// karena putusan dan refund-nya lewat route pesanan dengan aturannya sendiri, bukan lewat demo key
// (audit otorisasi, 4 Nov 2026).
import type { Hex } from "viem";
import { chainError, operatorSetup, settle, writeAllowed, type SettleAction } from "@/lib/chain/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ACTIONS: SettleAction[] = ["dispute", "resolve", "release", "refund"];

export async function POST(req: Request) {
  const op = operatorSetup();
  if (!op) return Response.json({ error: "mode chain mati: kunci operator belum diset" }, { status: 503 });
  if (!writeAllowed(req, op)) return Response.json({ error: "demo key salah atau belum diisi" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { listingId?: unknown; action?: unknown; toBuyer?: unknown } | null;
  const listingId = String(body?.listingId ?? "");
  const action = body?.action as SettleAction;
  if (!/^0x[0-9a-fA-F]{64}$/.test(listingId)) return Response.json({ error: "listingId harus bytes32" }, { status: 400 });
  if (!ACTIONS.includes(action)) return Response.json({ error: `action harus salah satu dari ${ACTIONS.join(", ")}` }, { status: 400 });
  const toBuyerRaw = String(body?.toBuyer ?? "0");
  if (!/^\d{1,30}$/.test(toBuyerRaw)) return Response.json({ error: "toBuyer harus bilangan bulat unit USDC" }, { status: 400 });

  const admin = supabaseAdmin();
  if (admin) {
    const id = listingId.toLowerCase();
    const [orders, holds] = await Promise.all([
      admin.from("orders").select("id", { count: "exact", head: true }).ilike("onchain_listing_id", id),
      admin.from("payments").select("id", { count: "exact", head: true }).ilike("onchain_listing_id", id),
    ]);
    if (orders.error || holds.error) return Response.json({ error: (orders.error ?? holds.error)!.message }, { status: 500 });
    if ((orders.count ?? 0) + (holds.count ?? 0) > 0) {
      return Response.json({ error: "escrow ini milik pesanan akun: selesaikan lewat halaman pesanannya" }, { status: 403 });
    }
  }

  try {
    return Response.json(await settle(op, listingId as Hex, action, BigInt(toBuyerRaw)));
  } catch (e) {
    return Response.json({ error: chainError(e) }, { status: 502 });
  }
}
