// The ticket PDF behind a listing, for staff reviewing it. The bucket is private and has no
// policies, so the only way in is this route: it checks the caller is staff, then hands out a
// signed link that works for a minute.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!user.staff) return fail(403, "cuma staf yang boleh membuka file tiket");

  const { id } = await params;
  const { data, error } = await admin.from("listings").select("ticket_path").eq("id", id).maybeSingle();
  if (error) return fail(500, error.message);
  if (!data?.ticket_path) return fail(404, "listing ini tidak punya file tiket");

  const signed = await admin.storage.from("tickets").createSignedUrl(data.ticket_path, 60);
  if (signed.error || !signed.data) return fail(500, signed.error?.message ?? "link file gagal dibuat");
  return NextResponse.redirect(signed.data.signedUrl, { status: 302, headers: noStore });
}
