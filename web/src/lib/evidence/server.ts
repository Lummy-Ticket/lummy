// A claim photo, from the private bucket to the record a claim or a reply carries. The browser
// uploads straight to storage with a one-off token (so a phone's full-size photo, metadata intact,
// is not cut down to fit a function's request limit), then the server reads the file itself:
// nothing about it is taken from the browser.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DisputeEvidence, EvidenceKind } from "@/lib/mock/types";
import type { Database } from "@/lib/supabase/types";
import { attachedEvidencePaths } from "./attached";
import { ticketPepper } from "@/lib/tickets/server";
import { EVIDENCE_TYPES, EvidenceError, distanceMetres, readEvidence } from "./read";

if (typeof window !== "undefined") throw new Error("lib/evidence/server is server-only");

export type Side = "buyer" | "seller";
/** A venue's grounds, generously: a stadium complex is about a kilometre across. */
const VENUE_RADIUS_M = 1500;
export const EVIDENCE_KINDS: EvidenceKind[] = ["SCANNER_PHOTO", "STAFF_LETTER", "CHAT_LOG", "TICKET_PHOTO"];

/** Where a new upload for this order goes. The random part is what makes the path unguessable. */
export function newEvidencePath(orderId: string, side: Side, type: string) {
  const ext = EVIDENCE_TYPES[type];
  if (!ext) throw new EvidenceError("kirim foto JPEG, PNG, atau WebP");
  return `${orderId}/${side}-${randomUUID()}.${ext}`;
}

/** A path this side of this order was given, and nothing else. */
export const ownsEvidencePath = (path: string, orderId: string, side: Side) =>
  path.startsWith(`${orderId}/${side}-`) && /^[\w-]+\/(buyer|seller)-[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path);

/** How many photos one side may have uploaded to an order without attaching them yet. */
export const MAX_UNATTACHED = 3;

/**
 * Before a new upload link: deletes this side's oldest photos on this order that are on neither the
 * claim nor an answer, keeping the newest MAX_UNATTACHED - 1, so the new one makes at most
 * MAX_UNATTACHED. Asking for links over and over cannot fill the bucket that way (production audit
 * 2 Nov 2026, B3). Attached photos are never touched, and the daily purge still takes any loose one
 * after ORPHAN_UPLOAD_DAYS. Says how many went.
 */
export async function pruneUnattached(admin: SupabaseClient<Database>, orderId: string, side: Side): Promise<number> {
  const [listed, claim] = await Promise.all([
    admin.storage.from("evidence").list(orderId, { limit: 100, search: `${side}-`, sortBy: { column: "created_at", order: "desc" } }),
    admin.from("disputes").select("evidence, dispute_replies(evidence)").eq("order_id", orderId).maybeSingle(),
  ]);
  if (listed.error) throw new Error(listed.error.message);
  if (claim.error) throw new Error(claim.error.message);
  const attached = attachedEvidencePaths(claim.data);
  const loose = (listed.data ?? [])
    .filter((f) => f.id && f.name.startsWith(`${side}-`))
    .map((f) => `${orderId}/${f.name}`)
    .filter((path) => !attached.has(path));
  const extra = loose.slice(MAX_UNATTACHED - 1);
  if (!extra.length) return 0;
  const removed = await admin.storage.from("evidence").remove(extra);
  if (removed.error) throw new Error(removed.error.message);
  return extra.length;
}

export async function evidenceFromUpload(
  admin: SupabaseClient<Database>,
  order: { listing_id: string | null; event_id: string | null },
  path: string,
  kind: EvidenceKind
): Promise<DisputeEvidence> {
  const file = await admin.storage.from("evidence").download(path);
  if (file.error || !file.data) throw new EvidenceError("foto buktinya tidak ditemukan, upload ulang");
  const bytes = new Uint8Array(await file.data.arrayBuffer());

  const pepper = ticketPepper();
  const [read, held, venue] = await Promise.all([
    // Without the pepper no code can be keyed, so the photo is read for its metadata only.
    readEvidence(bytes, pepper ?? "no pepper: codes are not compared"),
    order.listing_id && pepper
      ? admin.from("listing_barcodes").select("barcode_hmac").eq("listing_id", order.listing_id)
      : Promise.resolve({ data: [] as { barcode_hmac: string }[], error: null }),
    order.event_id
      ? admin.from("events").select("venue_lat, venue_lng").eq("id", order.event_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (held.error) throw new Error(held.error.message);
  if (venue.error) throw new Error(venue.error.message);

  const own = new Set((held.data ?? []).map((r) => r.barcode_hmac));
  const shows = own.size ? read.keys.some((k) => own.has(k)) : null;
  const place =
    read.gps && venue.data?.venue_lat != null && venue.data.venue_lng != null
      ? distanceMetres(read.gps, { lat: venue.data.venue_lat, lng: venue.data.venue_lng }) <= VENUE_RADIUS_M
      : null;
  return {
    fileName: `foto-${read.sha256.slice(0, 8)}.${EVIDENCE_TYPES[read.type]}`,
    kind,
    capturedAtISO: read.capturedAtISO ?? undefined,
    atVenue: place,
    showsBarcode: shows,
    upload: {
      path,
      sha256: read.sha256,
      size: read.size,
      type: read.type,
      codesRead: read.keys.length,
      ...(shows === false && read.keys.length > 0 ? { foreignCode: true } : {}),
      ...(read.gps ? { gps: read.gps } : {}),
      ...(read.device ? { device: read.device } : {}),
      ...(read.editedWith ? { editedWith: read.editedWith } : {}),
    },
  };
}
