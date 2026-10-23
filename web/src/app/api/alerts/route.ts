// An account's alerts: the shows, or the tiers of a show, it wants an email about when tickets go on
// sale (lib/email/notify). Every read and write goes through the account's own session, so the
// table's row rules decide (supabase/migrations, alert_subscriptions): an account only ever sees,
// adds or removes its own. A sample persona keeps its alerts in the browser instead (lib/mock/useAlerts).
// The cap of MAX_ALERTS and the check that a tier is the show's are this route's only: the row rules
// let an account insert its own rows straight through the Data API, past both. Neither matters to
// the emails, which go once per person per listing, and a tier that is not the show's never matches.
//   GET                                         the account's alerts, newest first
//   POST { action: "subscribe", eventId, tierId? }  follow a show, or one tier of it
//   POST { action: "unsubscribe", id }            stop one
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Through this route, one account follows at most this many shows and tiers (a tidy list, not a guard). */
const MAX_ALERTS = 50;
const ID = /^[a-z0-9-]{3,64}$/;
const COLUMNS = "id, event_id, tier_id, created_at, events(title), tiers(name)";
const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

type Row = { id: number; event_id: string; tier_id: string | null; created_at: string; events: { title: string } | null; tiers: { name: string } | null };

/** The shape the pages already render (AlertSub in lib/mock/useAlerts). */
const view = (r: Row) => ({
  id: String(r.id),
  eventId: r.event_id,
  eventTitle: r.events?.title ?? r.event_id,
  ...(r.tier_id ? { tierId: r.tier_id, tierName: r.tiers?.name ?? r.tier_id } : {}),
  createdAtISO: r.created_at,
});

async function session() {
  const [sb, user] = await Promise.all([supabaseServer(), currentUser()]);
  if (!sb) return { error: fail(503, "database belum tersambung di server ini") } as const;
  if (!user) return { error: fail(401, "masuk dulu") } as const;
  return { sb } as const;
}

export async function GET() {
  const s = await session();
  if ("error" in s) return s.error;
  const { data, error } = await s.sb.from("alert_subscriptions").select(COLUMNS).order("created_at", { ascending: false });
  if (error) return fail(500, error.message);
  return NextResponse.json({ alerts: ((data ?? []) as unknown as Row[]).map(view) }, { headers: noStore });
}

export async function POST(req: Request) {
  const s = await session();
  if ("error" in s) return s.error;
  const { sb } = s;
  const body = ((await req.json().catch(() => null)) ?? {}) as { action?: unknown; eventId?: unknown; tierId?: unknown; id?: unknown };

  if (body.action === "unsubscribe") {
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) return fail(400, "notifikasi tidak dikenal");
    const r = await sb.from("alert_subscriptions").delete().eq("id", id).select("id");
    if (r.error) return fail(500, r.error.message);
    if (!r.data.length) return fail(404, "notifikasi tidak ditemukan");
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  if (body.action !== "subscribe") return fail(400, "aksi tidak dikenal");
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const tierId = typeof body.tierId === "string" && body.tierId ? body.tierId : null;
  if (!ID.test(eventId) || (tierId !== null && !ID.test(tierId))) return fail(400, "acara atau kategori tidak dikenal");

  // The table checks that both exist, not that the tier is the show's; only this route does.
  const found = tierId
    ? await sb.from("tiers").select("id").eq("id", tierId).eq("event_id", eventId).maybeSingle()
    : await sb.from("events").select("id").eq("id", eventId).maybeSingle();
  if (found.error) return fail(500, found.error.message);
  if (!found.data) return fail(404, tierId ? "kategori ini bukan milik acara itu" : "acara tidak ditemukan");

  const mine = () => {
    const q = sb.from("alert_subscriptions").select(COLUMNS).eq("event_id", eventId);
    return (tierId ? q.eq("tier_id", tierId) : q.is("tier_id", null)).maybeSingle();
  };
  // Asking twice is not an error: the one already there comes back.
  const existing = await mine();
  if (existing.error) return fail(500, existing.error.message);
  if (existing.data) return NextResponse.json({ alert: view(existing.data as unknown as Row) }, { headers: noStore });

  const count = await sb.from("alert_subscriptions").select("id", { count: "exact", head: true });
  if (count.error) return fail(500, count.error.message);
  if ((count.count ?? 0) >= MAX_ALERTS) return fail(429, `satu akun paling banyak mengikuti ${MAX_ALERTS} acara atau kategori`);

  // The owner is the session's account: the row's default, and the only one its rules accept.
  const added = await sb.from("alert_subscriptions").insert({ event_id: eventId, tier_id: tierId }).select(COLUMNS).single();
  if (added.error?.code === "23505") {
    const again = await mine();
    if (again.data) return NextResponse.json({ alert: view(again.data as unknown as Row) }, { headers: noStore });
  }
  if (added.error || !added.data) return fail(500, added.error?.message ?? "notifikasi gagal disimpan");
  return NextResponse.json({ alert: view(added.data as unknown as Row) }, { headers: noStore });
}
