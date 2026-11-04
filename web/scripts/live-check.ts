/**
 * What changes once money is real (a live Xendit key, or payouts turned on), checked without either:
 * the straight order path that chain mode, presenters and staff take stays open only for the seed
 * listings (lib/orders/unpaid.ts, production audit 2 Nov 2026, M2). Offline, run in CI.
 *
 *   npm run live:check
 */
import { SEED_LISTINGS } from "../src/lib/mock/seed";
import { moneyIsReal, unpaidOrderAllowed } from "../src/lib/orders/unpaid";

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

const seed = SEED_LISTINGS[0].id;
// The shape of a listing an account posts (api/listings), made up.
const real = "ls-0123456789ab";
const simulated = { payouts: false, xenditLive: false };
const live = { payouts: false, xenditLive: true };
const paying = { payouts: true, xenditLive: false };

check("simulated money: any listing may be bought without paying", unpaidOrderAllowed(real, simulated) && unpaidOrderAllowed(seed, simulated));
check("live Xendit key: a real seller's listing is refused", !unpaidOrderAllowed(real, live));
check("live Xendit key: a seed listing stays open to presenters", unpaidOrderAllowed(seed, live));
check("payouts on: a real seller's listing is refused", !unpaidOrderAllowed(real, paying));
check("payouts on and a live key: still only the seed", !unpaidOrderAllowed(real, { payouts: true, xenditLive: true }) && unpaidOrderAllowed(seed, { payouts: true, xenditLive: true }));
check("a made-up id is not a seed listing", !unpaidOrderAllowed("ls-not-in-the-seed", live));
check("money is real with either switch, not without", moneyIsReal(live) && moneyIsReal(paying) && !moneyIsReal(simulated));

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
