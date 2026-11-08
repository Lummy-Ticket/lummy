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
import { englishFor, errorBody } from "../src/lib/route-errors";
import { FRESH_SIGN_IN_MINUTES, freshSignIn, isPayoutBank, payoutNumberOf, signedInAt } from "../src/lib/profile/payout";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

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

// Every error a buyer or seller can meet on the way to paying (checkout, payments, orders, listings,
// the ticket reader) reads in English on an English page (UX review 5 Nov 2026, decision 6): each
// literal message those routes send, and the shared ones they pass on, has its English in
// lib/route-errors.ts. A placeholder in a template message stands for any number or reason.
const src = (f: string) => readFileSync(path.join(__dirname, "..", f), "utf8");
const bilingual = [
  "src/app/api/orders/route.ts", "src/app/api/orders/[id]/route.ts", "src/app/api/orders/[id]/ticket/route.ts",
  "src/app/api/orders/[id]/evidence/route.ts", "src/app/api/orders/[id]/pass/route.ts", "src/app/api/payments/route.ts",
  "src/app/api/payments/[id]/route.ts", "src/app/api/payments/[id]/usdc/route.ts", "src/app/api/listings/route.ts",
  "src/app/api/listings/[id]/route.ts", "src/app/api/listings/[id]/ticket/route.ts", "src/app/api/tickets/check/route.ts",
  "src/app/api/tickets/extract/route.ts", "src/lib/orders/create.ts", "src/lib/payments/checkout.ts",
  "src/app/api/profile/payout/route.ts",
];
const literal = (s: string) => s.replace(/\$\{[^}]*\}/g, "8");
const messages = new Set<string>();
for (const f of bilingual) for (const m of src(f).matchAll(/fail\(\s*\d+\s*,\s*(?:"([^"]+)"|`([^`]+)`)/g)) messages.add(literal(m[1] ?? m[2]));
const block = (f: string, name: string) => src(f).match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`))?.[1] ?? "";
for (const [f, name] of [["src/lib/rate.ts", "RATE_REFUSED"], ["src/lib/tickets/server.ts", "TICKET_ERRORS"]] as const) {
  for (const m of block(f, name).matchAll(/:\s*(?:"([^"]+)"|`([^`]+)`)/g)) messages.add(literal(m[1] ?? m[2]));
}
const duplicate = src("src/app/api/listings/route.ts").match(/const DUPLICATE = "([^"]+)"/)?.[1];
if (duplicate) messages.add(duplicate);
const untranslated = [...messages].filter((m) => !englishFor(m));
check(`every one of the ${messages.size} errors of checkout, payments, orders, listings and the ticket reader has its English`, messages.size > 90 && untranslated.length === 0, untranslated.join(" | ") || `only ${messages.size} found`);
check("an error body carries both languages, and a message without English still goes out", errorBody("masuk dulu").error_en === "sign in first" && errorBody("permission denied for table x").error_en === undefined);
check("a message with a number keeps it", englishFor("satu akun paling banyak punya 3 listing yang tayang atau direview") === "one account can have at most 3 listings live or in review");

// The payout account changes only with a sign-in made in the last minutes (audit M7): a session
// stolen earlier, or refreshed for days, cannot send a seller's money elsewhere.
const now = Date.UTC(2026, 10, 7, 12, 0, 0);
const at = (minutesAgo: number) => ({ amr: [{ method: "otp", timestamp: Math.floor((now - minutesAgo * 60_000) / 1000) }] });
check("payout: a sign-in 5 minutes ago may change the account", freshSignIn(signedInAt(at(5)), now));
check(`payout: one ${FRESH_SIGN_IN_MINUTES + 1} minutes ago may not`, !freshSignIn(signedInAt(at(FRESH_SIGN_IN_MINUTES + 1)), now));
check("payout: a token that does not say when it signed in may not", !freshSignIn(signedInAt({}), now) && !freshSignIn(signedInAt({ amr: ["otp"] }), now) && !freshSignIn(signedInAt(null), now));
check("payout: the latest of several sign-in methods counts", signedInAt({ amr: [{ method: "otp", timestamp: 100 }, { method: "totp", timestamp: 200 }] }) === 200_000);
check("payout: a sign-in dated in the future does not count", !freshSignIn(signedInAt(at(-5)), now));
check("payout: only a known bank, and 6 to 20 digits with spaces taken out", isPayoutBank("BCA") && !isPayoutBank("bca") && !isPayoutBank("Jago") && payoutNumberOf("1234 5678 90") === "1234567890" && payoutNumberOf("12345") === null && payoutNumberOf("12345678901234567890123") === null && payoutNumberOf("12a456789") === null);

// Task 4.7: an ID card never goes to an AI. Only the cleaned text of the ticket PDF does
// (lib/tickets/clean.ts), and the show request research sends the show's details alone. So no file
// that talks to a model, directly or through the two modules that do, may touch where ID cards are
// kept: the `ktp` bucket or the ktp_assets table. Checked on the source, so it holds the day the
// seller's ID card (FEATURES.sellerIdCard) is built, not only while it is off.
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? sourceFiles(path.join(dir, d.name)) : /\.(ts|tsx)$/.test(d.name) ? [path.join(dir, d.name)] : []
  );
const srcRoot = path.join(__dirname, "..", "src");
const TALKS_TO_AI = /from\s+["'](?:@anthropic-ai\/sdk|@google\/genai|@google\/generative-ai|@\/lib\/tickets\/ai|@\/lib\/events\/research|\.\/ai|\.\/research)["']/;
const TOUCHES_ID_CARDS = /ktp_assets|\.from\(\s*["']ktp["']\s*\)|bucket(?:Id|_id)?\s*[:=]\s*["']ktp["']/;
const aiFiles = sourceFiles(srcRoot)
  .filter((f) => !f.includes(`${path.sep}supabase${path.sep}types.ts`))
  .filter((f) => TALKS_TO_AI.test(readFileSync(f, "utf8")));
const leaking = aiFiles.filter((f) => TOUCHES_ID_CARDS.test(readFileSync(f, "utf8"))).map((f) => path.relative(srcRoot, f));
check(`4.7: the code that calls an AI (${aiFiles.length} files) never touches the ID card store`, aiFiles.length >= 3 && leaking.length === 0, leaking.join(", ") || `only ${aiFiles.length} files call an AI: the pattern no longer finds them`);

// The staff test email (api/admin/email-test): it names what the server is missing, and refuses an
// address that cannot receive mail before it opens any connection. Offline: no address here is ever
// sent to, and with the settings unset it stops before the mail server.
async function emailTest() {
  const { sendTestEmail } = await import("../src/lib/email/send");
  const names = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"] as const;
  const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    for (const n of names) delete process.env[n];
    const unset = await sendTestEmail("someone@gmail.com");
    check(
      "email test: with no mail settings it names each one missing and sends nothing",
      !unset.ok && ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"].every((n) => unset.reason.includes(n)),
      JSON.stringify(unset)
    );
    Object.assign(process.env, { SMTP_HOST: "smtp.invalid", SMTP_PORT: "465", SMTP_USER: "u@lummy.id", SMTP_PASSWORD: "not-real", MAIL_FROM: "Lummy <u@lummy.id>" });
    const example = await sendTestEmail("staff@example.com");
    const demo = await sendTestEmail("admin@demo.lummy.id");
    check(
      "email test: an example or demo address is refused before any connection",
      !example.ok && !demo.ok && example.reason === "alamat ini tidak bisa menerima email" && demo.reason === example.reason,
      JSON.stringify({ example, demo })
    );
  } finally {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  }

  // The payout account email (audit M7), the one email:check does not send. It is given the last four
  // digits only (lib/email/notify.ts cuts them from the number); here: it names the bank and those
  // digits, leads with Indonesian, links back to the profile, and has no em-dash.
  const { payoutChanged } = await import("../src/lib/email/templates");
  const m = payoutChanged({ bank: "BCA", last4: "7890", at: "2026-11-08T04:00:00Z" });
  check(
    "payout email: names the bank and the last four digits, Indonesian first, links to the profile",
    m.subject.startsWith("Rekening pencairanmu diganti") && m.text.includes("BCA") && m.text.includes("...7890") && m.html.includes("/profile") && m.text.includes("/profile"),
    m.subject
  );
  check("payout email: no em-dash", !/—/.test(m.text + m.html + m.subject));
}
emailTest()
  .catch((e) => check("email test: the checks ran", false, e instanceof Error ? e.message : String(e)))
  .finally(() => {
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks pass`);
    process.exit(failed ? 1 : 0);
  });
