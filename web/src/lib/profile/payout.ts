// The payout account: which bank and number a seller's money goes to once payouts are real. It
// changes only through api/profile/payout, and only with a sign-in made in the last minutes, so a
// stolen session alone cannot send a seller's money elsewhere (production audit 2 Nov 2026, M7). No
// server code here, so the profile page uses the same rules; checked offline by live:check.

export const PAYOUT_BANKS = ["BCA", "Mandiri", "BNI", "BRI"] as const;
export type PayoutBankName = (typeof PAYOUT_BANKS)[number];

/** How long after signing in a session may change the payout account. */
export const FRESH_SIGN_IN_MINUTES = 15;

export const isPayoutBank = (v: unknown): v is PayoutBankName => PAYOUT_BANKS.some((b) => b === v);

/** An Indonesian account number as banks print it, spaces taken out: 6 to 20 digits. */
export const payoutNumberOf = (v: unknown): string | null => {
  const n = typeof v === "string" ? v.replace(/\s/g, "") : "";
  return /^[0-9]{6,20}$/.test(n) ? n : null;
};

/**
 * When this session signed in, in milliseconds, from its own token's `amr` claim, which keeps the
 * time of the sign-in through every refresh. Null when the token does not say: an older or a
 * custom token, which then counts as not fresh.
 */
export function signedInAt(claims: { amr?: unknown } | null | undefined): number | null {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return null;
  const times = amr.flatMap((e) => {
    const t = e && typeof e === "object" ? (e as { timestamp?: unknown }).timestamp : undefined;
    return typeof t === "number" && Number.isFinite(t) ? [t * 1000] : [];
  });
  return times.length ? Math.max(...times) : null;
}

/** Whether a sign-in at `at` is recent enough to change the payout account (a minute of clock skew allowed). */
export const freshSignIn = (at: number | null, now = Date.now()) =>
  at !== null && at <= now + 60_000 && now - at <= FRESH_SIGN_IN_MINUTES * 60_000;

/** The last four digits, which is all an email or a log ever shows. */
export const lastFour = (n: string) => n.slice(-4);
