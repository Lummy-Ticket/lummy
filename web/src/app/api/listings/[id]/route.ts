// What can happen to a listing after it is posted: staff clear or reject one held for review, and
// the seller withdraws their own while seats are still unsold. Each change is conditional on the
// status it starts from, so two people acting at once cannot both win.
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { notifyListingLive } from "@/lib/email/notify";
import { emailDeadline } from "@/lib/email/send";
import type { Database } from "@/lib/supabase/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Named, so a clearance's emails to the show's followers know how long they have.
export const maxDuration = 60;

type ListingStatus = Database["public"]["Enums"]["listing_status"];
const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const { id } = await params;
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!/^[\w-]{1,64}$/.test(id)) return fail(404, "listing tidak ditemukan");

  const { data: listing, error } = await admin.from("listings").select("seller_id, status, ticket_path").eq("id", id).maybeSingle();
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
    // A buyer paying a QRIS for it right now would pay for a ticket that is gone (docs/09 §6), so
    // the seller waits until that hold closes, at most 20 minutes.
    const paying = await admin.from("payments").select("id", { count: "exact", head: true }).eq("listing_id", id).eq("status", "pending");
    if (paying.error) return fail(500, paying.error.message);
    if ((paying.count ?? 0) > 0) return fail(409, "ada pembeli yang sedang membayar listing ini; coba lagi setelah 20 menit");
    from = ["active", "review"];
    to = "cancelled";
  } else return fail(400, "aksi tidak dikenal");

  // Clearing records that a person looked, which is what lets a flagged listing be bought: the
  // flags stay, so the record still shows what the checks found.
  const changed = await admin
    .from("listings")
    .update({ status: to, ...(action === "approve" ? { cleared_at: new Date().toISOString() } : {}) })
    .eq("id", id)
    .in("status", from)
    .select("id");
  if (changed.error) return fail(500, changed.error.message);
  if (!changed.data.length) return fail(409, "status listing ini sudah berubah");

  // A withdrawn listing was never sold, so its ticket file (the original buyer's name and contact
  // are on it) has no further use. A rejected one keeps it as the record of what was refused.
  if (to === "cancelled" && listing.ticket_path) {
    const removed = await admin.storage.from("tickets").remove([listing.ticket_path]);
    if (removed.error) console.error("[listings] withdrawn, but the ticket file stayed:", removed.error.message);
    else await admin.from("listings").update({ ticket_path: null }).eq("id", id);
  }

  // Going live or coming down both change what buyers see.
  if (to === "active" || listing.status === "active") revalidateTag("catalogue", { expire: 0 });
  // Cleared, it is on sale now: people following the show, or this tier, hear about it.
  if (to === "active") notifyListingLive(admin, id, emailDeadline(started, maxDuration));
  return NextResponse.json({ ok: true, status: to }, { headers: noStore });
}
