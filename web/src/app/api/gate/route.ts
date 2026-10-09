// The gate scanner, for staff standing in at an organiser's door (docs/09 §8).
//   GET   ?event=<id>                               the latest scans at that show's door
//   POST  { eventId, code, gate }                   one code read at the door
//   POST  { action: "copy", eventId, orderId, gate } presenter demo: a copy of that order's ticket
//                                                    goes in first, as if the seller kept one
import { NextResponse } from "next/server";
import { GateError, scan, simulateCopy } from "@/lib/gate/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A refusal on a chain escrow refunds through the contract: two transactions.
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });
const ID = /^[\w-]{1,64}$/;

async function staff() {
  const admin = supabaseAdmin();
  if (!admin) return { error: fail(503, "database belum tersambung di server ini") } as const;
  const user = await currentUser();
  if (!user) return { error: fail(401, "masuk dulu") } as const;
  if (!user.staff) return { error: fail(403, "cuma staf yang menjaga gate") } as const;
  return { admin, user } as const;
}

export async function GET(req: Request) {
  const s = await staff();
  if ("error" in s) return s.error;
  const event = new URL(req.url).searchParams.get("event") ?? "";
  if (!ID.test(event)) return fail(400, "acara tidak dikenal");
  const [scans, admitted, refused] = await Promise.all([
    s.admin
      .from("gate_scans")
      .select("id, order_id, credential, result, reason, gate, created_at, orders(tier_name, quantity)")
      .eq("event_id", event)
      .order("created_at", { ascending: false })
      .limit(30),
    s.admin.from("gate_scans").select("id", { count: "exact", head: true }).eq("event_id", event).eq("result", "admitted"),
    s.admin.from("gate_scans").select("id", { count: "exact", head: true }).eq("event_id", event).eq("result", "refused"),
  ]);
  const failed = [scans, admitted, refused].find((r) => r.error)?.error;
  if (failed) return fail(500, failed.message);
  return NextResponse.json({ scans: scans.data ?? [], admitted: admitted.count ?? 0, refused: refused.count ?? 0 }, { headers: noStore });
}

export async function POST(req: Request) {
  const s = await staff();
  if ("error" in s) return s.error;
  const body = ((await req.json().catch(() => null)) ?? {}) as { action?: unknown; eventId?: unknown; code?: unknown; orderId?: unknown; gate?: unknown };
  const eventId = String(body.eventId ?? "");
  if (!ID.test(eventId)) return fail(400, "acara tidak dikenal");
  const event = await s.admin.from("events").select("id, status").eq("id", eventId).maybeSingle();
  if (event.error) return fail(500, event.error.message);
  if (!event.data) return fail(404, "acara tidak ditemukan");
  if (event.data.status === "cancelled") return fail(409, "acara ini dibatalkan, gate-nya tutup");
  const gate = (typeof body.gate === "string" ? body.gate.trim().slice(0, 40) : "") || "Gate 1";
  const at = { eventId, gate, staffId: s.user.id };

  try {
    if (body.action === "copy") {
      const orderId = String(body.orderId ?? "");
      if (!ID.test(orderId)) return fail(400, "pesanan tidak dikenal");
      return NextResponse.json(await simulateCopy(s.admin, orderId, at), { headers: noStore });
    }
    const code = typeof body.code === "string" ? body.code : "";
    if (!code.trim() || code.length > 2048) return fail(400, "kode kosong atau terlalu panjang");
    return NextResponse.json(await scan(s.admin, code, at), { headers: noStore });
  } catch (e) {
    if (e instanceof GateError) return fail(e.status, e.message);
    return fail(500, e instanceof Error ? e.message : String(e));
  }
}
