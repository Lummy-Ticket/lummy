// A show that is not in the catalogue yet, requested by a seller who has a ticket for it (tasks
// 11.5). Shared by the Sell page, the admin queue and the routes, so what the page accepts is what
// the server accepts. The request carries only hints for staff (what the seller read or typed); the
// ticket itself is checked when the seller lists it, after the show is approved, so no trust signal
// ever comes from the browser (supabase/migrations rls, event_requests).
import type { Category, Currency, TransferPolicy } from "@/lib/mock/types";
import type { EventRequest } from "@/lib/mock/useEventRequests";

export const REQUEST_CATEGORIES: Category[] = ["Music", "Sports", "Theater", "Arts", "Technology", "Education", "Food", "Movies"];

/**
 * Where a show can be: Indonesia pays in rupiah (QRIS), a show abroad in test USDC (docs/04). The
 * seller types the start in local time, read with the main city's offset (Jakarta for Indonesia,
 * Sydney's summer time for Australia); staff correct the hour on approval if it differs.
 */
export const REQUEST_COUNTRIES: { code: string; en: string; id: string; utc: string }[] = [
  { code: "ID", en: "Indonesia", id: "Indonesia", utc: "+07:00" },
  { code: "SG", en: "Singapore", id: "Singapura", utc: "+08:00" },
  { code: "MY", en: "Malaysia", id: "Malaysia", utc: "+08:00" },
  { code: "TH", en: "Thailand", id: "Thailand", utc: "+07:00" },
  { code: "PH", en: "Philippines", id: "Filipina", utc: "+08:00" },
  { code: "JP", en: "Japan", id: "Jepang", utc: "+09:00" },
  { code: "KR", en: "South Korea", id: "Korea Selatan", utc: "+09:00" },
  { code: "IN", en: "India", id: "India", utc: "+05:30" },
  { code: "AE", en: "United Arab Emirates", id: "Uni Emirat Arab", utc: "+04:00" },
  { code: "AU", en: "Australia", id: "Australia", utc: "+11:00" },
];

/** The ISO start of a show from the date and local time a seller typed. */
export const localStart = (date: string, time: string, country: string) =>
  date ? `${date}T${time || "19:00"}:00${REQUEST_COUNTRIES.find((c) => c.code === country)?.utc ?? "+07:00"}` : "";

export const currencyOf = (country: string): Currency => (country === "ID" ? "IDR" : "USDC");

/** At most this many requests waiting per seller, so one account cannot flood the queue. */
export const MAX_PENDING_PER_SELLER = 3;
const H = 3_600_000;
const MAX_AHEAD_MS = 2 * 365 * 24 * H;

export interface RequestInput {
  title: string;
  startsAt: string;
  venue: string;
  city: string;
  country: string;
  category: Category;
  organizerRef: string;
  /** The category on the seller's own ticket and its printed price, in rupiah or US dollars. */
  pdfTier: string;
  printedPrice: number | null;
  note: string;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** An official page the staff can open: https only, no credentials, nothing local. */
export function officialUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (!u.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type RequestCheck = { ok: true; value: RequestInput } | { ok: false; error: { en: string; id: string } };

/** The rules both sides apply. `now` is passed in so the page and the server agree on it. */
export function checkRequest(body: Record<string, unknown>, now: number = Date.now()): RequestCheck {
  const bad = (en: string, id: string): RequestCheck => ({ ok: false, error: { en, id } });
  const title = text(body.title, 120);
  if (title.length < 3) return bad("Give the show's name as the organiser writes it.", "Tulis nama acaranya seperti yang ditulis penyelenggara.");
  const start = Date.parse(typeof body.startsAt === "string" ? body.startsAt : "");
  if (!Number.isFinite(start)) return bad("Give the date and time of the show.", "Isi tanggal dan jam acaranya.");
  if (start < now + 2 * H) return bad("The show has to be still to come.", "Acaranya harus belum berlangsung.");
  if (start > now + MAX_AHEAD_MS) return bad("That date is more than two years away.", "Tanggal itu lebih dari dua tahun lagi.");
  const venue = text(body.venue, 80);
  const city = text(body.city, 60);
  if (venue.length < 2 || city.length < 2) return bad("Give the venue and the city.", "Isi tempat dan kotanya.");
  const country = text(body.country, 2).toUpperCase();
  if (!REQUEST_COUNTRIES.some((c) => c.code === country)) return bad("Pick the country.", "Pilih negaranya.");
  const category = REQUEST_CATEGORIES.find((c) => c === body.category);
  if (!category) return bad("Pick a category.", "Pilih kategorinya.");
  const organizerRef = officialUrl(typeof body.organizerRef === "string" ? body.organizerRef : "");
  if (!organizerRef) {
    return bad(
      "Paste the link to the organiser's official page (https://...): their site, ticketing page or Instagram post.",
      "Tempel link halaman resmi penyelenggara (https://...): situsnya, halaman tiketnya, atau postingan Instagram-nya."
    );
  }
  const pdfTier = text(body.pdfTier, 60);
  const priceRaw = typeof body.printedPrice === "number" ? body.printedPrice : body.printedPrice === null || body.printedPrice === "" || body.printedPrice === undefined ? null : Number(body.printedPrice);
  if (priceRaw !== null && (!Number.isFinite(priceRaw) || priceRaw <= 0 || priceRaw > 1e9)) return bad("The printed price is not a price.", "Harga tercetaknya bukan harga yang valid.");
  const note = text(body.note, 500);
  return { ok: true, value: { title, startsAt: new Date(start).toISOString(), venue, city, country, category, organizerRef, pdfTier, printedPrice: priceRaw, note } };
}

/** The seller's category with its printed price, in the show's own unit (rupiah, or micro-USDC). */
export function faceValuesOf(input: RequestInput): { tier: string; value: number }[] {
  if (!input.pdfTier || !input.printedPrice) return [];
  const value = currencyOf(input.country) === "USDC" ? Math.round(input.printedPrice * 1_000_000) : Math.round(input.printedPrice);
  return [{ tier: input.pdfTier, value }];
}

export interface ApprovalTier {
  name: string;
  /** In the show's display unit: rupiah, or US dollars for a show paid in USDC. */
  faceValue: number;
}

/** What approving may set on the new show: never `no_resale`, since such a request is rejected. */
export const APPROVABLE_POLICIES: (TransferPolicy | null)[] = [null, "open", "letter", "id_match"];

export function checkTiers(raw: unknown): { ok: true; value: ApprovalTier[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "isi minimal satu kategori dengan harga resminya" };
  if (raw.length > 12) return { ok: false, error: "paling banyak 12 kategori" };
  const tiers: ApprovalTier[] = [];
  for (const r of raw) {
    const name = text((r as { name?: unknown })?.name, 60);
    const faceValue = Number((r as { faceValue?: unknown })?.faceValue);
    if (name.length < 1 || !Number.isFinite(faceValue) || faceValue <= 0 || faceValue > 1e9) return { ok: false, error: "tiap kategori butuh nama dan harga resmi" };
    if (tiers.some((t) => t.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: `kategori ${name} tertulis dua kali` };
    tiers.push({ name, faceValue });
  }
  return { ok: true, value: tiers };
}

/** A readable, stable id for the new show: its name and its date. */
export function eventIdFor(title: string, startsAt: string) {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `ev-${slug || "show"}-${startsAt.slice(0, 10).replaceAll("-", "")}`;
}

/** The database row as the pages read it. */
export interface RequestRow {
  id: string;
  submitter_name: string;
  title: string;
  starts_at: string;
  venue: string;
  city: string;
  country: string;
  currency: string;
  category: string;
  face_values: unknown;
  pdf_tier: string;
  organizer_ref: string;
  note: string;
  forgery_score: number;
  pdf_suspicious: boolean;
  ticket_checked: boolean;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
  event_id: string | null;
}

export const REQUEST_SELECT =
  "id, submitter_name, title, starts_at, venue, city, country, currency, category, face_values, pdf_tier, organizer_ref, note, forgery_score, pdf_suspicious, ticket_checked, status, review_note, created_at, event_id";

export function requestFromRow(r: RequestRow): EventRequest {
  const faceValues = Array.isArray(r.face_values)
    ? (r.face_values as { tier?: unknown; value?: unknown }[]).flatMap((f) => (typeof f.tier === "string" && typeof f.value === "number" ? [{ tier: f.tier, value: f.value }] : []))
    : [];
  return {
    id: r.id,
    submittedBy: r.submitter_name,
    title: r.title,
    dateISO: r.starts_at,
    venue: r.venue,
    city: r.city,
    country: r.country,
    currency: r.currency === "USDC" ? "USDC" : "IDR",
    category: (REQUEST_CATEGORIES.find((c) => c === r.category) ?? "Music") as Category,
    faceValues,
    pdfTier: r.pdf_tier,
    organizerRef: r.organizer_ref,
    note: r.note || undefined,
    forgeryScore: r.forgery_score,
    pdfSuspicious: r.pdf_suspicious,
    ticketChecked: r.ticket_checked,
    status: r.status,
    reviewNote: r.review_note ?? undefined,
    createdAtISO: r.created_at,
    eventId: r.event_id ?? undefined,
  };
}
