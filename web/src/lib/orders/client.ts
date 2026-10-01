"use client";

// Orders of a signed-in account, in the browser. Reads go straight to Supabase under RLS, so a
// visitor only ever receives rows they are a party to (or every row, for staff). Writes go
// through /api/orders, which checks each one on the server.
import { useCallback, useEffect, useState } from "react";
import { demoPrefs } from "@/lib/chain/client";
import type { DisputeEvidence, DisputeReason, EvidenceKind, Order, Remedy } from "@/lib/mock/types";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { HELD, ORDER_SELECT, orderFromRow, type OrderRow } from "./map";

/** Which orders to read: bought by, sold by, one by id, or the open claims (staff). */
export type OrderScope = { buyer: string } | { seller: string } | { id: string } | { openClaims: true };

/**
 * Null while loading, and when `scope` is null (a sample persona, whose orders live in this
 * browser instead). Read again when the tab regains focus, so a claim answered in another window
 * shows up without a reload.
 */
export function useAccountOrders(scope: OrderScope | null) {
  const key = scope ? JSON.stringify(scope) : null;
  const [loaded, setLoaded] = useState<{ key: string; orders: Order[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!key || !sb) return;
    const s = JSON.parse(key) as OrderScope;
    let alive = true;
    let q = sb.from("orders").select(ORDER_SELECT).order("created_at", { ascending: false });
    if ("buyer" in s) q = q.eq("buyer_id", s.buyer);
    else if ("seller" in s) q = q.eq("seller_id", s.seller);
    else if ("id" in s) q = q.eq("id", s.id);
    else q = q.eq("disputed", true).in("escrow_status", HELD);
    void q.then(({ data, error: e }) => {
      if (!alive) return;
      setError(e?.message ?? null);
      if (!e) setLoaded({ key, orders: ((data ?? []) as unknown as OrderRow[]).map(orderFromRow) });
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

  return { orders: key && loaded?.key === key ? loaded.orders : null, error, refresh };
}

/** An error from the order routes, with the HTTP status so callers can tell "not yet" from "broken". */
export class OrderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function send<T>(path: string, body: unknown, withKey = false): Promise<T> {
  const key = withKey ? demoPrefs.key() : "";
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-demo-key": key } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new OrderError(json.error ?? `HTTP ${r.status}`, r.status);
  return json as T;
}

/** Buys with the signed-in account. Chain mode and the "show is over" switch need the demo key. */
export const placeOrder = (input: { listingId: string; quantity: number; chain: boolean; demoEnded: boolean }) =>
  send<{ id: string }>("/api/orders", input, input.chain || input.demoEnded);

export type OrderAction =
  | { action: "docs"; which: "letter" | "sellerId" }
  | { action: "dispute"; reason: DisputeReason; note: string; evidence?: string; evidencePath?: string; kind?: EvidenceKind }
  | { action: "reply"; note: string; evidence?: string; evidencePath?: string; kind?: EvidenceKind }
  | { action: "verdict"; remedy: Remedy }
  | { action: "settle" };

export const orderAction = (id: string, input: OrderAction) =>
  send<{ ok: true; tx?: string; withdrawals?: string[] }>(`/api/orders/${encodeURIComponent(id)}`, input);

/**
 * A claim photo: the server hands out a one-off token, the browser puts the original file straight
 * into the private bucket (metadata intact, no request-size limit in the way), and the server then
 * reads it itself. Returns what it read, to show before anything is filed; filing sends the path.
 */
export async function uploadEvidence(orderId: string, file: File, kind?: EvidenceKind): Promise<DisputeEvidence> {
  const path = `/api/orders/${encodeURIComponent(orderId)}`;
  const intent = await send<{ path: string; token: string }>(path, { action: "evidence-upload", type: file.type, size: file.size });
  const sb = supabaseBrowser();
  if (!sb) throw new OrderError("database belum tersambung", 503);
  const up = await sb.storage.from("evidence").uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
  if (up.error) throw new OrderError(up.error.message, 500);
  const read = await send<{ evidence: DisputeEvidence }>(path, { action: "evidence-read", evidencePath: intent.path, kind });
  return read.evidence;
}

/** Opens a claim photo for the parties and staff (a one-minute signed link behind the route). */
export const evidenceHref = (orderId: string, side: "buyer" | "seller") => `/api/orders/${encodeURIComponent(orderId)}/evidence?side=${side}`;
