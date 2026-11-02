// Per-account limits on the routes that cost the most: reading an untrusted ticket PDF (a check or a
// listing, each a full parse), the paid AI fill, and claim-photo upload links (production audit
// 2 Nov 2026, B3). Counted in the database (public.take_attempt), so every server instance sees the
// same count, and taken before the work, so a refused or failed try counts too. The counts are
// personal data: the privacy page names them, and they are gone within a day.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { FILL_WINDOW_MS, FILLS_PER_WINDOW } from "@/lib/tickets/fill";

if (typeof window !== "undefined") throw new Error("lib/rate is server-only");

export const RATE = {
  // A seller listing a PDF checks it once and publishes it once; three open listings, a retry or
  // two each, fit well inside fifteen.
  pdf_read: { limit: 15, windowSeconds: 10 * 60 },
  // The brake the AI fill always had (lib/tickets/fill.ts), now across instances instead of per one.
  ai_fill: { limit: FILLS_PER_WINDOW, windowSeconds: FILL_WINDOW_MS / 1000 },
  // Upload links for claim photos: a claim, a few answers and some retakes fit in a day.
  evidence_url: { limit: 20, windowSeconds: 24 * 60 * 60 },
} as const;
export type RateKind = keyof typeof RATE;

/** What the page says when a limit is reached. */
export const RATE_REFUSED: Record<RateKind, string> = {
  pdf_read: "terlalu banyak pemeriksaan tiket dalam 10 menit terakhir, coba lagi sebentar lagi",
  ai_fill: "terlalu sering, coba lagi beberapa menit lagi",
  evidence_url: "sudah terlalu banyak upload foto hari ini, coba lagi besok",
};

/**
 * Whether this account may do it now; counts the attempt when it may. A fault in the counter lets
 * the attempt through and says so in the log: a broken brake must not lock every seller out.
 */
export async function takeAttempt(admin: SupabaseClient<Database>, accountId: string, kind: RateKind): Promise<boolean> {
  const { limit, windowSeconds } = RATE[kind];
  const { data, error } = await admin.rpc("take_attempt", { p_account: accountId, p_kind: kind, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    console.error("[rate] take_attempt failed, letting the attempt through:", kind, error.message);
    return true;
  }
  return data === true;
}
