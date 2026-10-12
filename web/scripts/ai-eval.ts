/**
 * How well a model reads tickets (docs/09 §5.1): each made-up ticket in ai-eval-cases.ts goes
 * through the same cleaner as a real upload, then to the model with that show's categories, and
 * each field is scored against the answer the ticket really holds. Prints accuracy per field, time
 * and tokens per ticket, and what a thousand tickets would cost on the paid tier.
 *
 *   npm run ai:eval                                    # GEMINI_MODEL, else gemini-3.5-flash-lite
 *   npm run ai:eval -- --model gemini-3.8-flash
 *   npm run ai:eval -- --provider fake                 # offline, no key
 *   npm run ai:eval -- --only wtf-3day-range --show    # one case, with the text the model reads
 *   npm run ai:eval -- --all-shows                     # every show offered, as the sell page asks
 *
 * The key comes from GEMINI_API_KEY, else from the GEMINI_ lines of ~/.lummy/production.env (it is
 * never printed). The cases are invented, so a free-tier key may read them (docs/config/01).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { cleanTicketText } from "../src/lib/tickets/clean";
import { DEFAULT_GEMINI_MODEL, extractTicketFacts, type Provider, type TicketFacts } from "../src/lib/tickets/ai";
import { CASES, SHOWS, SHOW_LABEL, type EvalCase } from "./ai-eval-cases";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const provider = (arg("provider") ?? "gemini") as Provider;
const only = arg("only");
const show = process.argv.includes("--show");
// The sell page offers every show on sale, so the model finds the show as well as the category.
const allShows = process.argv.includes("--all-shows");
const EVERY_SHOW = {
  tiers: (Object.keys(SHOWS) as (keyof typeof SHOWS)[]).flatMap((k) => SHOWS[k].map((t) => ({ ...t, show: SHOW_LABEL[k] }))),
};

if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
  try {
    for (const line of readFileSync(`${homedir()}/.lummy/production.env`, "utf8").split("\n")) {
      const m = /^(GEMINI_[A-Z_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // No file: the check below says what is missing.
  }
}
if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
  console.error("No GEMINI_API_KEY: set it with web/scripts/set-secret.sh (docs/config/01), or run with --provider fake.");
  process.exit(1);
}
const model = provider === "fake" ? "fake" : (arg("model") ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL);
// Free tiers count requests per minute; a pause keeps a run of the whole set under that.
const gapMs = provider === "fake" ? 0 : Number(arg("gap") ?? 4_000);

/** US$ per million tokens on the paid tier, in and out (checked 12 Oct 2026, docs/config/01). */
const PRICE: Record<string, [number, number]> = {
  "gemini-3.5-flash-lite": [0.3, 2.5],
  "gemini-3.8-flash": [0.75, 3.75],
};
const IDR_PER_USD = 16_500;

const norm = (s: string | null) => (s ?? "").toLowerCase();
const seatOk = (want: string[] | null, got: string | null) => {
  if (want === null) return got === null || got.trim() === "";
  const tokens = norm(got).split(/[^a-z0-9]+/).filter(Boolean);
  return want.every((w) => tokens.includes(w));
};

type Score = Record<"tier" | "date" | "price" | "quantity" | "seat" | "title", boolean>;
const score = (c: EvalCase, f: TicketFacts): Score => ({
  tier: f.tierId === (allShows && c.expect.tierIdAllShows !== undefined ? c.expect.tierIdAllShows : c.expect.tierId),
  date: f.date === c.expect.date,
  price: c.expect.printedPrice.includes(f.printedPrice),
  quantity: (f.quantity ?? 1) === c.expect.quantity,
  seat: seatOk(c.expect.seat, f.seat),
  title: norm(f.eventTitle).includes(c.expect.title),
});

async function main() {
  const cases = CASES.filter((c) => !only || c.id === only);
  console.log(`${model}: ${cases.length} made-up tickets, ${allShows ? "every show offered" : "the picked show's categories"}\n`);

  const totals: Record<keyof Score, number> = { tier: 0, date: 0, price: 0, quantity: 0, seat: 0, title: 0 };
  let answered = 0;
  let allRight = 0;
  const ms: number[] = [];
  let tokIn = 0;
  let tokOut = 0;
  const failures: string[] = [];

  for (const [i, c] of cases.entries()) {
    if (i > 0 && gapMs) await new Promise((r) => setTimeout(r, gapMs));
    const clean = cleanTicketText({ pages: c.pages, payloads: c.payloads ?? [], names: c.names ?? [] });
    if (!clean.ok) {
      failures.push(`${c.id}: the cleaner refused it (${clean.reason}${clean.left ? ": " + clean.left.join(", ") : ""})`);
      console.log(`SKIP  ${c.id}  cleaner: ${clean.reason}`);
      continue;
    }
    if (show) console.log(`--- ${c.id}: what the model reads ---\n${clean.text}\n---`);
    const out = await extractTicketFacts(clean.text, allShows ? EVERY_SHOW : { tiers: [...SHOWS[c.show]] }, { provider, model });
    if (!out.ok) {
      failures.push(`${c.id}: ${out.reason}${out.detail ? " (" + out.detail + ")" : ""}`);
      console.log(`FAIL  ${c.id}  no answer: ${out.reason} ${out.detail ?? ""}`);
      continue;
    }
    answered++;
    ms.push(out.ms);
    tokIn += out.tokens.in;
    tokOut += out.tokens.out;
    const s = score(c, out.facts);
    const wrong = (Object.keys(s) as (keyof Score)[]).filter((k) => !s[k]);
    for (const k of Object.keys(s) as (keyof Score)[]) if (s[k]) totals[k]++;
    if (!wrong.length) allRight++;
    else failures.push(`${c.id}: ${wrong.map((k) => `${k} ${JSON.stringify(k === "tier" ? out.facts.tierId : k === "price" ? out.facts.printedPrice : k === "title" ? out.facts.eventTitle : out.facts[k])}`).join(", ")}`);
    console.log(`${wrong.length ? "MISS" : "OK  "}  ${c.id.padEnd(36)} ${String(out.ms).padStart(6)} ms  ${wrong.length ? "wrong: " + wrong.join(", ") : ""}`);
    if (show) console.log(JSON.stringify(out.facts));
  }

  const pct = (n: number) => (answered ? `${Math.round((100 * n) / answered)}%` : "-");
  console.log(`\nanswered ${answered}/${cases.length}, every field right on ${allRight}`);
  console.log(`per field: tier ${pct(totals.tier)}, date ${pct(totals.date)}, price ${pct(totals.price)}, quantity ${pct(totals.quantity)}, seat ${pct(totals.seat)}, title ${pct(totals.title)}`);
  if (ms.length) {
    const sorted = [...ms].sort((a, b) => a - b);
    console.log(`time per ticket: median ${sorted[Math.floor(sorted.length / 2)]} ms, slowest ${sorted[sorted.length - 1]} ms`);
    console.log(`tokens per ticket: ${Math.round(tokIn / ms.length)} in, ${Math.round(tokOut / ms.length)} out`);
    const p = PRICE[model];
    if (p) {
      const usd = (tokIn * p[0] + tokOut * p[1]) / 1e6 / ms.length;
      console.log(`paid tier: about Rp${Math.round(usd * IDR_PER_USD)} per ticket, Rp${Math.round(usd * IDR_PER_USD * 1000).toLocaleString("id-ID")} per 1,000 tickets`);
    }
  }
  if (failures.length) console.log("\nnot right:\n  " + failures.join("\n  "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
