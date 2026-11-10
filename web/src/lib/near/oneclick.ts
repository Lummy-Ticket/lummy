// NEAR Intents through its 1Click API (docs.near-intents.org): ask what a payment from one chain and
// asset costs, get an address to send it to, and read how the swap is going. There is no testnet and
// no webhook, so a real payment is real money, and its status is asked for. No key is needed.
if (typeof window !== "undefined") throw new Error("lib/near/oneclick is server-only");

const BASE = process.env.ONECLICK_URL?.trim() || "https://1click.chaindefuser.com";

/** Native USDC on Arbitrum One, the one asset the escrow takes. */
export const ARBITRUM_USDC = "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near";
/** Room for the price to move while the deposit travels. The part not used comes back to `refundTo`. */
const SLIPPAGE_BPS = 100;
const TOKENS_TTL_MS = 10 * 60_000;

export class OneClickError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type Token = { assetId: string; blockchain: string; symbol: string; decimals: number; price?: number; contractAddress?: string };

/** What the checkout offers. Chains with a high temporary minimum (Tron $100, BSC $1,000) are left out. */
const OFFERED: { chain: string; symbol: string; label: string }[] = [
  { chain: "base", symbol: "USDC", label: "Base" },
  { chain: "sol", symbol: "USDC", label: "Solana" },
  { chain: "eth", symbol: "USDC", label: "Ethereum" },
  { chain: "near", symbol: "USDC", label: "NEAR" },
  { chain: "op", symbol: "USDC", label: "Optimism" },
  { chain: "pol", symbol: "USDC", label: "Polygon" },
  { chain: "avax", symbol: "USDC", label: "Avalanche" },
  { chain: "sol", symbol: "USDT", label: "Solana" },
  { chain: "eth", symbol: "USDT", label: "Ethereum" },
  { chain: "base", symbol: "ETH", label: "Base" },
  { chain: "arb", symbol: "ETH", label: "Arbitrum" },
  { chain: "eth", symbol: "ETH", label: "Ethereum" },
  { chain: "sol", symbol: "SOL", label: "Solana" },
  { chain: "btc", symbol: "BTC", label: "Bitcoin" },
  { chain: "near", symbol: "wNEAR", label: "NEAR" },
];

/**
 * One asset the checkout offers. On an EVM chain it also carries what the buyer's own wallet needs to
 * pay the deposit itself (lib/near/send.ts): the chain id, the token's contract (null for the chain's
 * own coin) and its decimals.
 */
export type PayOption = { assetId: string; symbol: string; chain: string; chainLabel: string; evm: boolean; chainId: number | null; contract: string | null; decimals: number };

/** 1Click's EVM chains and their ids. */
export const EVM_CHAIN_IDS: Record<string, number> = { eth: 1, base: 8453, op: 10, pol: 137, avax: 43114, arb: 42161 };

async function call<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: { accept: "application/json", ...init?.headers }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new OneClickError(e instanceof Error && e.name === "TimeoutError" ? "1Click did not answer in time" : "1Click cannot be reached", 502);
  }
  const body = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !body) throw new OneClickError(body?.message ?? `1Click answered ${res.status}`, res.status);
  return body;
}

let tokensCache: { at: number; tokens: Token[] } | null = null;

export async function listTokens(): Promise<Token[]> {
  if (tokensCache && Date.now() - tokensCache.at < TOKENS_TTL_MS) return tokensCache.tokens;
  const tokens = await call<Token[]>("/v0/tokens");
  tokensCache = { at: Date.now(), tokens };
  return tokens;
}

/** The assets a buyer can pay with, among those 1Click lists right now. */
export async function payOptions(): Promise<PayOption[]> {
  const tokens = await listTokens();
  return OFFERED.flatMap((o) => {
    const t = tokens.find((x) => x.blockchain === o.chain && x.symbol === o.symbol);
    if (!t) return [];
    const chainId = EVM_CHAIN_IDS[o.chain] ?? null;
    return [{ assetId: t.assetId, symbol: o.symbol, chain: o.chain, chainLabel: o.label, evm: chainId !== null, chainId, contract: chainId !== null ? (t.contractAddress ?? null) : null, decimals: t.decimals }];
  });
}

export type Quote = {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd?: string;
  minAmountIn?: string;
  amountOut: string;
  amountOutFormatted: string;
  deadline?: string;
  timeEstimate?: number;
};

/** An address on each kind of chain for a quote nobody will pay: 1Click checks the format even then. */
const DRY_REFUND: Record<string, string> = {
  sol: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2",
  btc: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
  near: "lummy.near",
};
const DRY_EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

/**
 * What it takes to have exactly `amountOut` micro-USDC arrive at `recipient` on Arbitrum. `refundTo`
 * is on the chain paid from: a deposit that is short, late or too large comes back there. A dry quote
 * holds nothing and gives no address to pay.
 */
export async function requestQuote(q: {
  dry: boolean;
  originAsset: string;
  chain: string;
  amountOut: bigint;
  recipient: string;
  refundTo?: string;
  deadline: string;
}): Promise<Quote> {
  const body = {
    dry: q.dry,
    swapType: "EXACT_OUTPUT",
    slippageTolerance: SLIPPAGE_BPS,
    originAsset: q.originAsset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: ARBITRUM_USDC,
    amount: q.amountOut.toString(),
    refundTo: q.refundTo ?? DRY_REFUND[q.chain] ?? DRY_EVM,
    refundType: "ORIGIN_CHAIN",
    recipient: q.recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: q.deadline,
    referral: "lummy",
  };
  const r = await call<{ quote: Quote }>("/v0/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, 30_000);
  return r.quote;
}

export type SwapStatus = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "INCOMPLETE_DEPOSIT" | "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED";

export type StatusReply = {
  status: SwapStatus;
  updatedAt?: string;
  swapDetails?: {
    originChainTxHashes?: { hash: string; explorerUrl?: string }[];
    destinationChainTxHashes?: { hash: string; explorerUrl?: string }[];
    refundedAmountFormatted?: string;
    refundReason?: string;
  };
};

export const readSwapStatus = (depositAddress: string, memo?: string | null) => {
  const q = new URLSearchParams({ depositAddress, ...(memo ? { depositMemo: memo } : {}) });
  return call<StatusReply>(`/v0/status?${q}`);
};

/** The public page for one swap. */
export const swapExplorerUrl = (depositAddress: string) => `https://explorer.near-intents.org/transactions/${encodeURIComponent(depositAddress)}`;
