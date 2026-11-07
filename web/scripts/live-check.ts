/**
 * What changes once money is real (a live Xendit key, or payouts turned on), checked without either:
 * the straight order path that chain mode, presenters and staff take stays open only for the seed
 * listings (lib/orders/unpaid.ts, production audit 2 Nov 2026, M2), and the switches are read from
 * the server's env the way api/orders reads them (moneyNow). Offline, run in CI.
 *
 *   npm run live:check
 */
import { FEATURES } from "../src/lib/features";
import { PENALTY_NOTE, penaltyNoteFor } from "../src/lib/mock/escrow";
import { CAP_PCT, SEED_LISTINGS, capOf, seedEvents } from "../src/lib/mock/seed";
import { inPriceBand, priceBand } from "../src/lib/listings/rules";
import { moneyIsReal, moneyNow, paidListingAllowed, unpaidOrderAllowed } from "../src/lib/orders/unpaid";
import { xenditConfig, xenditKeyIsLive } from "../src/lib/payments/xendit";

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

// The switches as api/orders reads them from the server's env (moneyNow), made-up keys only. A live
// key counts on its own: without its webhook token QRIS is off (xenditConfig null), but the money
// is still real, so the straight path must not open for a real seller's listing (review, 4 Nov 2026).
const withEnv = <T>(key: string | undefined, token: string | undefined, f: () => T): T => {
  const before = { key: process.env.XENDIT_SECRET_KEY, token: process.env.XENDIT_WEBHOOK_TOKEN };
  const set = (name: string, v: string | undefined) => (v === undefined ? delete process.env[name] : (process.env[name] = v));
  set("XENDIT_SECRET_KEY", key);
  set("XENDIT_WEBHOOK_TOKEN", token);
  try {
    return f();
  } finally {
    set("XENDIT_SECRET_KEY", before.key);
    set("XENDIT_WEBHOOK_TOKEN", before.token);
  }
};
const liveKey = "xnd_production_madeup0123456789";
const testKey = "xnd_development_madeup0123456789";
check("no key: simulated, a real listing may be bought unpaid", withEnv(undefined, undefined, () => !moneyIsReal(moneyNow()) && unpaidOrderAllowed(real, moneyNow())));
check("test key and token: simulated", withEnv(testKey, "tok", () => !moneyIsReal(moneyNow())));
check("live key and token: real, a real listing is refused", withEnv(liveKey, "tok", () => moneyIsReal(moneyNow()) && !unpaidOrderAllowed(real, moneyNow())));
check(
  "live key, webhook token empty: QRIS is off but money is still real, a real listing is refused",
  withEnv(liveKey, "", () => xenditConfig() === null && xenditKeyIsLive() && !unpaidOrderAllowed(real, moneyNow()))
);
check("live key, webhook token missing: the same", withEnv(liveKey, undefined, () => xenditConfig() === null && !unpaidOrderAllowed(real, moneyNow())));
check("live key with spaces around it is still live", withEnv(`  ${liveKey}\n`, "", () => xenditKeyIsLive()));
check("a test key is never live, token or not", withEnv(testKey, "", () => !xenditKeyIsLive()) && !xenditKeyIsLive(testKey));
check(
  "a wrong key pasted in (a public key, a typo) counts as real money, so the straight path stays shut",
  withEnv("xnd_public_madeup0123", "", () => xenditConfig() === null && xenditKeyIsLive() && !unpaidOrderAllowed(real, moneyNow())) && xenditKeyIsLive("xnd_prod_typo")
);
check("an empty or blank key is not live", !xenditKeyIsLive("") && !xenditKeyIsLive("   ") && !xenditKeyIsLive(undefined));

// Paying real rupiah (a live key) for a sample: a seed listing, one without a seller, or one without
// the ticket file it was checked from has no ticket to hand over (money and authorization audits).
const someone = "11111111-1111-1111-1111-111111111111";
const file = "ls-0123456789ab/ticket.pdf";
check("live key: a seed listing cannot be paid for", !paidListingAllowed({ id: seed, seller_id: someone, ticket_path: file }, false));
check("live key: a listing without a seller cannot be paid for", !paidListingAllowed({ id: real, seller_id: null, ticket_path: file }, false));
check("live key: a sample listing (no ticket file) cannot be paid for, whoever posted it", !paidListingAllowed({ id: real, seller_id: someone, ticket_path: null }, false));
check("live key: a real seller's listing with its file can", paidListingAllowed({ id: real, seller_id: someone, ticket_path: file }, false));
check("test key: any listing can, seed, sample and sellerless included", paidListingAllowed({ id: seed, seller_id: null, ticket_path: null }, true) && paidListingAllowed({ id: real, seller_id: null, ticket_path: null }, true));

// The seller penalty reads as charged only once something collects it (FEATURES.sellerPenalty),
// never because real payouts started: no code takes it yet (UX review 5 Nov 2026).
const note = (payouts: boolean, sellerPenalty: boolean) => penaltyNoteFor({ payouts, sellerPenalty });
check("test money: the penalty is recorded, not charged", /not charged/.test(note(false, false).en) && /tidak ditagih/.test(note(false, false).id));
check("payouts on, collection not built: the penalty is not collected yet", /not collected yet/.test(note(true, false).en) && /belum ditagih/.test(note(true, false).id));
check("collection built: the penalty needs no note", note(true, true).en === "" && note(true, true).id === "");
check("the site today says the penalty is not charged", PENALTY_NOTE.en !== "" && FEATURES.sellerPenalty === false);

// A show's own price ceiling (events.cap_pct): 150% unless the organiser's terms allow less, as
// N.Flying's forbid resale above the official price. A real show takes resale money once payments
// are live, so a price its organiser forbids must never reach the catalogue (tasks 12.7).
check("no ceiling set: 150% of face value, as before", capOf(null) === CAP_PCT && capOf({}) === CAP_PCT && priceBand(1_000_000).cap === 1_500_000 && inPriceBand(1_500_000, 1_000_000) && !inPriceBand(1_500_001, 1_000_000));
check("a show at face value: the ceiling is the face value", priceBand(1_400_000, 100).cap === 1_400_000 && inPriceBand(1_400_000, 1_400_000, 100) && !inPriceBand(1_400_001, 1_400_000, 100));
check("a show's ceiling never raises the 150% one", capOf({ capPct: 200 }) === CAP_PCT && priceBand(1_000_000, 200).cap === 1_500_000 && !inPriceBand(1_600_000, 1_000_000, 200));
check("the floor stays 50% under any ceiling", priceBand(1_000_000, 100).floor === 500_000 && !inPriceBand(499_999, 1_000_000, 100));
const shows = seedEvents();
const nflying = shows.find((e) => e.id === "ev-nflying-jakarta");
check("N.Flying's Jakarta show is held at face value, as Karalas Live's terms say", capOf(nflying) === 100, String(nflying?.capPct));
const over = SEED_LISTINGS.filter((l) => !inPriceBand(l.askPrice, l.faceValue, capOf(shows.find((e) => e.id === l.eventId))));
check("no seed listing sits outside its show's band", over.length === 0, over.map((l) => l.id).join(", "));

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
