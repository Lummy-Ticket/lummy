// What can happen to a listing after it is posted: staff clear or reject one held for review, and
// the seller withdraws their own while seats are still unsold. Each change is conditional on the
// status it starts from, so two people acting at once cannot both win.
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ListingStatus = Database["public"]["Enums"]["listing_status"];
const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!/^[\w-]{1,64}$/.test(id)) return fail(404, "listing tidak ditemukan");

  const { data: listing, error } = await admin.from("listings").select("seller_id, status").eq("id", id).maybeSingle();
  if (error) return fail(500, error.message);
  const own = !!listing?.seller_id && listing.seller_id === user.id;
  // Someone else's listing under review does not exist, as far as they can tell.
  if (!listing || (!own && !user.staff && listing.status !== "active")) return fail(404, "listing tidak ditemukan");

  const { action } = ((await req.json().catch(() => null)) ?? {}) as { action?: unknown };
  let from: ListingStatus[];
  let to: ListingStatus;
  if (action === "approve" || action === "reject") {
    if (!user.staff) return fail(403, "cuma staf yang bisa meninjau listing");
    from = ["review"];
    to = action === "approve" ? "active" : "rejected";
  } else if (action === "withdraw") {
    if (!own) return fail(403, "cuma penjualnya yang bisa menarik listing ini");
    from = ["active", "review"];
    to = "cancelled";
  } else return fail(400, "aksi tidak dikenal");

  const changed = await admin.from("listings").update({ status: to }).eq("id", id).in("status", from).select("id");
  if (changed.error) return fail(500, changed.error.message);
  if (!changed.data.length) return fail(409, "status listing ini sudah berubah");

  // Going live or coming down both change what buyers see.
  if (to === "active" || listing.status === "active") revalidateTag("catalogue", { expire: 0 });
  return NextResponse.json({ ok: true, status: to }, { headers: noStore });
}
