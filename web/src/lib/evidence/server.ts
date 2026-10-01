// A claim photo, from the private bucket to the record a claim or a reply carries. The browser
// uploads straight to storage with a one-off token (so a phone's full-size photo, metadata intact,
// is not cut down to fit a function's request limit), then the server reads the file itself:
// nothing about it is taken from the browser.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DisputeEvidence, EvidenceKind } from "@/lib/mock/types";
import type { Database } from "@/lib/supabase/types";
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
