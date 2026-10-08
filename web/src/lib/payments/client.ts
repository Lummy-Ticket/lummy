"use client";

// The checkout page's side of QRIS (docs/09 §6): ask whether it is on, start a hold, read it,
// cancel it or (in test mode) pay it through Xendit's simulator. Every answer comes from the
// server, which checks the buyer each time.
import { useEffect, useState } from "react";
import { OrderError } from "@/lib/orders/client";
import type { PaymentView, PaymentsConfig } from "./types";

export type { PaymentStatus, PaymentView, PaymentsConfig } from "./types";

const OFF: PaymentsConfig = { enabled: false, testMode: false, max: 0 };

/** Null while asking, and when `active` is false (chain mode, a sample persona). */
export function usePaymentsConfig(active: boolean): PaymentsConfig | null {
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    fetch("/api/payments", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<PaymentsConfig>) : OFF))
      .then((c) => alive && setConfig(c))
      .catch(() => alive && setConfig(OFF));
    return () => {
      alive = false;
    };
  }, [active]);
  return active ? config : null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { cache: "no-store", ...init });
  const json = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new OrderError(json.error ?? `HTTP ${r.status}`, r.status);
  return json as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const startPayment = (listingId: string, quantity: number) => call<PaymentView>("/api/payments", post({ listingId, quantity }));

export const readPayment = (id: string) => call<PaymentView>(`/api/payments/${encodeURIComponent(id)}`);

export const paymentAction = (id: string, action: "cancel" | "simulate") =>
  call<PaymentView>(`/api/payments/${encodeURIComponent(id)}`, post({ action }));
