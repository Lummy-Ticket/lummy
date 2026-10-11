// Where each show's venue is, for staff setting it in the console (docs/config/05). The public
// catalogue does not carry it; only the claim check on the server needs it.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "database belum tersambung di server ini" }, { status: 503, headers: noStore });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "masuk dulu" }, { status: 401, headers: noStore });
  if (!user.staff) return NextResponse.json({ error: "cuma staf" }, { status: 403, headers: noStore });
  const { data, error } = await admin.from("events").select("id, venue_lat, venue_lng").not("venue_lat", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  const locations = Object.fromEntries(data.map((e) => [e.id, { lat: e.venue_lat, lng: e.venue_lng }]));
  return NextResponse.json({ locations }, { headers: noStore });
}
