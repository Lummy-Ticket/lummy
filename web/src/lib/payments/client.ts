"use client";

// The checkout page's side of QRIS (docs/09 §6): ask whether it is on, start a hold, read it,
// cancel it or (in test mode) pay it through Xendit's simulator. Every answer comes from the
// server, which checks the buyer each time.
import { useEffect, useState } from "react";
import { getJson } from "@/lib/fetch-json";
import { OrderError } from "@/lib/orders/client";
import type { IntentView, NearOptions, PaymentView, PaymentsConfig, UsdcStart } from "./types";
import type { HeldAsset } from "@/lib/near/held";
import { routeErrorText } from "@/lib/route-errors";

export type { IntentView, NearOptions, PaymentStatus, PaymentView, PaymentsConfig, TypedMessage, UsdcStart } from "./types";

const OFF: PaymentsConfig = { enabled: false, testMode: false, max: 0, usdc: false };

/** Null while asking, and when `active` is false (chain mode, a sample persona). */
export function usePaymentsConfig(active: boolean): PaymentsConfig | null {
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    void getJson<PaymentsConfig>("/api/payments", ctrl.signal, { cache: "no-store" }).then((c) => {
      if (!ctrl.signal.aborted) setConfig(c ?? OFF);
    });
    return () => ctrl.abort();
  }, [active]);
  return active ? config : null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { cache: "no-store", ...init });
  const json = (await r.json().catch(() => ({}))) as { error?: string; error_en?: string };
  if (!r.ok) throw new OrderError(routeErrorText(json, r.status), r.status);
  return json as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const startPayment = (listingId: string, quantity: number) => call<PaymentView>("/api/payments", post({ listingId, quantity }));

export const readPayment = (id: string) => call<PaymentView>(`/api/payments/${encodeURIComponent(id)}`);

export const paymentAction = (id: string, action: "cancel" | "simulate") =>
  call<PaymentView>(`/api/payments/${encodeURIComponent(id)}`, post({ action }));

/** Hold seats on a show paid in USDC, for this wallet: the answer carries what it signs. */
export const startUsdcPayment = (listingId: string, quantity: number, wallet: string) =>
  call<UsdcStart>("/api/payments", post({ listingId, quantity, wallet }));

/** Both signatures back to the server, which locks the money on chain and writes the order. */
export const submitUsdcPayment = (id: string, authSig: string, fundSig: string) =>
  call<{ orderId: string }>(`/api/payments/${encodeURIComponent(id)}/usdc`, post({ authSig, fundSig }));

/** What the NEAR HACKATHON demo can do here. Null while asking, or when the server does not answer. */
export function useNearOptions(active = true) {
  const [options, setOptions] = useState<NearOptions | null>(null);
  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    void getJson<NearOptions>("/api/near/options", ctrl.signal, { cache: "no-store" }).then((o) => {
      if (!ctrl.signal.aborted) setOptions(o);
    });
    return () => ctrl.abort();
  }, [active]);
  return active ? options : null;
}

export type NearQuote = { symbol: string; chainLabel: string; amountIn: string; amountInUsd: string | null; amountOut: string; etaSeconds: number | null };

/** A live quote, which holds nothing. `amount` in micro-USDC. */
export const nearQuote = (originAsset: string, amount: string) => call<NearQuote>("/api/near/quote", post({ originAsset, amount }));

/** What a wallet holds that could pay this much, on the EVM chains NEAR Intents takes. `amount` in micro-USDC. Moves nothing. */
export const nearHeld = (address: string, amount: string) => call<{ held: HeldAsset[] }>("/api/near/held", post({ address, amount }));

/** Hold the seats and get an address to pay, on the NEAR Intents rail. */
export const startIntentPayment = (p: { listingId: string; quantity: number; originAsset: string; refundTo: string; originRefund: string }) =>
  call<IntentView>("/api/payments/intents", post(p));

/** Read a payment on this rail, which also moves it along once the money has arrived. */
export const readIntentPayment = (id: string) => call<IntentView>(`/api/payments/${encodeURIComponent(id)}/intents`);
