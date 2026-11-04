// Orders without a payment: the straight path of POST /api/orders that chain mode, presenters and
// staff take. While money is simulated they may buy any listing that way. Once money is real, a live
// Xendit key or payouts turned on, only the seed listings presenters use stay open to it, so nobody
// walks off with a real seller's ticket without paying for it (production audit 2 Nov 2026, M2).
// Plain functions, so live:check can try them without a live key.
import { FEATURES } from "@/lib/features";
import { SEED_LISTINGS } from "@/lib/mock/seed";
import { xenditKeyIsLive } from "@/lib/payments/xendit";

const SEED_IDS = new Set(SEED_LISTINGS.map((l) => l.id));

export type Money = { payouts: boolean; xenditLive: boolean };

export const moneyIsReal = (m: Money) => m.payouts || m.xenditLive;

/**
 * The switches as this server has them. A live key counts on its own, webhook token or not, so a
 * half-set server is real money and refuses the straight path, rather than taking it for simulated.
 */
export const moneyNow = (): Money => ({ payouts: FEATURES.payouts, xenditLive: xenditKeyIsLive() });

export function unpaidOrderAllowed(listingId: string, money: Money) {
  return !moneyIsReal(money) || SEED_IDS.has(listingId);
}

/**
 * Whether a listing may be paid for with real money (a live Xendit key): only a real seller's
 * listing with the ticket file it was checked from. A seed listing, one with no seller, or a sample
 * listing (no file, whoever posted it) has no ticket to hand over, so real rupiah for it would only
 * wait for a refund (money and authorization audits, 4 Nov 2026). In test mode every listing may be.
 */
export function paidListingAllowed(listing: { id: string; seller_id: string | null; ticket_path: string | null }, testMode: boolean) {
  return testMode || (!SEED_IDS.has(listing.id) && !!listing.seller_id && !!listing.ticket_path);
}
