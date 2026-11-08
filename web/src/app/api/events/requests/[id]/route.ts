// Staff decide a show request (lib/events/requests.ts).
//   approve: the show goes into the catalogue with the categories and official prices staff checked
//     against the organiser's page, and the name rule they found there. Its seller can then list
//     the ticket, which is checked like any other.
//   reject: with the reason the seller sees, such as resale being forbidden by the organiser's terms.
//   research: the AI looks up the official page, prices and terms with their sources (tasks 12.1,
//     lib/events/research.ts) and the findings are kept on the request for staff; it decides nothing.
// Pressing either decision twice changes nothing: only a waiting request can be decided.
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { APPROVABLE_POLICIES, REQUEST_SELECT, capPctOf, officialUrl, checkTiers, eventIdFor, requestFromRow, type RequestRow } from "@/lib/events/requests";
import { notifyShowRequestDecided } from "@/lib/email/notify";
import { researchRequest } from "@/lib/events/research";
import type { TransferPolicy } from "@/lib/mock/types";
import { RATE_REFUSED, takeAttempt } from "@/lib/rate";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The research makes several searches and page reads inside one API call, which took more than 50 s
// in the first real run (8 Nov 2026). Vercel with Fluid compute allows 300 s on any plan (Pro up to
// 800 s), so the research gets four minutes and the answer the rest.
export const maxDuration = 300;
const RESEARCH_BUDGET_MS = 240_000;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const { id } = await params;
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!user.staff) return fail(403, "cuma staf yang bisa memutus pengajuan acara");
  if (!/^[\w-]{1,64}$/.test(id)) return fail(404, "pengajuan tidak ditemukan");
  const body = ((await req.json().catch(() => null)) ?? {}) as { action?: unknown; note?: unknown; tiers?: unknown; transferPolicy?: unknown; capPct?: unknown; letterTemplateUrl?: unknown };

  const found = await admin.from("event_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
  if (found.error) return fail(500, found.error.message);
  const request = found.data as RequestRow | null;
  if (!request) return fail(404, "pengajuan tidak ditemukan");
  if (request.status !== "pending") return fail(409, "pengajuan ini sudah diputus");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const decided = { reviewed_by: user.id, reviewed_at: new Date().toISOString() };

  if (body.action === "research") {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) return fail(503, "riset AI belum aktif di server ini");
    if (!(await takeAttempt(admin, user.id, "ai_research"))) return fail(429, RATE_REFUSED.ai_research);
    const seller = requestFromRow(request);
    const first = seller.faceValues[0];
    const usdc = seller.currency === "USDC";
    const out = await researchRequest(
      {
        title: request.title,
        startsAt: request.starts_at,
        venue: request.venue,
        city: request.city,
        country: request.country,
        currency: usdc ? "USDC" : "IDR",
        organizerRef: request.organizer_ref,
        pdfTier: request.pdf_tier,
        printedPrice: first ? (usdc ? first.value / 1_000_000 : first.value) : null,
      },
      { key, deadline: started + RESEARCH_BUDGET_MS }
    );
    if (!out.ok) {
      console.error("[events/requests] research did not finish:", id, out.reason, out.detail);
      return out.reason === "busy" ? fail(503, "riset AI belum selesai tepat waktu, coba lagi sebentar") : fail(502, "riset AI tidak memberi jawaban yang bisa dipakai, coba lagi atau cek manual");
    }
    const saved = await admin
      .from("event_requests")
      .update({ research: out.research, researched_at: out.research.at })
      .eq("id", id)
      .eq("status", "pending")
      .select(REQUEST_SELECT)
      .maybeSingle();
    if (saved.error) return fail(500, saved.error.message);
    if (!saved.data) return fail(409, "pengajuan ini sudah diputus");
    return NextResponse.json({ request: requestFromRow(saved.data as RequestRow) }, { headers: noStore });
  }

  if (body.action === "reject") {
    if (note.length < 5) return fail(400, "tulis alasannya untuk penjual");
    const r = await admin.from("event_requests").update({ status: "rejected", review_note: note, ...decided }).eq("id", id).eq("status", "pending").select(REQUEST_SELECT).maybeSingle();
    if (r.error) return fail(500, r.error.message);
    if (!r.data) return fail(409, "pengajuan ini sudah diputus");
    notifyShowRequestDecided(admin, id);
    return NextResponse.json({ request: requestFromRow(r.data as RequestRow) }, { headers: noStore });
  }

  if (body.action !== "approve") return fail(400, "aksi tidak dikenal");
  const tiers = checkTiers(body.tiers);
  if (!tiers.ok) return fail(400, tiers.error);
  const policy = (body.transferPolicy ?? null) as TransferPolicy | null;
  if (!APPROVABLE_POLICIES.includes(policy)) return fail(400, "aturan nama tidak dikenal; kalau S&K melarang resale, tolak pengajuannya");
  const capPct = capPctOf(body.capPct);
  if (capPct === null) return fail(400, "batas harga harus 100 sampai 150 persen harga asli");
  const rawTemplate = typeof body.letterTemplateUrl === "string" ? body.letterTemplateUrl.trim() : "";
  const letterTemplate = rawTemplate ? officialUrl(rawTemplate) : null;
  if (rawTemplate && (!letterTemplate || letterTemplate.length > 500)) return fail(400, "link template surat kuasa harus link resmi https://");
  if (Date.parse(request.starts_at) <= Date.now()) return fail(400, "acaranya sudah lewat, jadi tidak bisa masuk katalog");

  // A free id: the show's name and date, with a suffix if the same name and day exist already.
  const base = eventIdFor(request.title, request.starts_at);
  const taken = await admin.from("events").select("id").like("id", `${base}%`);
  if (taken.error) return fail(500, taken.error.message);
  const ids = new Set(taken.data.map((e) => e.id));
  let eventId = base;
  for (let n = 2; ids.has(eventId); n++) eventId = `${base}-${n}`;

  const usdc = request.currency === "USDC";
  const made = await admin.from("events").insert({
    id: eventId,
    title: request.title,
    category: request.category,
    starts_at: request.starts_at,
    venue: request.venue,
    city: request.city,
    country: request.country,
    currency: request.currency,
    transfer_policy: policy,
    cap_pct: capPct,
    letter_template_url: letterTemplate,
    featured: false,
  });
  if (made.error) return fail(500, made.error.message);
  const tierRows = tiers.value.map((t, i) => ({
    id: `t-${eventId.slice(3, 40)}-${i + 1}`,
    event_id: eventId,
    name: t.name,
    face_value: usdc ? Math.round(t.faceValue * 1_000_000) : Math.round(t.faceValue),
    sort: i,
  }));
  const tiersIn = await admin.from("tiers").insert(tierRows);
  if (tiersIn.error) {
    await admin.from("events").delete().eq("id", eventId);
    return fail(500, tiersIn.error.message);
  }
  const r = await admin
    .from("event_requests")
    .update({ status: "approved", event_id: eventId, review_note: note || null, ...decided })
    .eq("id", id)
    .eq("status", "pending")
    .select(REQUEST_SELECT)
    .maybeSingle();
  if (r.error || !r.data) {
    // Someone decided it in the meantime: the show made here goes again.
    await admin.from("tiers").delete().eq("event_id", eventId);
    await admin.from("events").delete().eq("id", eventId);
    return r.error ? fail(500, r.error.message) : fail(409, "pengajuan ini sudah diputus");
  }
  revalidateTag("catalogue", { expire: 0 });
  notifyShowRequestDecided(admin, id);
  return NextResponse.json({ request: requestFromRow(r.data as RequestRow), eventId }, { headers: noStore });
}
