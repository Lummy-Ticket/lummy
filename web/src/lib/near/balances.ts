// Reads what one wallet holds of the assets the checkout offers on EVM chains, and asks NEAR Intents
// what this order would take of each. Public data, read from public RPCs: one batched call a chain,
// so a chain that does not answer costs only its own rows. Nothing is stored and nothing is logged.
if (typeof window !== "undefined") throw new Error("lib/near/balances is server-only");

import { createPublicClient, erc20Abi, fallback, formatUnits, http, type Address, type Chain, type ContractFunctionParameters } from "viem";
import { arbitrum, avalanche, base, mainnet, optimism, polygon } from "viem/chains";
import { gasReserve, judge, type HeldAsset } from "./held";
import { payOptions, requestQuote, type PayOption } from "./oneclick";

const NETS: Record<number, { chain: Chain; rpc: string[] }> = {
  1: { chain: mainnet, rpc: ["https://ethereum-rpc.publicnode.com", "https://ethereum.reth.rs/rpc"] },
  8453: { chain: base, rpc: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"] },
  10: { chain: optimism, rpc: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"] },
  137: { chain: polygon, rpc: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"] },
  43114: { chain: avalanche, rpc: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"] },
  42161: { chain: arbitrum, rpc: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"] },
};

/** Multicall3 reads the chain's own coin too, so one call covers a whole chain. */
const coinAbi = [{ type: "function", name: "getEthBalance", stateMutability: "view", inputs: [{ name: "addr", type: "address" }], outputs: [{ name: "balance", type: "uint256" }] }] as const;

type ChainRead = { coin: bigint; gasPrice: bigint; tokens: Map<string, bigint> };

async function readChain(chainId: number, owner: Address, tokens: string[]): Promise<ChainRead> {
  const net = NETS[chainId];
  if (!net?.chain.contracts?.multicall3) throw new Error(`chain ${chainId} is not read`);
  const client = createPublicClient({ chain: net.chain, transport: fallback(net.rpc.map((u) => http(u, { timeout: 6_000, retryCount: 0 }))) });
  // Two ABIs in one batch, so the list is typed loosely; every result is a uint256.
  const contracts: ContractFunctionParameters[] = [
    { address: net.chain.contracts.multicall3.address, abi: coinAbi, functionName: "getEthBalance", args: [owner] },
    ...tokens.map((t) => ({ address: t as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner] })),
  ];
  const [results, gasPrice] = await Promise.all([client.multicall({ allowFailure: true, contracts }), client.getGasPrice()]);
  const [coin, ...rest] = results;
  if (coin.status !== "success") throw new Error(`chain ${chainId}: balance not read`);
  const held = new Map<string, bigint>();
  rest.forEach((r, i) => {
    if (r.status === "success") held.set(tokens[i].toLowerCase(), r.result as bigint);
  });
  return { coin: coin.result as bigint, gasPrice, tokens: held };
}

/**
 * What `owner` holds of every EVM asset the checkout offers, and whether it would pay `amountOut`
 * micro-USDC into `recipient`. Only an asset the wallet holds is quoted. Never throws for one chain or
 * one quote: that row says "not read" (balance null) or "no quote" (needs null) instead.
 */
export async function readHeld(owner: Address, amountOut: bigint, recipient: string, options?: PayOption[]): Promise<HeldAsset[]> {
  const offered = (options ?? (await payOptions())).filter((o) => o.chainId !== null);
  const chains = [...new Set(offered.map((o) => o.chainId as number))];
  const reads = new Map<number, ChainRead | null>(
    await Promise.all(
      chains.map(async (id): Promise<[number, ChainRead | null]> => {
        const tokens = offered.filter((o) => o.chainId === id && o.contract).map((o) => o.contract as string);
        return [id, await readChain(id, owner, tokens).catch(() => null)];
      })
    )
  );
  const deadline = new Date(Date.now() + 30 * 60_000).toISOString();
  return Promise.all(
    offered.map(async (o): Promise<HeldAsset> => {
      const read = reads.get(o.chainId as number) ?? null;
      const balance = !read ? null : o.contract ? (read.tokens.get(o.contract.toLowerCase()) ?? null) : read.coin;
      if (!read || balance === null) return { assetId: o.assetId, balance: null, needs: null, enough: false, gas: true };
      if (balance <= BigInt(0)) return { assetId: o.assetId, balance: "0", needs: null, enough: false, gas: true };
      const quote = await requestQuote({ dry: true, originAsset: o.assetId, chain: o.chain, amountOut, recipient, deadline }).catch(() => null);
      const needs = quote && /^\d+$/.test(quote.amountIn) ? BigInt(quote.amountIn) : null;
      const verdict = judge({ balance, needs, token: !!o.contract, coin: read.coin, reserve: gasReserve(o.chainId as number, read.gasPrice, !!o.contract) });
      return { assetId: o.assetId, balance: formatUnits(balance, o.decimals), needs: quote?.amountInFormatted ?? null, ...verdict };
    })
  );
}
