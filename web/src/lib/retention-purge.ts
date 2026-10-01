// Deletes the files whose time is up (lib/retention.ts says when). The daily job runs it within a
// time budget; whatever a run leaves, the next one finds, since it looks only at files still there.
// A scope limits a run to given listings and orders, for the check that exercises it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { EVENT_DURATION_H } from "@/lib/mock/escrow";
import type { DisputeEvidence } from "@/lib/mock/types";
import { HELD } from "@/lib/orders/map";
import type { Database, Json } from "@/lib/supabase/types";
import { ORPHAN_UPLOAD_DAYS, evidenceGoneAt, isGone, ticketFileGoneAt } from "./retention";

if (typeof window !== "undefined") throw new Error("lib/retention-purge is server-only");

const DAY = 86_400_000;
const H = 3_600_000;
/** Ids per request, so a long list never outgrows a URL. */
const CHUNK = 100;
const PAGE = 1000;

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

export type PurgeReport = { ticketFiles: number; evidenceFiles: number; orphanUploads: number; errors: string[]; unfinished: boolean };
export type PurgeScope = { listingIds?: string[]; orderIds?: string[] };

type Admin = SupabaseClient<Database>;

/** Ticket PDFs a month after their show, unless an order on the listing still holds money (an open claim does). */
async function purgeTicketFiles(admin: Admin, now: number, report: PurgeReport, scope?: PurgeScope) {
  // Oldest first, a page a run; the rest wait for the next.
  let q = admin.from("listings").select("id, event_id, ticket_path").not("ticket_path", "is", null).order("created_at").limit(PAGE);
  if (scope?.listingIds) q = q.in("id", scope.listingIds);
  const listings = await q;
  if (listings.error) return void report.errors.push(listings.error.message);
  const withFiles = listings.data ?? [];
  if (withFiles.length === PAGE) report.unfinished = true;

  // When each show starts per the catalogue, which keeps the rolling demo shows always ahead.
  const startsAt = new Map<string, number>();
  for (const ids of chunks([...new Set(withFiles.map((l) => l.event_id))])) {
    const events = await admin.from("catalogue_events").select("id, starts_at").in("id", ids);
    if (events.error) return void report.errors.push(events.error.message);
    for (const e of events.data ?? []) if (e.id && e.starts_at) startsAt.set(e.id, new Date(e.starts_at).getTime());
  }
  const over = withFiles.filter((l) => {
    const start = startsAt.get(l.event_id);
    return start !== undefined && isGone(ticketFileGoneAt(start + EVENT_DURATION_H * H), now);
  });

  const busy = new Set<string>();
  for (const ids of chunks(over.map((l) => l.id))) {
    const holding = await admin.from("orders").select("listing_id").in("listing_id", ids).in("escrow_status", HELD);
    if (holding.error) return void report.errors.push(holding.error.message);
    for (const o of holding.data ?? []) if (o.listing_id) busy.add(o.listing_id);
  }
  // The file goes first: a listing still naming a deleted file is retried, a file nobody names would stay.
  for (const batch of chunks(over.filter((l) => !busy.has(l.id)))) {
    const removed = await admin.storage.from("tickets").remove(batch.map((l) => l.ticket_path!));
    if (removed.error) {
      report.errors.push(removed.error.message);
      continue;
    }
    const cleared = await admin.from("listings").update({ ticket_path: null }).in("id", batch.map((l) => l.id));
    if (cleared.error) report.errors.push(cleared.error.message);
    else report.ticketFiles += batch.length;
  }
}

type Claim = { order_id: string; decided_at: string | null; evidence: Json | null; dispute_replies: { id: number; evidence: Json | null }[] | null };

const uploadOf = (v: Json | null) => (v && typeof v === "object" && !Array.isArray(v) ? (v as unknown as DisputeEvidence).upload : undefined);

/** The same record without where the photo was taken; whether that matched the venue stays. */
function withoutPlace(v: Json | null): Json | null {
  const up = uploadOf(v);
  if (!up?.gps) return v;
  const kept = { ...up };
  delete kept.gps;
  return { ...(v as Record<string, Json>), upload: kept as unknown as Json };
}

async function forgetPlaces(admin: Admin, claim: Claim) {
  if (uploadOf(claim.evidence)?.gps) {
    const r = await admin.from("disputes").update({ evidence: withoutPlace(claim.evidence) }).eq("order_id", claim.order_id);
    if (r.error) throw new Error(r.error.message);
  }
  for (const reply of claim.dispute_replies ?? []) {
    if (!uploadOf(reply.evidence)?.gps) continue;
    const r = await admin.from("dispute_replies").update({ evidence: withoutPlace(reply.evidence) }).eq("id", reply.id);
    if (r.error) throw new Error(r.error.message);
  }
}

/** The order folders in the evidence bucket; a folder exists only while it holds a file. */
async function evidenceFolders(admin: Admin): Promise<string[]> {
  const folders: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await admin.storage.from("evidence").list("", { limit: PAGE, offset });
    if (page.error) throw new Error(page.error.message);
    const rows = page.data ?? [];
    folders.push(...rows.filter((f) => !f.id).map((f) => f.name));
    if (rows.length < PAGE) return folders;
  }
}

/**
 * Claim photos: all of an order's a month after its claim was decided, along with where they were
 * taken, and any never attached to a claim or an answer a week after the upload.
 */
async function purgeEvidence(admin: Admin, now: number, deadline: number, report: PurgeReport, scope?: PurgeScope) {
  let folders: string[];
  try {
    folders = scope?.orderIds ?? (await evidenceFolders(admin));
  } catch (e) {
    return void report.errors.push((e as Error).message);
  }
  const claims = new Map<string, Claim>();
  for (const ids of chunks(folders)) {
    const found = await admin.from("disputes").select("order_id, decided_at, evidence, dispute_replies(id, evidence)").in("order_id", ids);
    if (found.error) return void report.errors.push(found.error.message);
    for (const c of (found.data ?? []) as unknown as Claim[]) claims.set(c.order_id, c);
  }

  for (const orderId of folders) {
    if (Date.now() > deadline) return void (report.unfinished = true);
    try {
      const listed = await admin.storage.from("evidence").list(orderId, { limit: PAGE });
      if (listed.error) throw new Error(listed.error.message);
      const files = (listed.data ?? []).filter((f) => f.id).map((f) => ({ path: `${orderId}/${f.name}`, at: f.created_at ? new Date(f.created_at).getTime() : now }));
      if (!files.length) continue;
      const claim = claims.get(orderId);

      if (claim?.decided_at && isGone(evidenceGoneAt(claim.decided_at), now)) {
        // The place goes before the photos: once they are gone, this folder is never looked at again.
        await forgetPlaces(admin, claim);
        const removed = await admin.storage.from("evidence").remove(files.map((f) => f.path));
        if (removed.error) throw new Error(removed.error.message);
        report.evidenceFiles += files.length;
        continue;
      }
      const used = new Set([uploadOf(claim?.evidence ?? null)?.path, ...(claim?.dispute_replies ?? []).map((r) => uploadOf(r.evidence)?.path)]);
      const stray = files.filter((f) => !used.has(f.path) && f.at < now - ORPHAN_UPLOAD_DAYS * DAY);
      if (!stray.length) continue;
      const removed = await admin.storage.from("evidence").remove(stray.map((f) => f.path));
      if (removed.error) throw new Error(removed.error.message);
      report.orphanUploads += stray.length;
    } catch (e) {
      report.errors.push((e as Error).message);
    }
  }
}

export async function purgeExpired(admin: Admin, now: number, budgetMs: number, scope?: PurgeScope): Promise<PurgeReport> {
  const deadline = Date.now() + budgetMs;
  const report: PurgeReport = { ticketFiles: 0, evidenceFiles: 0, orphanUploads: 0, errors: [], unfinished: false };
  await purgeTicketFiles(admin, now, report, scope);
  await purgeEvidence(admin, now, deadline, report, scope);
  return report;
}
