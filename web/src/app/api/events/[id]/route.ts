// Staff record what an organiser did to a show.
//   cancel: its tickets stop selling, and every order still held in escrow is refunded in full, the
//     fee too: a cancellation is no one's fault, so the platform carries it (docs/09, decision E)
//     and no seller is penalised.
//   postpone: the show moves to a later date, never an earlier one. Its listings keep selling for
//     the new date, and every order still held moves with it, so its window opens after the new
//     show; its buyer may keep the ticket or take the money back (docs/01).
//   location: where the venue is, for the location check on claim photos (docs/config/05).
// On a chain order the contract acts first and the database records it. Both are safe to press
// again: a run that reaches its time budget leaves the rest for the next one, and finished orders
// are never touched twice.
import type { Hex } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { chainError, operatorSetup, postpone, readListing, settle } from "@/lib/chain/server";
import { notifyShowCancelled } from "@/lib/email/notify";
import { emailDeadline } from "@/lib/email/send";
import { inIndonesia, parseLocation } from "@/lib/events/location";
import { queueLedgerSync } from "@/lib/orders/ledger";
import { closeHoldsOfEvent } from "@/lib/payments/checkout";
import { DISPUTE_WINDOW_H, EVENT_DURATION_H } from "@/lib/mock/escrow";
import { HELD, ORDER_SELECT, orderFromRow, type OrderRow } from "@/lib/orders/map";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Chain writes go one by one through the operator, so a run stops well before the function would:
 * the rest of its time is for the answer and, on a cancellation, the buyers' emails (lib/email),
 * which go after it. A later run cannot send them, since those orders are no longer held.
 */
const BUDGET_MS = 30_000;
const H = 3_600_000;
/** Far enough for any real reschedule, not a typo's century. */
const MAX_AHEAD_MS = 2 * 365 * 24 * H;
const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });
const iso = (ms: number) => new Date(ms).toISOString();

type Admin = SupabaseClient<Database>;

const RATIONALE = {
  en: "The organiser cancelled the show, so the order was refunded in full without a ruling. The seller is not penalised.",
  id: "Penyelenggara membatalkan acaranya, jadi pesanan direfund penuh tanpa putusan. Penjual tidak dikenai penalti.",
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!user.staff) return fail(403, "cuma staf yang bisa mencatat perubahan acara");
  if (!/^[\w-]{1,64}$/.test(id)) return fail(404, "acara tidak ditemukan");
  const body = ((await req.json().catch(() => null)) ?? {}) as { action?: unknown; startsAt?: unknown; location?: unknown };
  if (body.action === "cancel") return cancel(admin, id, user.id);
  if (body.action === "postpone") return postponeShow(admin, id, body.startsAt);
  if (body.action === "location") return setLocation(admin, id, body.location);
  return fail(400, "aksi tidak dikenal");
}

/**
 * The venue's point: what Google Maps copies ("-6.21858, 106.80251") or a Maps link carrying it, or
 * null to clear it. A point outside Indonesia is refused, since that is almost always lat and lng
 * swapped, which would fail every location check after it.
 */
async function setLocation(admin: Admin, id: string, raw: unknown) {
  let point: { lat: number; lng: number } | null = null;
  if (raw !== null) {
    point = typeof raw === "string" ? parseLocation(raw) : null;
    if (!point) return fail(400, "tempel koordinat dari Google Maps (misalnya -6.21858, 106.80251) atau tautan Maps-nya");
    if (!inIndonesia(point)) return fail(400, "titik itu di luar Indonesia; lat dan lng mungkin tertukar");
  }
  const r = await admin
    .from("events")
    .update({ venue_lat: point?.lat ?? null, venue_lng: point?.lng ?? null })
    .eq("id", id)
    .select("id");
  if (r.error) return fail(500, r.error.message);
  if (!r.data.length) return fail(404, "acara tidak ditemukan");
  return NextResponse.json({ ok: true, location: point }, { headers: noStore });
}

async function cancel(admin: Admin, id: string, staffId: string) {
  const started = Date.now();
  const at = iso(started);
  const { data: event, error } = await admin.from("events").select("id, status").eq("id", id).maybeSingle();
  if (error) return fail(500, error.message);
  if (!event) return fail(404, "acara tidak ditemukan");
  if (event.status !== "cancelled") {
    const r = await admin.from("events").update({ status: "cancelled" }).eq("id", id);
    if (r.error) return fail(500, r.error.message);
  }

  // QRIS holds still open on it close first, so their seats come back to listings that then close
  // with the rest instead of going back on sale.
  let holds: { closed: number; left: number };
  try {
    holds = await closeHoldsOfEvent(admin, id);
  } catch (e) {
    return fail(500, (e as Error).message);
  }

  // Nothing more is sold. Files of listings that never sold go, like a withdrawal.
  const open = await admin.from("listings").select("id, ticket_path").eq("event_id", id).in("status", ["active", "review"]);
  if (open.error) return fail(500, open.error.message);
  if (open.data.length) {
    const closed = await admin.from("listings").update({ status: "cancelled" }).in("id", open.data.map((l) => l.id)).in("status", ["active", "review"]);
    if (closed.error) return fail(500, closed.error.message);
    const files = open.data.flatMap((l) => (l.ticket_path ? [l.ticket_path] : []));
    if (files.length) {
      const removed = await admin.storage.from("tickets").remove(files);
      if (removed.error) console.error("[events] cancelled, but listing files stayed:", removed.error.message);
      else await admin.from("listings").update({ ticket_path: null }).in("id", open.data.map((l) => l.id));
    }
  }

  // Every order still holding money is refunded.
  const held = await admin.from("orders").select(ORDER_SELECT).eq("event_id", id).in("escrow_status", HELD);
  if (held.error) return fail(500, held.error.message);
  const rows = (held.data ?? []) as unknown as OrderRow[];
  let refunded = 0;
  let remaining = 0;
  const failures: string[] = [];
  // Only orders this run refunded hear about it, so pressing it again sends nothing twice.
  const toTell: string[] = [];
  for (const row of rows) {
    if (Date.now() - started > BUDGET_MS) {
      remaining++;
      continue;
    }
    const order = orderFromRow(row);
    let tx: { tx: string; withdrawals: string[] } | null = null;
    if (order.chain) {
      const op = operatorSetup();
      if (!op) {
        failures.push("mode chain mati: kunci operator belum diset");
        continue;
      }
      try {
        tx = await settle(op, order.chain.listingId as Hex, "refund");
      } catch (e) {
        // A connection dropped after the refund went through still reads as an error: the chain
        // decides. The contract refuses once the window has closed: that order is left for a person.
        const live = await readListing(op, order.chain.listingId as Hex).catch(() => null);
        if (live?.status !== "Refunded") {
          failures.push(chainError(e));
          continue;
        }
        console.error("[events] refund went through on chain, its reply was lost:", row.id, chainError(e));
      }
    }
    const done = await admin
      .from("orders")
      .update({
        escrow_status: "Refunded",
        auto_refund_reason: "EVENT_CANCELLED",
        event_status: "cancelled",
        ...(tx ? { tx_settle: tx.tx, tx_withdrawals: tx.withdrawals } : {}),
      })
      .eq("id", row.id)
      .in("escrow_status", HELD)
      .select("id");
    if (done.error) {
      failures.push(done.error.message);
      continue;
    }
    if (!done.data.length) continue; // settled by someone else in the meantime
    refunded++;
    toTell.push(row.id);
    if (row.payment_id) queueLedgerSync(admin, row.id);
    // A claim still open on it is closed the same way: refunded in full, no penalty.
    if (order.dispute && !order.dispute.verdict) {
      await admin
        .from("disputes")
        .update({
          verdict_remedy: "REFUND_FULL",
          verdict_to_seller: false,
          refund_amount: order.amount,
          seller_penalty: 0,
          rationale_en: RATIONALE.en,
          rationale_id: RATIONALE.id,
          decided_at: at,
          decided_by: staffId,
        })
        .eq("order_id", row.id)
        .is("decided_at", null);
    }
  }
  if (failures.length) console.error(`[events] ${id} cancelled; refunds that failed:`, failures);
  notifyShowCancelled(admin, toTell, emailDeadline(started, maxDuration));

  revalidateTag("catalogue", { expire: 0 });
  return NextResponse.json(
    {
      ok: true,
      listingsClosed: open.data.length,
      holdsClosed: holds.closed,
      holdsLeft: holds.left,
      refunded,
      failed: failures.length,
      remaining,
      errors: failures.slice(0, 3),
    },
    { headers: noStore }
  );
}

async function postponeShow(admin: Admin, id: string, startsAtRaw: unknown) {
  const started = Date.now();
  const startsAt = typeof startsAtRaw === "string" ? Date.parse(startsAtRaw) : NaN;
  if (!Number.isFinite(startsAt)) return fail(400, "tanggal barunya tidak terbaca");
  // The catalogue's date, which is the one a rolling demo show is sold at.
  const { data: event, error } = await admin.from("catalogue_events").select("starts_at, status").eq("id", id).maybeSingle();
  if (error) return fail(500, error.message);
  if (!event?.starts_at) return fail(404, "acara tidak ditemukan");
  if (event.status === "cancelled") return fail(409, "acara ini sudah dibatalkan");
  const current = new Date(event.starts_at).getTime();
  // Later only, as the contract holds, so a postponed show never pays out sooner. The same date
  // again finishes a run that stopped at its budget.
  const finishing = event.status === "postponed" && startsAt === current;
  if (!finishing && startsAt <= current) return fail(400, "jadwal cuma bisa dimundurkan, tidak dimajukan");
  if (startsAt <= started) return fail(400, "tanggal barunya sudah lewat");
  if (startsAt > started + MAX_AHEAD_MS) return fail(400, "tanggal barunya terlalu jauh");
  if (!finishing) {
    const r = await admin.from("events").update({ status: "postponed", starts_at: iso(startsAt), rolling_hour: null }).eq("id", id);
    if (r.error) return fail(500, r.error.message);
  }

  // Every order still holding money moves with the show. One bought after an earlier move knew the
  // date it bought, so it moves only when the show moves past it again.
  const held = await admin.from("orders").select(ORDER_SELECT).eq("event_id", id).in("escrow_status", HELD);
  if (held.error) return fail(500, held.error.message);
  const rows = (held.data ?? []) as unknown as OrderRow[];
  const endsAt = startsAt + EVENT_DURATION_H * H;
  let moved = 0;
  let remaining = 0;
  const failures: string[] = [];
  for (const row of rows) {
    if (Date.now() - started > BUDGET_MS) {
      remaining++;
      continue;
    }
    const order = orderFromRow(row);
    // The contract keeps whole seconds.
    const end = order.chain ? Math.floor(endsAt / 1000) * 1000 : endsAt;
    if (row.event_ends_at && new Date(row.event_ends_at).getTime() >= end) continue;
    let deadline: number;
    if (order.chain) {
      const op = operatorSetup();
      if (!op) {
        failures.push("mode chain mati: kunci operator belum diset");
        continue;
      }
      try {
        deadline = (await postpone(op, order.chain.listingId as Hex, end / 1000)).deadline * 1000;
      } catch (e) {
        // The contract refuses once the window has closed in silence: that order pays out as it stands.
        failures.push(chainError(e));
        continue;
      }
    } else {
      // The contract's rule (decision G): a window that closed in silence is not reopened.
      if (!row.disputed && row.dispute_deadline && Date.now() > new Date(row.dispute_deadline).getTime()) {
        failures.push("WindowClosed");
        continue;
      }
      deadline = end + DISPUTE_WINDOW_H * H;
    }
    const r = await admin
      .from("orders")
      .update({ event_date: iso(startsAt), event_ends_at: iso(end), dispute_deadline: iso(deadline), event_status: "postponed" })
      .eq("id", row.id)
      .in("escrow_status", HELD)
      .select("id");
    if (r.error) {
      failures.push(r.error.message);
      continue;
    }
    if (r.data.length) {
      moved++;
      if (row.payment_id) queueLedgerSync(admin, row.id);
    }
  }
  if (failures.length) console.error(`[events] ${id} postponed; orders that did not move:`, failures);

  revalidateTag("catalogue", { expire: 0 });
  return NextResponse.json(
    { ok: true, startsAt: iso(startsAt), moved, failed: failures.length, remaining, errors: failures.slice(0, 3) },
    { headers: noStore }
  );
}
