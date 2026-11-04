// Konstanta chain untuk operator (backend) dan skrip. Tidak ada kunci di sini.
import type { Chain } from "viem";
import { arbitrumSepolia, foundry } from "viem/chains";

/** Urutan wajib sama dengan enum Status di kontrak (docs/09, reconcile #1). */
export const STATUS = ["None", "Listed", "Funded", "DisputeWindow", "Released", "Refunded", "Cancelled"] as const;
export type Status = (typeof STATUS)[number];

export const CHAINS: Record<number, Chain> = {
  [arbitrumSepolia.id]: arbitrumSepolia,
  [foundry.id]: foundry,
};

/** RPC publik. Host lama sepolia.arbitrum.io sudah tidak ada. */
export const RPC_URLS: Record<number, string> = {
  [arbitrumSepolia.id]: "https://sepolia-rollup.arbitrum.io/rpc",
  [foundry.id]: "http://127.0.0.1:8545",
};

// Explorer links live in ./format, which pages can import without viem.
export { explorerAddress, explorerTx } from "./format";

/** USDC Circle dan MockUSDC sama-sama 6 desimal. */
export const USDC_DECIMALS = 6;
