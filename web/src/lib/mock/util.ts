// Explorer links and money helpers. Transaction hashes only ever come from the chain
// (Order.chain); sample orders have none.
import { FEATURES } from "../features";

export const explorerTx = (h: string) => `https://sepolia.arbiscan.io/tx/${h}`;
export const explorerAddr = (a: string) => `https://sepolia.arbiscan.io/address/${a}`;

// Fee model (docs): platform fee, max(5%, IDR 25,000), plus the e-stamp and e-signature passed
// through at cost once a licensed provider signs the letter. Until then it is not charged.
export const E_STAMP_FEE = 12000;
export const MATERAI = FEATURES.eStamp ? E_STAMP_FEE : 0;
export const platformFee = (price: number) => Math.max(Math.round(price * 0.05), 25000);

export const shortHash = (h: string, n = 6) => `${h.slice(0, n + 2)}…${h.slice(-4)}`;

// The interface is English-first, so dates render in English while amounts stay
// in rupiah, which is the currency people actually pay in.
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
