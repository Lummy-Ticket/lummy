// What a buyer's wallet holds that could pay an order through NEAR Intents, and which of it to offer
// first. In the team's real-money run (T4, 10 Nov 2026) the buyer picked ETH while holding USDC, then
// pasted the deposit address into the wallet by hand: nothing on the page knew what the wallet held.
// Pure, for the browser and the server. The reading itself is in lib/near/balances.ts.

export type HeldAsset = {
  assetId: string;
  /** In whole units ("12.4"). Null when that chain could not be read. */
  balance: string | null;
  /** What this order would take of it, from a live quote. Null when nothing is held, or no quote came. */
  needs: string | null;
  /** The balance covers `needs`; for a chain's own coin, also the gas to send it. */
  enough: boolean;
  /** False when a token is held but the chain's own coin does not cover the gas to send it. */
  gas: boolean;
};

/** Gas a plain send takes: the chain's own coin, or a token transfer. */
const GAS_COIN = BigInt(21_000);
const GAS_TOKEN = BigInt(80_000);
/** Rollups also charge for the data they post to Ethereum, which their gas price does not show. */
const ROLLUPS = new Set([8453, 10, 42161]);

/** The chain's own coin to keep aside for one send, with room: twice the estimate, six times on a rollup. */
export function gasReserve(chainId: number, gasPrice: bigint, token: boolean): bigint {
  return gasPrice * (token ? GAS_TOKEN : GAS_COIN) * BigInt(ROLLUPS.has(chainId) ? 6 : 2);
}

/**
 * Whether a balance can pay. `coin` is the wallet's balance of the chain's own coin, `reserve` what
 * one send of this asset may cost there. All in the smallest units.
 */
export function judge(p: { balance: bigint; needs: bigint | null; token: boolean; coin: bigint; reserve: bigint }): { enough: boolean; gas: boolean } {
  if (p.needs === null || p.balance <= BigInt(0)) return { enough: false, gas: true };
  if (p.token) return { enough: p.balance >= p.needs, gas: p.coin >= p.reserve };
  return { enough: p.balance >= p.needs + p.reserve, gas: true };
}

const STABLE = new Set(["USDC", "USDT"]);

/**
 * The asset to offer first, or null when nothing in the wallet can pay. A stablecoin before a coin
 * whose price moves, and Ethereum last: its fees are the highest, and what NEAR Intents does not use
 * of a deposit does not come back there (T4). Among equals, the order the checkout lists them in.
 */
export function pickHeld(options: { assetId: string; symbol: string; chain: string }[], held: HeldAsset[]): string | null {
  const first = orderHeld(options, held)[0];
  return first && canPay(held, first.assetId) ? first.assetId : null;
}

const canPay = (held: HeldAsset[], assetId: string) => {
  const h = held.find((x) => x.assetId === assetId);
  return !!h && h.enough && h.gas;
};

/** The same assets: what can pay first, in the order pickHeld prefers, then the rest as they were. */
export function orderHeld<T extends { assetId: string; symbol: string; chain: string }>(options: T[], held: HeldAsset[]): T[] {
  const rank = (o: T) => (o.chain === "eth" ? 2 : 0) + (STABLE.has(o.symbol) ? 0 : 1);
  const payable = options.filter((o) => canPay(held, o.assetId)).sort((a, b) => rank(a) - rank(b));
  return [...payable, ...options.filter((o) => !canPay(held, o.assetId))];
}

/** "12.400000" as "12.4", "0.004553610108364126" as "0.004553": six decimals at most, cut and never rounded up. */
export function shortAmount(x: string): string {
  const [whole, frac = ""] = x.split(".");
  const kept = frac.slice(0, 6).replace(/0+$/, "");
  return kept ? `${whole}.${kept}` : whole;
}
