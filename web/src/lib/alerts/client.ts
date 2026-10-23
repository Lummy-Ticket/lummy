"use client";

// Alerts of a signed-in account, kept on the server (api/alerts), where the emails about new
// tickets are sent from. Used once emails are live (lib/features.ts, `emails`); a sample persona,
// and every visitor before then, keeps alerts in this browser (lib/mock/useAlerts).
import { useCallback, useEffect, useState } from "react";
import type { AlertSub } from "@/lib/mock/useAlerts";

async function post<T>(body: unknown): Promise<T> {
  const r = await fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
  return json as T;
}

/** Null while loading, and whenever `on` is false. */
export function useAccountAlerts(on: boolean) {
  const [subs, setSubs] = useState<AlertSub[] | null>(null);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    void fetch("/api/alerts", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ alerts: AlertSub[] }>) : null))
      .then((json) => {
        if (alive && json) setSubs(json.alerts);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [on]);

  const subscribe = useCallback(async (input: { eventId: string; tierId?: string }) => {
    const { alert } = await post<{ alert: AlertSub }>({ action: "subscribe", ...input });
    setSubs((s) => [alert, ...(s ?? []).filter((x) => x.id !== alert.id)]);
  }, []);

  const unsubscribe = useCallback(async (id: string) => {
    await post({ action: "unsubscribe", id });
    setSubs((s) => (s ?? []).filter((x) => x.id !== id));
  }, []);

  return { subs: on ? subs : null, subscribe, unsubscribe };
}
