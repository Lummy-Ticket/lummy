"use client";

// Listings of a signed-in account, in the browser. Reads go straight to Supabase under RLS: a
// seller sees their own listings in every state, staff see the review queue. Writes go through
// /api/listings, which decides status, price band and trust signals on the server.
import { useCallback, useEffect, useState } from "react";
import type { SellerListing } from "@/lib/mock/useSellerListings";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Provider } from "@/lib/tickets/ai";
import type { ListingChecks, TicketCheck, TicketFacts } from "@/lib/tickets/checks";
import type { SampleTicket } from "./rules";

/** Whose listings: one seller's (withdrawn ones left out), or everything waiting for review. */
export type ListingScope = { seller: string } | { review: true };

const COLUMNS =
  "id, event_id, tier_id, ask_price, face_value, quantity, status, views, gate_ktp, late_listing, autofilled, forgery_score, pdf_suspicious, barcode_duplicate, checks, created_at, events(title), tiers(name)";

type Row = {
  id: string;
  event_id: string;
  ask_price: number;
  face_value: number;
  quantity: number;
  status: string;
  views: number;
  gate_ktp: boolean;
  late_listing: boolean;
  autofilled: boolean;
  forgery_score: number;
  pdf_suspicious: boolean;
  barcode_duplicate: boolean;
  checks: ListingChecks | null;
  created_at: string;
  events: { title: string } | null;
  tiers: { name: string } | null;
};

const fromRow = (r: Row): SellerListing => ({
  id: r.id,
  eventId: r.event_id,
  eventTitle: r.events?.title ?? r.event_id,
  tierName: r.tiers?.name ?? "",
  askPrice: r.ask_price,
  faceValue: r.face_value,
  quantity: r.quantity,
  status: r.status as SellerListing["status"],
  views: r.views,
  ai: { autofilled: r.autofilled, forgeryScore: r.forgery_score, barcodeDuplicate: r.barcode_duplicate, pdfSuspicious: r.pdf_suspicious },
  createdAtISO: r.created_at,
  lateListing: r.late_listing,
  gateKtp: r.gate_ktp,
  checks: r.checks,
});

/** Null while loading, and when `scope` is null (a sample persona, whose listings live in this browser). */
export function useAccountListings(scope: ListingScope | null) {
  const key = scope ? JSON.stringify(scope) : null;
  const [loaded, setLoaded] = useState<{ key: string; listings: SellerListing[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!key || !sb) return;
    const s = JSON.parse(key) as ListingScope;
    let alive = true;
    const q =
      "seller" in s
        ? sb.from("listings").select(COLUMNS).eq("seller_id", s.seller).neq("status", "cancelled").order("created_at", { ascending: false })
        : sb.from("listings").select(COLUMNS).eq("status", "review").order("created_at");
    void q.then(({ data, error: e }) => {
      if (!alive) return;
      setError(e?.message ?? null);
      if (!e) setLoaded({ key, listings: ((data ?? []) as unknown as Row[]).map(fromRow) });
    });
    return () => {
      alive = false;
    };
  }, [key, nonce]);

  useEffect(() => {
    if (!key) return;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [key, refresh]);

  return { listings: key && loaded?.key === key ? loaded.listings : null, error, refresh };
}

/** An error from the listing routes, with the HTTP status. */
export class ListingError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const form = body instanceof FormData;
  const r = await fetch(path, {
    method: "POST",
    // A form sets its own multipart boundary.
    headers: form ? undefined : { "content-type": "application/json" },
    body: form ? body : JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new ListingError(json.error ?? `HTTP ${r.status}`, r.status);
  return json as T;
}

type ListingInput = { eventId: string; tierId: string; askPrice: number; quantity: number; splittable: boolean; gateKtp: boolean };

/** The holder's name goes with a real PDF only so the server's AI step can take it out of the text. */
type TicketInput = { ticket: File; holder?: string };

/** From a real ticket PDF, which the server checks again, or from one of the sample tickets. */
export function createListing(input: ListingInput & (TicketInput | { sample: SampleTicket })) {
  if (!("ticket" in input)) return post<{ id: string; status: "active" | "review" }>("/api/listings", input);
  const form = new FormData();
  for (const [k, v] of Object.entries(input)) form.append(k, v instanceof File ? v : String(v));
  return post<{ id: string; status: "active" | "review" }>("/api/listings", form);
}

/** Reads the PDF on the server and says what publishing it would meet. Nothing is stored. */
export function checkTicketFile(file: File) {
  const form = new FormData();
  form.append("ticket", file);
  return post<TicketCheck>("/api/tickets/check", form);
}

/** What the AI step read off a ticket for the sell form, or why it read nothing (docs/09 §5.1). */
export type TicketFill =
  | { outcome: "filled"; facts: TicketFacts; eventId: string | null }
  | { outcome: "off" | "no_shows" | "no_text" | "no_ticket_page" | "personal_data_left" | "busy" | "failed" | "bad_answer" };

/** Reads the PDF on the server for the form: the show, category, date, seat and printed price. */
export function fillFromTicket(file: File, holder: string) {
  const form = new FormData();
  form.append("ticket", file);
  if (holder.trim()) form.append("holder", holder.trim());
  return post<TicketFill>("/api/tickets/extract", form);
}

/** How the sell page names the AI that reads a ticket, so the seller is told who reads it. */
export const FILL_BY: Record<Provider, { en: string; id: string }> = {
  claude: { en: "Claude (Anthropic's AI)", id: "Claude (AI dari Anthropic)" },
  gemini: { en: "Gemini (Google's AI)", id: "Gemini (AI dari Google)" },
  fake: { en: "A test stand-in on this server", id: "Model tiruan untuk tes di server ini" },
};

/**
 * Which AI fills the form in from a ticket on this deployment. Null until it has answered; false
 * when none does, or when not asked.
 */
export function useTicketFill(ask: boolean) {
  const [by, setBy] = useState<Provider | false | null>(null);
  useEffect(() => {
    if (!ask) return;
    let alive = true;
    void fetch("/api/tickets/extract")
      .then((r) => (r.ok ? (r.json() as Promise<{ by?: string | null }>) : {}))
      .catch(() => ({}))
      .then((j: { by?: string | null }) => alive && setBy(j.by && j.by in FILL_BY ? (j.by as Provider) : false));
    return () => {
      alive = false;
    };
  }, [ask]);
  return ask ? by : false;
}

/** Whether this deployment checks real PDFs. Null until it has answered; false when not asked. */
export function useTicketReader(ask: boolean) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!ask) return;
    let alive = true;
    void fetch("/api/tickets/check")
      .then((r) => (r.ok ? (r.json() as Promise<{ available?: boolean }>) : { available: false }))
      .catch(() => ({ available: false }))
      .then((j) => alive && setAvailable(!!j.available));
    return () => {
      alive = false;
    };
  }, [ask]);
  return ask ? available : false;
}

export const listingAction = (id: string, action: "approve" | "reject" | "withdraw") =>
  post<{ ok: true; status: string }>(`/api/listings/${encodeURIComponent(id)}`, { action });
