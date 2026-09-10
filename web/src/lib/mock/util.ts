// Mock on-chain + money helpers.

export const CONTRACT_ADDRESS = "0x7c3F1a4e9B2d5A8c6E0f13B9aD4c2E7f0A9b3C1d";

export const mockTxHash = () =>
  "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

export const explorerTx = (h: string) => `https://sepolia.arbiscan.io/tx/${h}`;
export const explorerAddr = (a: string) => `https://sepolia.arbiscan.io/address/${a}`;

// Fee model (docs): pass-through e-stamp + platform fee, max(5%, IDR 25,000).
export const MATERAI = 12000;
export const platformFee = (price: number) => Math.max(Math.round(price * 0.05), 25000);

export const shortHash = (h: string, n = 6) => `${h.slice(0, n + 2)}…${h.slice(-4)}`;

// The interface is English-first, so dates render in English while amounts stay
// in rupiah, which is the currency people actually pay in.
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
