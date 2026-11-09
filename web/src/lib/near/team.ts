// Who may use what the NEAR HACKATHON demo adds. Anyone can see a live quote and check a made-up ticket
// on /near. A payment through NEAR Intents is real money on Arbitrum One, and the listings on shows
// abroad are samples, so only the team pays there, with its own money. Everything else on the site
// stays as it is: QRIS for shows in Indonesia, test USDC for the rest (docs/04, the exception noted there).
import { isDemoEmail } from "@/lib/supabase/demo";

if (typeof window !== "undefined") throw new Error("lib/near/team is server-only");

/** Staff, and the accounts named in LUMMY_NEAR_TEAM (emails, comma-separated). Never a demo account. */
export function nearTeam(user: { email: string; staff: boolean } | null) {
  if (!user || isDemoEmail(user.email)) return false;
  if (user.staff) return true;
  const named = (process.env.LUMMY_NEAR_TEAM ?? "").split(",").map((e) => e.trim().toLowerCase());
  return !!user.email && named.includes(user.email.toLowerCase());
}
