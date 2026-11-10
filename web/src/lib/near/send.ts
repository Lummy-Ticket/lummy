// Paying a NEAR Intents deposit from the browser's own wallet (MetaMask, Rabby and the like) on an EVM
// chain: the exact asset and amount to the deposit address, so nothing is copied by hand. In the team's
// real-money run (T4, 10 Nov 2026) the buyer first picked ETH while holding USDC, and the address had to
// be pasted into the wallet. The address and QR stay for Bitcoin, Solana, NEAR and exchanges.
import { createWalletClient, custom, encodeFunctionData, erc20Abi, parseUnits, toHex, type Address, type Hex } from "viem";
import { arbitrum, avalanche, base, mainnet, optimism, polygon, type Chain } from "viem/chains";
import { connectWallet, type Wallet } from "@/lib/chain/wallet";

const CHAINS: Record<number, Chain> = { 1: mainnet, 8453: base, 10: optimism, 137: polygon, 43114: avalanche, 42161: arbitrum };

export type Deposit = {
  chainId: number;
  /** The deposit address 1Click gave this order. */
  to: string;
  /** As 1Click wrote it ("9.603158"), in whole units of the asset. */
  amount: string;
  decimals: number;
  /** The token's contract, or null for the chain's own coin (ETH). */
  token: string | null;
};

/** The transaction that pays a deposit: a token transfer, or plain value for the chain's own coin. Pure. */
export function depositTransfer(d: Deposit): { chainId: number; to: Address; value: bigint; data?: Hex } {
  const units = parseUnits(d.amount, d.decimals);
  if (d.token) {
    return { chainId: d.chainId, to: d.token as Address, value: BigInt(0), data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [d.to as Address, units] }) };
  }
  return { chainId: d.chainId, to: d.to as Address, value: units };
}

/** The explorer page of a transaction on one of these chains. */
export function depositTxUrl(chainId: number, hash: string) {
  const root = CHAINS[chainId]?.blockExplorers?.default.url;
  return root ? `${root}/tx/${hash}` : null;
}

function codeOf(e: unknown): number | undefined {
  for (let x = e as { code?: unknown; cause?: unknown } | undefined, i = 0; x && i < 6; x = x.cause as typeof x, i++) {
    if (typeof x.code === "number") return x.code;
  }
  return undefined;
}

/** Moves the wallet to the deposit's chain, adding it first when the wallet does not know it (4902). */
async function moveTo(w: Wallet, chain: Chain) {
  if (Number(await w.request({ method: "eth_chainId" })) === chain.id) return;
  const chainId = toHex(chain.id);
  try {
    await w.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    if (codeOf(e) !== 4902) throw e;
    await w.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [...chain.rpcUrls.default.http],
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        },
      ],
    });
  }
}

/** Asks the wallet to send the deposit; resolves with the transaction's hash once the wallet sent it. */
export async function sendDeposit(w: Wallet, d: Deposit): Promise<Hex> {
  const chain = CHAINS[d.chainId];
  if (!chain) throw new Error("chain ini tidak bisa dibayar dari wallet di browser");
  const account = await connectWallet(w);
  await moveTo(w, chain);
  const tx = depositTransfer(d);
  const client = createWalletClient({ account, chain, transport: custom(w) });
  return client.sendTransaction({ account, chain, to: tx.to, value: tx.value, data: tx.data });
}
