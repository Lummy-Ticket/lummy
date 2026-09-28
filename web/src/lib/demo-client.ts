"use client";

import { useEffect, useState } from "react";
import { demoPrefs } from "@/lib/chain/client";
import { useUser } from "@/lib/mock";
import type { Role } from "@/lib/mock/types";

/** Whether this server can open the demo accounts, and whether it wants the demo key. */
export type DemoAccountsInfo = { available: boolean; mode: "off" | "open" | "key" };

let infoPromise: Promise<DemoAccountsInfo> | null = null;

export function useDemoAccounts() {
  const [info, setInfo] = useState<DemoAccountsInfo | null>(null);
  useEffect(() => {
    let alive = true;
    infoPromise ??= fetch("/api/demo/session")
      .then((r) => r.json() as Promise<DemoAccountsInfo>)
      .catch(() => ({ available: false, mode: "off" as const }));
    void infoPromise.then((i) => alive && setInfo(i));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

type DemoSession = { id: string; email: string; name: string; staff: boolean };

/**
 * Puts the catalogue and the demo accounts back where a presentation starts. Escrows the contract
 * would not close keep their orders; the count comes back so the presenter knows.
 */
export async function resetDemoAccounts(): Promise<{ ok: true; escrowsKept: number } | { ok: false; error: string }> {
  const key = demoPrefs.key();
  try {
    const r = await fetch("/api/demo/reset", { method: "POST", headers: key ? { "x-demo-key": key } : {} });
    const json = (await r.json().catch(() => ({}))) as { error?: string; escrowsKept?: number };
    if (!r.ok) return { ok: false, error: json.error ?? `HTTP ${r.status}` };
    return { ok: true, escrowsKept: json.escrowsKept ?? 0 };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Signs this browser in to a demo account and records the picked view (buyer, seller or admin),
 * which AuthSync keeps once it sees the same account. The caller reloads so the new session
 * cookies are picked up.
 */
export async function openDemoAccount(persona: Role): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = demoPrefs.key();
  try {
    const r = await fetch("/api/demo/session", {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-demo-key": key } : {}) },
      body: JSON.stringify({ persona }),
    });
    const json = (await r.json().catch(() => ({}))) as { error?: string; user?: DemoSession };
    if (!r.ok || !json.user) return { ok: false, error: json.error ?? `HTTP ${r.status}` };
    useUser.getState().setAccount({ ...json.user, role: persona, account: true });
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}
