"use client";

// Listings of a signed-in account, in the browser. Reads go straight to Supabase under RLS: a
// seller sees their own listings in every state, staff see the review queue. Writes go through
// /api/listings, which decides status, price band and trust signals on the server.
import { useCallback, useEffect, useState } from "react";
import type { SellerListing } from "@/lib/mock/useSellerListings";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { SampleTicket } from "./rules";

/** Whose listings: one seller's (withdrawn ones left out), or everything waiting for review. */
export type ListingScope = { seller: string } | { review: true };

const COLUMNS =
  "id, event_id, tier_id, ask_price, face_value, quantity, status, views, gate_ktp, late_listing, autofilled, forgery_score, pdf_suspicious, barcode_duplicate, created_at, events(title), tiers(name)";

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
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new ListingError(json.error ?? `HTTP ${r.status}`, r.status);
  return json as T;
}

export const createListing = (input: {
  eventId: string;
  tierId: string;
  askPrice: number;
  quantity: number;
  splittable: boolean;
  gateKtp: boolean;
  sample: SampleTicket;
}) => post<{ id: string; status: "active" | "review" }>("/api/listings", input);

export const listingAction = (id: string, action: "approve" | "reject" | "withdraw") =>
  post<{ ok: true; status: string }>(`/api/listings/${encodeURIComponent(id)}`, { action });
