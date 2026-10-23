"use client";

// The buyer's own wallet in the browser (EIP-1193: MetaMask, Rabby and the like), for paying a show
// abroad in USDC (tasks/founder-house-usdc.md). It connects, moves to the escrow's chain and signs
// two messages the server prepared. It never sends a transaction, so it needs no ETH.
import { createWalletClient, custom, toHex, type Address, type EIP1193Provider, type Hex } from "viem";
import type { TypedMessage } from "@/lib/payments/types";
import { CHAINS, RPC_URLS } from "./config";
import { reviveTyped } from "./typed";

export type Wallet = EIP1193Provider;

/** The wallet the browser carries, if any. */
export function injectedWallet(): Wallet | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Wallet }).ethereum ?? null;
}

/** Asks the wallet for an account; the first one it gives is the one that pays. */
export async function connectWallet(w: Wallet): Promise<Address> {
  const [account] = await w.request({ method: "eth_requestAccounts" });
  if (!account) throw new Error("wallet tidak memberikan akun");
  return account;
}

/** Wallets refuse to sign typed data for another chain, so the wallet moves first (adding it if new). */
export async function ensureChain(w: Wallet, chainId: number) {
  if (Number(await w.request({ method: "eth_chainId" })) === chainId) return;
  const id = toHex(chainId);
  try {
    await w.request({ method: "wallet_switchEthereumChain", params: [{ chainId: id }] });
  } catch (e) {
    if (codeOf(e) !== 4902) throw e;
    const chain = CHAINS[chainId];
    await w.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: id,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [RPC_URLS[chainId]],
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        },
      ],
    });
  }
}

/** One signature over a message the server prepared, by `account`. */
export async function signTyped(w: Wallet, account: Address, typed: TypedMessage): Promise<Hex> {
  const client = createWalletClient({ account, chain: CHAINS[Number(typed.domain.chainId)], transport: custom(w) });
  const r = reviveTyped(typed);
  return client.signTypedData({ account, domain: r.domain, types: r.types, primaryType: r.primaryType, message: r.message } as Parameters<
    typeof client.signTypedData
  >[0]);
}

function codeOf(e: unknown): number | undefined {
  for (let x = e as { code?: unknown; cause?: unknown } | undefined, i = 0; x && i < 6; x = x.cause as typeof x, i++) {
    if (typeof x.code === "number") return x.code;
  }
  return undefined;
}

/** The buyer said no in the wallet (EIP-1193 code 4001). */
export const walletRefused = (e: unknown) => codeOf(e) === 4001;

/** 0xaD1d…AD91 */
export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
