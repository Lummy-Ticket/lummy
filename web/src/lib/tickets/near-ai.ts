// NEAR AI Cloud (docs.near.ai): the ticket read of lib/tickets/ai.ts on a model that runs inside a
// Trusted Execution Environment, with a receipt anyone can check. The model only pre-fills and
// cross-checks, as it does with every provider, and what it reads is the text the cleaner has already
// taken names, numbers and codes out of.
//
// What this server checks itself: that the signature recovers to the address the receipt names, that
// the signed text is exactly this model and the hashes of the exact bytes sent and received, and that
// the signer is the key in the model's current attestation report. What it does not check is the
// hardware evidence in that report (Intel TDX, NVIDIA). NEAR's Verification Center does that in the
// reader's own browser, from the link verificationUrl builds, so the claim stays "hardware-isolated
// and attested, and you can check it yourself".
import { createHash, randomBytes } from "node:crypto";
import { getAddress, recoverMessageAddress, type Hex } from "viem";

if (typeof window !== "undefined") throw new Error("lib/tickets/near-ai is server-only");

export const NEAR_AI_URL = "https://cloud-api.near.ai/v1";
/**
 * Confidential TEE with structured output, chosen on 9 Nov 2026 by `npm run ai:eval -- --provider near`
 * on the 33 made-up tickets: right on 29, every field but the show's title right on all of them (the
 * title came back empty on four, never invented), median 2.8 s, about Rp3 a ticket. GLM-5.3-Flash and
 * Qwen3.6-35B did worse, and thinking made every model slower and no more accurate (docs/config/08-near.md).
 */
export const DEFAULT_NEAR_MODEL = "Qwen/Qwen3.8-27B";
const VERIFY_URL = "https://cloud.near.ai/verify";

const SIGNATURE_TRIES = 4;
const SIGNATURE_WAIT_MS = 700;
const REPORT_TTL_MS = 10 * 60_000;

export type TeeReceipt = {
  completionId: string;
  model: string;
  /** provider_tee binds the reply to the model's TEE; gateway only to NEAR's gateway. */
  signatureKind: string | null;
  signingAlgo: string | null;
  signingAddress: string | null;
  signedText: string | null;
  signature: string | null;
  /** SHA-256 of the exact bytes sent and received. */
  requestHash: string;
  responseHash: string;
  /** The signature and the signed text check out, for a provider_tee signature. */
  verified: boolean;
  /** The signer is the key named in the model's attestation report, read with this call. */
  attested: boolean;
  /** Why it is not verified. */
  problem?: string;
  verifiedAt: string;
};

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

type Report = { signers: Set<string>; at: number };
const reports = new Map<string, Report>();

/** The signing addresses in the model's attestation report. No key needed. Null when it cannot be read. */
async function attestedSigners(model: string): Promise<Set<string> | null> {
  const cached = reports.get(model);
  if (cached && Date.now() - cached.at < REPORT_TTL_MS) return cached.signers;
  const nonce = randomBytes(32).toString("hex");
  const url = new URL(`${NEAR_AI_URL}/attestation/report`);
  url.search = new URLSearchParams({ model, provider: "near", include_tls_fingerprint: "false", signing_algo: "ecdsa", nonce }).toString();
  try {
    const res = await fetch(url, { headers: { accept: "application/json", "x-no-aliasing": "true" }, signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { model_attestations?: { signing_address?: string; signing_algo?: string; request_nonce?: string }[] };
    const fresh = (body.model_attestations ?? []).filter((a) => a.request_nonce === nonce && a.signing_algo === "ecdsa" && a.signing_address);
    if (!fresh.length) return null;
    const signers = new Set(fresh.map((a) => a.signing_address!.toLowerCase()));
    reports.set(model, { signers, at: Date.now() });
    return signers;
  } catch {
    return null;
  }
}

/** The signature and the text it covers, for one receipt. Pure, so anyone can rerun it offline. */
export async function checkReceipt(r: Pick<TeeReceipt, "model" | "requestHash" | "responseHash" | "signedText" | "signature" | "signingAddress" | "signingAlgo" | "signatureKind">): Promise<{ ok: boolean; problem?: string }> {
  if (r.signatureKind !== "provider_tee") return { ok: false, problem: `signed by ${r.signatureKind ?? "nobody"}, not by the model's TEE` };
  if (r.signingAlgo !== "ecdsa" || !r.signature || !r.signingAddress) return { ok: false, problem: "no ECDSA signature" };
  if (r.signedText !== `${r.model}:${r.requestHash}:${r.responseHash}`) return { ok: false, problem: "the signed text is not this model and these bytes" };
  try {
    const signer = await recoverMessageAddress({ message: r.signedText, signature: r.signature as Hex });
    return getAddress(signer) === getAddress(r.signingAddress) ? { ok: true } : { ok: false, problem: "the signature is from another key" };
  } catch {
    return { ok: false, problem: "the signature cannot be read" };
  }
}

/** NEAR's own public page: it checks this reply's signature and the model's hardware evidence in the reader's browser. */
export function verificationUrl(r: Pick<TeeReceipt, "completionId" | "model" | "signatureKind" | "signingAlgo" | "signingAddress" | "signedText" | "signature" | "verifiedAt">) {
  const receipt = {
    completionId: r.completionId,
    model: r.model,
    signatureKind: r.signatureKind,
    signingAlgo: r.signingAlgo,
    signingAddress: r.signingAddress,
    signedText: r.signedText,
    signature: r.signature,
    verifiedAt: r.verifiedAt,
  };
  return `${VERIFY_URL}?model=${encodeURIComponent(r.model)}#receipt=${Buffer.from(JSON.stringify(receipt)).toString("base64url")}`;
}

/**
 * The Verification Center link for a receipt kept with a listing (listings.checks.ai.receipt), or
 * nothing: only a provider_tee signature this server verified, by the key named in the model's
 * attestation report. The receipt holds hashes, never the ticket's text.
 */
export function teeLink(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Partial<TeeReceipt>;
  const text = (x: unknown) => typeof x === "string" && x.length > 0;
  if (r.verified !== true || r.attested !== true || r.signatureKind !== "provider_tee") return undefined;
  if (![r.completionId, r.model, r.signature, r.signedText, r.signingAddress].every(text)) return undefined;
  return verificationUrl(r as TeeReceipt);
}

type SignatureReply = { text?: string; signature?: string; signing_address?: string; signing_algo?: string; signature_kind?: string; error_code?: string };

/** The signature for a completion: it can take a moment to be recorded, so a few short tries. */
async function fetchSignature(id: string, key: string): Promise<SignatureReply | null> {
  const url = `${NEAR_AI_URL}/signature/${encodeURIComponent(id)}?signing_algo=ecdsa`;
  for (let i = 0; i < SIGNATURE_TRIES; i++) {
    if (i) await new Promise((r) => setTimeout(r, SIGNATURE_WAIT_MS));
    try {
      const res = await fetch(url, { headers: { accept: "application/json", authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4_000) });
      if (res.status === 404) continue;
      if (!res.ok) return null;
      const body = (await res.json()) as SignatureReply;
      if (!body.error_code && body.signature) return body;
    } catch {
      // Try again while there are tries.
    }
  }
  return null;
}

export type NearAnswer =
  | { ok: true; text: string; tokens: { in: number; out: number }; receipt: TeeReceipt }
  | { ok: false; retry: boolean; detail: string };

/**
 * One completion and its receipt. The body is built once and hashed as sent, and the reply is hashed
 * before it is parsed: the signature covers those exact bytes. The canonical model id and
 * x-no-aliasing keep the gateway from rewriting the request, which would make the signature its own.
 */
export async function completeInTee(prompt: string, schema: object, o: { key: string; model: string; timeoutMs: number; maxTokens: number }): Promise<NearAnswer> {
  // The attestation report is read alongside the call, not before it, so its time does not add to
  // the read's (a cold start spent seconds on it, 9 Nov 2026). Unreadable, it is null, never a throw.
  const signersP = attestedSigners(o.model).catch(() => null);
  const body = JSON.stringify({
    model: o.model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: o.maxTokens,
    // Copying fields off a ticket needs no thinking: with it the same reads took 19 s instead of 3 and
    // were no more accurate. NEAR_AI_THINKING=on brings it back for a trial.
    chat_template_kwargs: { enable_thinking: process.env.NEAR_AI_THINKING === "on" },
    response_format: { type: "json_schema", json_schema: { name: "ticket_facts", strict: true, schema: { ...schema, additionalProperties: false } } },
    stream: false,
  });
  let res: Response;
  try {
    res = await fetch(`${NEAR_AI_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "accept-encoding": "identity", "x-no-aliasing": "true", authorization: `Bearer ${o.key}` },
      body,
      signal: AbortSignal.timeout(o.timeoutMs),
    });
  } catch (e) {
    return { ok: false, retry: true, detail: e instanceof Error && e.name === "TimeoutError" ? "timed out" : "network error" };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const raw = new TextDecoder().decode(bytes);
  if (!res.ok) {
    let message = "";
    try {
      message = String((JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? "");
    } catch {
      // Not JSON: the status says enough.
    }
    // While a model is down or being redeployed, NEAR's gateway answers 400 "Provider failed for model
    // ...", and a try a moment later often gets through (10 Nov 2026, on and off for an hour).
    const retry = [408, 429, 500, 502, 503, 504].includes(res.status) || (res.status === 400 && /^provider failed/i.test(message));
    return { ok: false, retry, detail: `HTTP ${res.status}${message ? `: ${message.slice(0, 160)}` : ""}` };
  }

  type Completion = { id?: string; choices?: { message?: { content?: string | null }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  let done: Completion;
  try {
    done = JSON.parse(raw) as Completion;
  } catch {
    return { ok: false, retry: true, detail: "the reply is not JSON" };
  }
  const choice = done.choices?.[0];
  if (!done.id || !choice) return { ok: false, retry: true, detail: "no choices in the reply" };
  if (choice.finish_reason && choice.finish_reason !== "stop") return { ok: false, retry: false, detail: `finish_reason ${choice.finish_reason}` };

  const requestHash = sha256(body);
  const responseHash = sha256(bytes);
  const signed = await fetchSignature(done.id, o.key);
  const base = {
    completionId: done.id,
    model: o.model,
    signatureKind: signed?.signature_kind ?? null,
    signingAlgo: signed?.signing_algo ?? null,
    signingAddress: signed?.signing_address ?? null,
    signedText: signed?.text ?? null,
    signature: signed?.signature ?? null,
    requestHash,
    responseHash,
    verifiedAt: new Date().toISOString(),
  };
  const check = signed ? await checkReceipt(base) : { ok: false, problem: "NEAR AI gave no signature for this reply" };
  const signers = await signersP;
  const receipt: TeeReceipt = {
    ...base,
    verified: check.ok,
    attested: !!signers && !!base.signingAddress && signers.has(base.signingAddress.toLowerCase()),
    ...(check.problem ? { problem: check.problem } : {}),
  };
  return {
    ok: true,
    text: choice.message?.content ?? "",
    tokens: { in: done.usage?.prompt_tokens ?? 0, out: done.usage?.completion_tokens ?? 0 },
    receipt,
  };
}
