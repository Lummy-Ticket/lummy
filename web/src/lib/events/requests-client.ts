"use client";

// Show requests in the browser: an account's own, or the staff queue, through /api/events/requests
// (the server decides everything). A demo persona's requests live in this browser instead
// (lib/mock/useEventRequests), so these return null for it.
import { useCallback, useEffect, useState } from "react";
import type { EventRequest } from "@/lib/mock/useEventRequests";
import type { TransferPolicy } from "@/lib/mock/types";
import type { ApprovalTier } from "./requests";

export class RequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new RequestError(res.status, (body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

export const fileEventRequest = (input: Record<string, unknown>) =>
  call<{ request: EventRequest }>("/api/events/requests", { method: "POST", body: JSON.stringify(input) }).then((r) => r.request);

export const decideEventRequest = (
  id: string,
  decision: { action: "approve"; tiers: ApprovalTier[]; transferPolicy: TransferPolicy | null; note?: string } | { action: "reject"; note: string }
) => call<{ request: EventRequest; eventId?: string }>(`/api/events/requests/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(decision) });

/** An account's own requests, or with `queue` the staff queue. Null scope: nothing to load. */
export function useAccountRequests(scope: "mine" | "queue" | null) {
  const [loaded, setLoaded] = useState<{ scope: string; requests: EventRequest[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    if (!scope) return;
    let alive = true;
    call<{ requests: EventRequest[] }>(`/api/events/requests${scope === "queue" ? "?queue=1" : ""}`).then(
      (r) => {
        if (!alive) return;
        setLoaded({ scope, requests: r.requests });
        setError(null);
      },
      (e) => alive && setError(e instanceof Error ? e.message : String(e))
    );
    return () => {
      alive = false;
    };
  }, [scope, nonce]);
  return { requests: scope && loaded?.scope === scope ? loaded.requests : null, error, refresh };
}
