// Orders without a payment: the straight path of POST /api/orders that chain mode, presenters and
// staff take. While money is simulated they may buy any listing that way. Once money is real, a live
// Xendit key or payouts turned on, only the seed listings presenters use stay open to it, so nobody
// walks off with a real seller's ticket without paying for it (production audit 2 Nov 2026, M2).
// A plain function, so live:check can try it without a live key.
import { SEED_LISTINGS } from "@/lib/mock/seed";

const SEED_IDS = new Set(SEED_LISTINGS.map((l) => l.id));

export type Money = { payouts: boolean; xenditLive: boolean };

export const moneyIsReal = (m: Money) => m.payouts || m.xenditLive;

export function unpaidOrderAllowed(listingId: string, money: Money) {
  return !moneyIsReal(money) || SEED_IDS.has(listingId);
}
