// Xendit's Payments API (v3, api-version 2024-11-11), only the parts Lummy uses: a one-time QRIS
// payment request that expires, reading it back, cancelling it, and in test mode paying it.
// Checked against the test environment on 8 Oct 2026: a new request answers REQUIRES_ACTION with
// the code in actions[].value (in test mode the literal "some-random-qr-string"), a simulated
// payment reads SUCCEEDED within seconds with latest_payment_id, and cancel answers CANCELED.
// Server only. The secret key never leaves the server and is never logged.
import { timingSafeEqual } from "node:crypto";

if (typeof window !== "undefined") throw new Error("lib/payments/xendit hanya boleh dipakai di server");

const API = "https://api.xendit.co";
const VERSION = "2024-11-11";
/** QRIS takes 1 to 10,000,000 rupiah per payment (Xendit, QRIS channel). */
export const QRIS_MAX = 10_000_000;
/** Xendit's payment request id, the only thing from outside that goes into a URL path here. */
export const PAYMENT_REQUEST_ID = /^pr-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type XenditConfig = { key: string; token: string; testMode: boolean };

/** Null until both the key and the webhook token are set. A test key starts xnd_development_. */
export function xenditConfig(): XenditConfig | null {
  const key = process.env.XENDIT_SECRET_KEY?.trim();
  const token = process.env.XENDIT_WEBHOOK_TOKEN?.trim();
  if (!key || !token) return null;
  const testMode = key.startsWith("xnd_development_");
  if (!testMode && !key.startsWith("xnd_production_")) return null;
  return { key, token, testMode };
}

export type QrisStatus = "ACCEPTING_PAYMENTS" | "REQUIRES_ACTION" | "AUTHORIZED" | "CANCELED" | "EXPIRED" | "SUCCEEDED" | "FAILED";

export type Qris = {
  id: string;
  referenceId: string;
  status: QrisStatus;
  amount: number;
  qrString: string | null;
  latestPaymentId: string | null;
};

export class XenditError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Raw = {
  payment_request_id?: string;
  reference_id?: string;
  status?: QrisStatus;
  request_amount?: number;
  latest_payment_id?: string;
  actions?: { descriptor?: string; value?: unknown }[];
  message?: string;
  error_code?: string;
};

/**
 * One request to Xendit. `retry` asks once more after a dropped connection or a 5xx: on for reads
 * and cancels, which change nothing when repeated (one timed out in testing on 8 Oct 2026), and
 * off for creating or simulating a payment, where a second try could make a second one.
 */
async function call(cfg: XenditConfig, method: "GET" | "POST", path: string, body?: unknown, retry = method === "GET"): Promise<Raw> {
  for (let attempt = 0; ; attempt++) {
    const again = retry && attempt === 0;
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${cfg.key}:`).toString("base64")}`,
          "api-version": VERSION,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch (e) {
      if (again) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw new XenditError(`Xendit tidak terjangkau: ${(e as Error).message}`, 502);
    }
    if (res.status >= 500 && again) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as Raw;
    if (!res.ok) throw new XenditError(data.message ?? data.error_code ?? `Xendit ${res.status}`, res.status);
    return data;
  }
}

function parse(d: Raw): Qris {
  if (!d.payment_request_id || !PAYMENT_REQUEST_ID.test(d.payment_request_id) || !d.status) {
    throw new XenditError("jawaban Xendit tidak dikenal", 502);
  }
  const qr = (d.actions ?? []).find((a) => a.descriptor === "QR_STRING");
  return {
    id: d.payment_request_id,
    referenceId: d.reference_id ?? "",
    status: d.status,
    amount: Number(d.request_amount),
    qrString: typeof qr?.value === "string" ? qr.value : null,
    latestPaymentId: d.latest_payment_id ?? null,
  };
}

const path = (id: string, tail = "") => {
  if (!PAYMENT_REQUEST_ID.test(id)) throw new XenditError("id pembayaran Xendit tidak dikenal", 400);
  return `/v3/payment_requests/${id}${tail}`;
};

/** A one-time QRIS for `amount` rupiah that stops taking money at `expiresAt`. */
export const createQris = (cfg: XenditConfig, p: { referenceId: string; amount: number; expiresAt: Date; description: string }) =>
  call(cfg, "POST", "/v3/payment_requests", {
    reference_id: p.referenceId,
    type: "PAY",
    country: "ID",
    currency: "IDR",
    request_amount: p.amount,
    capture_method: "AUTOMATIC",
    channel_code: "QRIS",
    // Whole seconds, the form the test environment was checked with.
    channel_properties: { expires_at: p.expiresAt.toISOString().replace(/\.\d{3}Z$/, "Z") },
    description: p.description,
  }).then(parse);

export const readQris = (cfg: XenditConfig, id: string) => call(cfg, "GET", path(id)).then(parse);

export const cancelQris = (cfg: XenditConfig, id: string) => call(cfg, "POST", path(id, "/cancel"), undefined, true).then(parse);

/** Test mode only: Xendit pays the request itself and then sends the webhook. */
export async function simulateQris(cfg: XenditConfig, id: string, amount: number) {
  if (!cfg.testMode) throw new XenditError("simulasi cuma ada di mode test", 400);
  await call(cfg, "POST", path(id, "/simulate"), { amount });
}

/** The webhook carries the token from the dashboard in x-callback-token. */
export function callbackTokenMatches(sent: string | null, cfg: XenditConfig) {
  const a = Buffer.from(sent ?? "");
  const b = Buffer.from(cfg.token);
  return a.length === b.length && timingSafeEqual(a, b);
}
