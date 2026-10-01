// The ticket itself, handed to the buyer: the PDF the seller uploaded, behind a signed link that
// works for a minute. The buyer's first download is logged like the other handover documents,
// since it is what answers a "never handed over" claim. Staff may open it to rule on a claim;
// their opening is not the buyer's. A refunded order has given the ticket back, so it is closed.
import { NextResponse } from "next/server";
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

  const { data: order, error } = await admin
    .from("orders")
    .select("buyer_id, listing_id, ticket_file, escrow_status, docs_ticket_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(500, error.message);
  const buyer = order?.buyer_id === user.id;
  // Someone else's order does not exist, as far as they can tell; the seller already has the file.
  if (!order || (!buyer && !user.staff)) return fail(404, "pesanan tidak ditemukan");
  if (!order.ticket_file || !order.listing_id) return fail(404, "pesanan ini tidak punya file tiket");
  if (order.escrow_status === "Refunded" || order.escrow_status === "Cancelled") {
    return fail(410, "pesanan ini sudah direfund, jadi file tiketnya ditutup");
  }

  const { data: listing, error: listingError } = await admin.from("listings").select("ticket_path").eq("id", order.listing_id).maybeSingle();
  if (listingError) return fail(500, listingError.message);
  if (!listing?.ticket_path) return fail(404, "file tiketnya tidak ditemukan");

  if (buyer && !order.docs_ticket_at) {
    // The first download is the one that counts, so a later one changes nothing.
    const logged = await admin.from("orders").update({ docs_ticket_at: new Date().toISOString() }).eq("id", id).is("docs_ticket_at", null);
    if (logged.error) return fail(500, logged.error.message);
  }
  const signed = await admin.storage.from("tickets").createSignedUrl(listing.ticket_path, 60, { download: `lummy-ticket-${id}.pdf` });
  if (signed.error || !signed.data) return fail(500, signed.error?.message ?? "link file gagal dibuat");
  return NextResponse.redirect(signed.data.signedUrl, { status: 302, headers: noStore });
}
