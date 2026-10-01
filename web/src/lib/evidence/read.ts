// Reads an uploaded claim photo the way an arbiter needs it read: when it was taken and where
// (EXIF), whether an editing app touched it, and every barcode visible in it. Codes are keyed like
// the tickets (lib/tickets/barcode.ts), so a photo can be matched to this order's own barcodes
// without a code ever being stored. What a photo says about itself can be forged, so none of this
// decides a claim on its own: it is what a person weighs.
import { createHash } from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import exifr from "exifr";
import { barcodeKey, decodeImage } from "@/lib/tickets/barcode";

if (typeof window !== "undefined") throw new Error("lib/evidence/read is server-only");

/**
 * What a claim photo may be. HEIC is left out because it cannot be scanned for codes here; asking
 * for these types makes an iPhone send its photo as JPEG.
 */
export const EVIDENCE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/** The private bucket's own limit. */
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const MAX_SIDE_PX = 3000;
/** Indonesia's western time, for a camera that recorded the hour but not its zone. */
const DEFAULT_OFFSET = "+07:00";

/** Editing apps that name themselves in a photo. A phone's own firmware string is not one of them. */
const EDITORS: { name: string; re: RegExp }[] = [
  { name: "Photoshop", re: /photoshop/i },
  { name: "Lightroom", re: /lightroom/i },
  { name: "Snapseed", re: /snapseed/i },
  { name: "PicsArt", re: /picsart/i },
  { name: "Canva", re: /\bcanva\b/i },
  { name: "GIMP", re: /\bgimp\b/i },
  { name: "Pixelmator", re: /pixelmator/i },
  { name: "Meitu", re: /meitu/i },
  { name: "Remini", re: /remini/i },
  { name: "PhotoRoom", re: /photoroom/i },
  { name: "Polarr", re: /polarr/i },
  { name: "VSCO", re: /\bvsco\b/i },
  { name: "Facetune", re: /facetune/i },
  { name: "Adobe Express", re: /adobe express/i },
];

export class EvidenceError extends Error {}

export type EvidenceRead = {
  sha256: string;
  size: number;
  type: string;
  capturedAtISO: string | null;
  gps: { lat: number; lng: number } | null;
  device: string | null;
  editedWith: string | null;
  /** HMAC keys of every code read in the photo; empty when none could be read. */
  keys: string[];
};

/** The type from the bytes themselves, never from what the browser said. */
export function sniffImage(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** "2026:10:01 19:23:11" with "+07:00" (or the default zone) as an ISO instant. */
export function exifTime(value: unknown, offset: unknown): string | null {
  const m = typeof value === "string" ? value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/) : null;
  if (!m) return null;
  const zone = typeof offset === "string" && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : DEFAULT_OFFSET;
  const at = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone}`);
  return Number.isNaN(at.getTime()) || at.getUTCFullYear() < 2000 ? null : at.toISOString();
}

/** Metres between two points, near enough for "at the venue or not". */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

async function codesIn(bytes: Uint8Array, pepper: string) {
  const image = await loadImage(Buffer.from(bytes));
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const codes = await decodeImage({ data: ctx.getImageData(0, 0, width, height).data, width, height });
  return [...new Set(codes.map((c) => barcodeKey(c.bytes, pepper)))];
}

export async function readEvidence(bytes: Uint8Array, pepper: string): Promise<EvidenceRead> {
  if (bytes.length > MAX_EVIDENCE_BYTES) throw new EvidenceError("file lebih dari 10 MB");
  const type = sniffImage(bytes);
  if (!type) throw new EvidenceError("file ini bukan foto JPEG, PNG, atau WebP");
  const buffer = Buffer.from(bytes);

  // Metadata is optional and often missing (screenshots, apps that strip it): its absence is not an error.
  const tags = ((await exifr.parse(buffer, { tiff: true, exif: true, gps: false, reviveValues: false, translateValues: false }).catch(() => null)) ??
    {}) as Record<string, unknown>;
  const gps = (await exifr.gps(buffer).catch(() => null)) as { latitude?: number; longitude?: number } | null;
  const software = typeof tags.Software === "string" ? tags.Software : "";
  const device = [tags.Make, tags.Model].filter((v): v is string => typeof v === "string" && !!v.trim()).join(" ").trim();

  let keys: string[] = [];
  try {
    keys = await codesIn(bytes, pepper);
  } catch {
    // An image the canvas cannot open has no codes to offer; the rest still stands.
  }

  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    type,
    capturedAtISO: exifTime(tags.DateTimeOriginal ?? tags.CreateDate ?? tags.DateTime, tags.OffsetTimeOriginal ?? tags.OffsetTime),
    gps:
      gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude) && !(gps.latitude === 0 && gps.longitude === 0)
        ? { lat: gps.latitude!, lng: gps.longitude! }
        : null,
    device: device ? device.slice(0, 80) : null,
    editedWith: EDITORS.find((e) => e.re.test(software))?.name ?? null,
    keys,
  };
}
