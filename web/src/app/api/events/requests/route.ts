// Requests for shows that are not in the catalogue yet (lib/events/requests.ts, tasks 11.5).
//   GET: a seller's own requests; with ?queue=1, staff get the queue (waiting first, then the
//     latest decided ones).
//   POST: a seller files one. It carries only hints for staff; the ticket is checked when the seller
//     lists it after the show is approved, so nothing here is a trust signal from the browser.
import { NextResponse } from "next/server";
import { MAX_PENDING_PER_SELLER, REQUEST_SELECT, checkRequest, currencyOf, faceValuesOf, requestFromRow, type RequestRow } from "@/lib/events/requests";
import { publicSellerName } from "@/lib/listings/rules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });
/**
 * Requests one account may file in a day, decided ones included: the cap on waiting ones alone let a
 * rejected seller file again at once (production audit 2 Nov 2026). The table itself is the count.
 */
const MAX_REQUESTS_PER_DAY = 5;

export async function GET(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  const queue = new URL(req.url).searchParams.get("queue") === "1";
  if (queue && !user.staff) return fail(403, "antrean ini khusus staf");
  const select = () => admin.from("event_requests").select(REQUEST_SELECT);
  if (!queue) {
    const { data, error } = await select().eq("submitted_by", user.id).order("created_at", { ascending: false }).limit(20);
    if (error) return fail(500, error.message);
    return NextResponse.json({ requests: (data as RequestRow[]).map(requestFromRow) }, { headers: noStore });
  }
  // Every request still waiting, oldest first since it has waited longest, then the latest decided.
  const [waiting, decided] = await Promise.all([
    select().eq("status", "pending").order("created_at", { ascending: true }).limit(100),
    select().neq("status", "pending").order("reviewed_at", { ascending: false, nullsFirst: false }).limit(20),
  ]);
  const error = waiting.error ?? decided.error;
  if (error) return fail(500, error.message);
  const rows = [...(waiting.data as RequestRow[]), ...(decided.data as RequestRow[])];
  return NextResponse.json({ requests: rows.map(requestFromRow) }, { headers: noStore });
}

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const checked = checkRequest(body);
  if (!checked.ok) return fail(400, checked.error.id);
  const input = checked.value;

  const waiting = await admin.from("event_requests").select("id, title, starts_at").eq("submitted_by", user.id).eq("status", "pending");
  if (waiting.error) return fail(500, waiting.error.message);
  if (waiting.data.length >= MAX_PENDING_PER_SELLER) return fail(429, `kamu sudah punya ${MAX_PENDING_PER_SELLER} pengajuan yang menunggu; tunggu staf memutusnya dulu`);
  const today = await admin
    .from("event_requests")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by", user.id)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if (today.error) return fail(500, today.error.message);
  if ((today.count ?? 0) >= MAX_REQUESTS_PER_DAY) return fail(429, `paling banyak ${MAX_REQUESTS_PER_DAY} pengajuan dalam sehari; coba lagi besok`);
  const day = input.startsAt.slice(0, 10);
  if (waiting.data.some((r) => r.title.toLowerCase() === input.title.toLowerCase() && r.starts_at.slice(0, 10) === day)) {
    return fail(409, "acara ini sudah kamu ajukan dan masih menunggu");
  }

  const { data, error } = await admin
    .from("event_requests")
    .insert({
      submitted_by: user.id,
      submitter_name: publicSellerName(user.fullName),
      title: input.title,
      starts_at: input.startsAt,
      venue: input.venue,
      city: input.city,
      country: input.country,
      currency: currencyOf(input.country),
      category: input.category,
      face_values: faceValuesOf(input),
      pdf_tier: input.pdfTier,
      organizer_ref: input.organizerRef,
      note: input.note,
      ticket_checked: false,
    })
    .select(REQUEST_SELECT)
    .single();
  if (error) return fail(500, error.message);
  return NextResponse.json({ request: requestFromRow(data as RequestRow) }, { status: 201, headers: noStore });
}
