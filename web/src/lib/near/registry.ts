// Lummy's receipt registry on NEAR (contracts/near-receipts): a contract that recovers the signer of a
// TEE receipt with its own arithmetic and keeps the receipts recorded in it. This file only asks it,
// through NEAR's public RPC: a view call needs no key and costs nothing, so every check on /near can be
// checked once more by code that nobody runs.
//
// It is on NEAR mainnet since 13 Nov 2026 (lummy-receipts.near), after a day on testnet. A record there proves that `signer` signed `signedText`; that the signer
// lives inside a TEE is what the model's attestation report says (lib/tickets/near-ai.ts).

export const REGISTRY = {
  account: "lummy-receipts.near",
  network: "mainnet" as "testnet" | "mainnet",
  rpcs: ["https://rpc.mainnet.fastnear.com", "https://free.rpc.fastnear.com", "https://rpc.mainnet.near.org"],
  explorer: "https://nearblocks.io/address/lummy-receipts.near",
};

export type RegistryAnswer = {
  account: string;
  network: "testnet" | "mainnet";
  explorer: string;
  /** The address the contract recovered, or null when it refused the signature. */
  signer: string | null;
  /** The contract's signer is the one the receipt names. */
  matches: boolean;
  /** When this receipt was recorded in the contract, unix milliseconds; null when it is not recorded. */
  recordedAt: number | null;
};

type RpcReply = { result?: { result?: number[]; error?: string }; error?: unknown };

/** One view call. Returns undefined when the contract refused (a panic), throws when no node answered. */
async function view<T>(method: string, args: unknown, fetcher: typeof fetch = fetch): Promise<T | undefined> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "query",
    params: { request_type: "call_function", finality: "final", account_id: REGISTRY.account, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") },
  });
  let last: unknown;
  for (const rpc of REGISTRY.rpcs) {
    try {
      const res = await fetcher(rpc, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(8000) });
      const reply = (await res.json()) as RpcReply;
      if (reply.result?.result) return JSON.parse(Buffer.from(reply.result.result).toString("utf8")) as T;
      if (reply.result?.error) return undefined;
      last = reply.error ?? `HTTP ${res.status}`;
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`no NEAR node answered: ${String(last).slice(0, 120)}`);
}

/** Who the contract says signed this text, and whether this receipt is recorded in it. */
export async function askRegistry(signedText: string, signature: string, signer: string, fetcher: typeof fetch = fetch): Promise<RegistryAnswer> {
  const [recovered, record] = await Promise.all([
    view<string>("signer_of", { signed_text: signedText, signature }, fetcher),
    view<{ recorded_at_ms: number } | null>("get", { signed_text: signedText, signer }, fetcher),
  ]);
  return {
    account: REGISTRY.account,
    network: REGISTRY.network,
    explorer: REGISTRY.explorer,
    signer: recovered ?? null,
    matches: !!recovered && recovered.toLowerCase() === signer.toLowerCase(),
    recordedAt: record?.recorded_at_ms ?? null,
  };
}
