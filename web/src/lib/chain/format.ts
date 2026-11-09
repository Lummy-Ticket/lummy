// Plain strings for chain addresses and explorer links, with no viem in them: a page that only
// shows a link or a short address must not ship the chain client to every QRIS buyer (about 54 KB
// gzip on the ticket page and checkout; UX audit, 4 Nov 2026). 421614 is Arbitrum Sepolia.
const EXPLORERS: Record<number, string> = {
  421614: "https://sepolia.arbiscan.io",
  42161: "https://arbiscan.io",
};

export const explorerTx = (chainId: number, hash: string) => (EXPLORERS[chainId] ? `${EXPLORERS[chainId]}/tx/${hash}` : null);

export const explorerAddress = (chainId: number, address: string) => (EXPLORERS[chainId] ? `${EXPLORERS[chainId]}/address/${address}` : null);

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Circle's faucet hands out testnet USDC, Arbitrum Sepolia included. */
export const USDC_FAUCET = "https://faucet.circle.com";
