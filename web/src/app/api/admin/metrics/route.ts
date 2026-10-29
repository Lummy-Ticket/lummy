// How the beta is going, for staff (tasks 11.7): counted from the tables the app already writes,
// with no tracker in the browser. Four rolling weeks and the total; the demo accounts are left out,
// the team's own accounts are not (they are few, and the page says so).
import { NextResponse } from "next/server";
import type { BetaMetrics, MetricRow } from "@/lib/admin/metrics";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEMO_EMAIL_DOMAIN } from "@/lib/supabase/demo";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });
const DAY = 86_400_000;
const WEEKS = 4;

export async function GET() {
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!user.staff) return fail(403, "khusus staf");

  // The demo accounts, by their addresses, so their rehearsals do not count.
  const demo = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return fail(500, error.message);
    for (const u of data.users) if (u.email?.endsWith(`@${DEMO_EMAIL_DOMAIN}`)) demo.add(u.id);
    if (data.users.length < 200) break;
  }
  const real = (id: string | null | undefined) => !!id && !demo.has(id);

  const [profiles, listings, requests, orders, claims] = await Promise.all([
    admin.from("profiles").select("id, created_at"),
    admin.from("listings").select("seller_id, created_at, pdf_suspicious, forgery_score, cleared_at").not("seller_id", "is", null),
    admin.from("event_requests").select("submitted_by, created_at"),
    admin.from("orders").select("buyer_id, created_at"),
    admin.from("disputes").select("opened_at, orders!inner(buyer_id)"),
  ]);
  const error = profiles.error ?? listings.error ?? requests.error ?? orders.error ?? claims.error;
  if (error) return fail(500, error.message);

  const now = Date.now();
  const bucket = (dates: string[]): Pick<MetricRow, "weeks" | "total"> => {
    const weeks = Array.from({ length: WEEKS }, () => 0);
    for (const d of dates) {
      const ago = Math.floor((now - Date.parse(d)) / (7 * DAY));
      if (ago >= 0 && ago < WEEKS) weeks[ago]++;
    }
    return { weeks, total: dates.length };
  };
  const mine = (listings.data ?? []).filter((l) => real(l.seller_id));
  const flagged = mine.filter((l) => l.pdf_suspicious || l.forgery_score >= 60);
  const rows: MetricRow[] = [
    { key: "accounts", ...bucket((profiles.data ?? []).filter((p) => real(p.id)).map((p) => p.created_at)) },
    { key: "listings", ...bucket(mine.map((l) => l.created_at)) },
    { key: "held", ...bucket(flagged.map((l) => l.created_at)) },
    { key: "requests", ...bucket((requests.data ?? []).filter((r) => real(r.submitted_by)).map((r) => r.created_at)) },
    { key: "orders", ...bucket((orders.data ?? []).filter((o) => real(o.buyer_id)).map((o) => o.created_at)) },
    {
      key: "claims",
      ...bucket(
        (claims.data ?? [])
          .filter((c) => real((c.orders as unknown as { buyer_id: string | null } | null)?.buyer_id))
          .map((c) => c.opened_at)
          .filter((d): d is string => !!d)
      ),
    },
  ];
  // How long a held listing waited for a person, over the ones cleared so far.
  const waits = flagged.filter((l) => l.cleared_at).map((l) => (Date.parse(l.cleared_at!) - Date.parse(l.created_at)) / 3_600_000);
  const reviewHours = waits.length ? Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10 : null;
  const body: BetaMetrics = { rows, reviewHours, since: new Date(now - WEEKS * 7 * DAY).toISOString() };
  return NextResponse.json(body, { headers: noStore });
}
