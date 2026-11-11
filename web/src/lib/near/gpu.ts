// NVIDIA's own verdict on the GPU evidence in a model's attestation report. NEAR AI's report carries
// the evidence each GPU produced for the nonce we sent; NVIDIA's Remote Attestation Service (NRAS)
// judges it and answers with tokens it signs. This asks NRAS directly, from the server, and checks
// three things: the verdict, that the token carries our nonce (so the evidence is not a replay), and
// the token's signature against the keys NVIDIA publishes. NEAR's own example
// (github.com/near-examples/nearai-cloud-verification-example) does the first two.
//
// What this does not check: the Intel TDX quote of the machine around the GPU. NEAR's Verification
// Center checks that in the reader's browser, from the link on each receipt.
if (typeof window !== "undefined") throw new Error("lib/near/gpu is server-only");

const NRAS_URL = "https://nras.attestation.nvidia.com/v3/attest/gpu";
const JWKS_URL = "https://nras.attestation.nvidia.com/.well-known/jwks.json";
const ISSUER = "https://nras.attestation.nvidia.com";
const KEYS_TTL_MS = 60 * 60_000;

export type GpuCheck = {
  /** NVIDIA judged the evidence valid, in a token from NRAS that has not expired. */
  ok: boolean;
  /** The token carries the nonce this server made up for the report. */
  fresh: boolean;
  /** The token's ES384 signature is by a key NVIDIA publishes. */
  signed: boolean;
  /** GPUs the verdict covers. */
  gpus: number;
  at: string;
};

/** All three, or it is not shown as confirmed. */
export const gpuConfirmed = (g: GpuCheck | null | undefined) => !!g && g.ok && g.fresh && g.signed;

export type Jwk = { kty?: string; crv?: string; kid?: string; x?: string; y?: string };

type Token = { header: Record<string, unknown>; claims: Record<string, unknown>; signedBytes: Uint8Array<ArrayBuffer>; signature: Uint8Array<ArrayBuffer> };

const bytes = (b: Buffer) => new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);

function read(token: unknown): Token | null {
  if (typeof token !== "string") return null;
  const p = token.split(".");
  if (p.length !== 3) return null;
  try {
    return {
      header: JSON.parse(Buffer.from(p[0], "base64url").toString("utf8")) as Record<string, unknown>,
      claims: JSON.parse(Buffer.from(p[1], "base64url").toString("utf8")) as Record<string, unknown>,
      signedBytes: bytes(Buffer.from(`${p[0]}.${p[1]}`, "utf8")),
      signature: bytes(Buffer.from(p[2], "base64url")),
    };
  } catch {
    return null;
  }
}

/** Whether a token's ES384 signature is by the key its header names, among these. */
export async function signedBy(token: string, keys: Jwk[]): Promise<boolean> {
  const t = read(token);
  if (!t || t.header.alg !== "ES384") return false;
  const jwk = keys.find((k) => k.kid === t.header.kid && k.kty === "EC" && k.crv === "P-384" && k.x && k.y);
  if (!jwk) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-384", x: jwk.x, y: jwk.y }, { name: "ECDSA", namedCurve: "P-384" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-384" }, key, t.signature, t.signedBytes);
  } catch {
    return false;
  }
}

/**
 * NRAS's reply, [["JWT", overall], {"GPU-0": token, ...}], read against the nonce we sent. Null when
 * it is not that shape. Expiry is checked, the "not before" time is not: NEAR's page fails valid
 * receipts on a clock a few seconds slow for that reason.
 */
export async function readVerdict(reply: unknown, nonce: string, keys: Jwk[], now = Date.now()): Promise<GpuCheck | null> {
  if (!Array.isArray(reply)) return null;
  const overall = reply.find((x): x is [string, string] => Array.isArray(x) && x[0] === "JWT" && typeof x[1] === "string");
  const each = reply.find((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
  const t = read(overall?.[1]);
  if (!overall || !t) return null;
  const live = typeof t.claims.exp === "number" && t.claims.exp * 1000 > now;
  return {
    ok: t.claims["x-nvidia-overall-att-result"] === true && t.claims.iss === ISSUER && live,
    fresh: typeof t.claims.eat_nonce === "string" && t.claims.eat_nonce.toLowerCase() === nonce.toLowerCase(),
    signed: await signedBy(overall[1], keys),
    gpus: each ? Object.keys(each).filter((k) => k.startsWith("GPU-")).length : 0,
    at: new Date(now).toISOString(),
  };
}

let published: { at: number; keys: Jwk[] } | null = null;

/** NVIDIA rotates these daily; `kid` asks again when the token names a key newer than the copy held. */
async function nvidiaKeys(kid?: string): Promise<Jwk[]> {
  const held = published && Date.now() - published.at < KEYS_TTL_MS ? published.keys : null;
  if (held && (!kid || held.some((k) => k.kid === kid))) return held;
  try {
    const res = await fetch(JWKS_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
    const body = res.ok ? ((await res.json()) as { keys?: Jwk[] }) : null;
    if (body?.keys?.length) published = { at: Date.now(), keys: body.keys };
  } catch {
    // keep what is held
  }
  return published?.keys ?? [];
}

/** Asks NVIDIA about one node's GPU evidence (`nvidia_payload` in the report). Null when it cannot be asked. */
export async function askNvidia(payload: unknown, nonce: string): Promise<GpuCheck | null> {
  const body = typeof payload === "string" ? payload : payload ? JSON.stringify(payload) : "";
  if (!body) return null;
  try {
    const res = await fetch(NRAS_URL, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const reply = (await res.json()) as unknown;
    const overall = Array.isArray(reply) ? reply.find((x) => Array.isArray(x) && x[0] === "JWT") : null;
    const kid = read(overall?.[1])?.header.kid;
    return await readVerdict(reply, nonce, await nvidiaKeys(typeof kid === "string" ? kid : undefined));
  } catch {
    return null;
  }
}
