"use client";

// Alerts of a signed-in account, kept on the server (api/alerts), where the emails about new
// tickets are sent from. Used once emails are live (lib/features.ts, `emails`); a sample persona,
// and every visitor before then, keeps alerts in this browser (lib/mock/useAlerts). Alerts kept in a
// browser before the flag are not carried over: they were chosen under "nothing is sent yet", so an
// account starts empty and follows again, rather than getting email it never asked for.
import { useCallback, useEffect, useState } from "react";
import { getJson } from "@/lib/fetch-json";
import type { AlertSub } from "@/lib/mock/useAlerts";

async function post<T>(body: unknown): Promise<T> {
  const r = await fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
  return json as T;
}

/** `subs` is null while loading, when the read failed (`failed`), and whenever `on` is false. */
export function useAccountAlerts(on: boolean) {
  const [subs, setSubs] = useState<AlertSub[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!on) return;
    const ctrl = new AbortController();
    void getJson<{ alerts: AlertSub[] }>("/api/alerts", ctrl.signal, { cache: "no-store" }).then((json) => {
      if (ctrl.signal.aborted) return;
      if (json?.alerts) {
        setSubs(json.alerts);
        setFailed(false);
      } else setFailed(true);
    });
    return () => ctrl.abort();
  }, [on]);

  const subscribe = useCallback(async (input: { eventId: string; tierId?: string }) => {
    const { alert } = await post<{ alert: AlertSub }>({ action: "subscribe", ...input });
    setSubs((s) => [alert, ...(s ?? []).filter((x) => x.id !== alert.id)]);
  }, []);

  const unsubscribe = useCallback(async (id: string) => {
    await post({ action: "unsubscribe", id });
    setSubs((s) => (s ?? []).filter((x) => x.id !== id));
  }, []);

  return { subs: on ? subs : null, failed: on && failed && subs === null, subscribe, unsubscribe };
}
