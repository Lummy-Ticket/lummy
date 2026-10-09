// The buyer's entry pass for one order (docs/09 §8): a code only the server can make, shown on the
// ticket page and scanned at the door. Only the buyer gets it, and only while the order still holds
// its seats; whether it already went in comes with it.
import { NextResponse } from "next/server";
import { admissionOf, GateError, passFor } from "@/lib/gate/server";
import { HELD } from "@/lib/orders/map";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!/^[\w-]{1,64}$/.test(id)) return fail(404, "pesanan tidak ditemukan");
  const { data: row, error } = await admin.from("orders").select("id, buyer_id, escrow_status").eq("id", id).maybeSingle();
  if (error) return fail(500, error.message);
  // The seller can read the order too, but the pass is the buyer's way in, so nobody else gets it.
  if (!row || row.buyer_id !== user.id) return fail(404, "pesanan tidak ditemukan");
  try {
    const admitted = await admissionOf(admin, id);
    const pass = HELD.includes(row.escrow_status) ? passFor(id) : null;
    return NextResponse.json({ pass, admitted }, { headers: noStore });
  } catch (e) {
    if (e instanceof GateError) return NextResponse.json({ pass: null, admitted: null, unavailable: e.message }, { headers: noStore });
    return fail(500, e instanceof Error ? e.message : String(e));
  }
}
