/**
 * How well a model reads tickets, and what leaves for it (docs/09 §5.1). Each made-up ticket in
 * ai-eval-cases.ts goes through the same cleaner as a real upload, then to the model with the show's
 * categories, and each field is scored against what the ticket really holds. Every request that
 * leaves this machine is caught on its way out and every string in it searched for the case's
 * personal values, so a run passes only when the readings are right and nothing personal was sent.
 * Prints accuracy per field, time and tokens per ticket, and what a thousand tickets would cost.
 *
 *   npm run ai:eval                                    # Claude: CLAUDE_MODEL, else claude-haiku-5-5
 *   npm run ai:eval -- --all-shows                     # every show offered, as the sell page asks
 *   npm run ai:eval -- --pdf lines                     # through a PDF, pdf.js and the QR decoder
 *   npm run ai:eval -- --pdf table                     # the same, laid out as a table
 *   npm run ai:eval -- --repeat 3                      # the whole set three times, for drift
 *   npm run ai:eval -- --provider gemini               # GEMINI_MODEL, else gemini-3.5-flash-lite
 *   npm run ai:eval -- --model claude-sonnet-5-5
 *   npm run ai:eval -- --provider fake                 # offline, no key
 *   npm run ai:eval -- --only wtf-3day-range --show    # one case, with the text the model reads
 *
 * The key comes from the environment, else from ~/.lummy/production.env (it is never printed). The
 * cases are invented, so a free-tier Gemini key may read them (docs/config/01).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { cleanTicketText, type CleanResult } from "../src/lib/tickets/clean";
import { prepareForExtraction } from "../src/lib/tickets/extract";
import { DEFAULT_CLAUDE_MODEL, DEFAULT_GEMINI_MODEL, extractTicketFacts, type Provider, type TicketFacts } from "../src/lib/tickets/ai";
import { CASES, SHOWS, SHOW_LABEL, type EvalCase } from "./ai-eval-cases";
import { casePdf, type Layout } from "./ai-pdf";
import { initWriter } from "./ticket-fixtures";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const provider = (arg("provider") ?? "claude") as Provider;
const only = arg("only");
const show = process.argv.includes("--show");
const pdf = arg("pdf") as Layout | undefined;
const repeat = Math.max(1, Number(arg("repeat") ?? 1));
// The sell page offers every show on sale, so the model finds the show as well as the category.
const allShows = process.argv.includes("--all-shows");
const EVERY_SHOW = {
  tiers: (Object.keys(SHOWS) as (keyof typeof SHOWS)[]).flatMap((k) => SHOWS[k].map((t) => ({ ...t, show: SHOW_LABEL[k] }))),
};

// Only this provider's own lines are read from the file; nothing else in it is loaded.
const KEYS: Partial<Record<Provider, { key: string; lines: RegExp }>> = {
  claude: { key: "ANTHROPIC_API_KEY", lines: /^(ANTHROPIC_API_KEY|CLAUDE_[A-Z_]+)=(.*)$/ },
  gemini: { key: "GEMINI_API_KEY", lines: /^(GEMINI_[A-Z_]+)=(.*)$/ },
};
const needs = KEYS[provider];
if (needs && !process.env[needs.key]) {
  try {
    for (const line of readFileSync(`${homedir()}/.lummy/production.env`, "utf8").split("\n")) {
      const m = needs.lines.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // No file: the check below says what is missing.
  }
}
if (needs && !process.env[needs.key]) {
  console.error(`No ${needs.key}: set it with web/scripts/set-secret.sh (docs/config/01), or run with --provider fake.`);
  process.exit(1);
}
const model =
  provider === "fake" ? "fake"
  : provider === "claude" ? (arg("model") ?? (process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL))
  : (arg("model") ?? (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL));
// Gemini's free tier counts requests per minute; a pause keeps a run of the whole set under that.
const gapMs = Number(arg("gap") ?? (provider === "gemini" ? 4_000 : 0));

/**
 * US$ per million tokens, in and out, before tax: Claude's for prompts of 100K tokens or fewer
 * (checked 20 Oct 2026), Gemini's on its paid tier (checked 12 Oct 2026).
 */
const PRICE: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "gemini-3.5-flash-lite": [0.3, 2.5],
  "gemini-3.8-flash": [0.75, 3.75],
};
const IDR_PER_USD = 16_500;

// Every request that leaves, caught on its way out: each string in its body, whatever the provider
// calls the field, and its URL are what the model is really sent. A body this cannot read stops the run.
const sent: string[] = [];
let requests = 0;
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  const body = init?.body ?? null;
  if (body !== null && typeof body !== "string") throw new Error(`a request to ${new URL(url).host} left with a body this audit cannot read`);
  requests++;
  sent.push([url, ...(body ? strings(JSON.parse(body)) : [])].join("\n"));
  return realFetch(input, init);
}) as typeof fetch;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The case's personal values found in `text`: each whole, and each word of a name on its own. */
function leaks(text: string, c: EvalCase) {
  const found = new Set<string>();
  for (const s of [...(c.secrets ?? []), ...(c.names ?? [])]) {
    if (text.toLowerCase().includes(s.toLowerCase())) found.add(s);
    if (/^[\p{L} ]+$/u.test(s)) for (const w of s.split(/\s+/)) if (w.length >= 4 && new RegExp(`\\b${escapeRe(w)}\\b`, "i").test(text)) found.add(w);
  }
  return [...found];
}

const norm = (s: string | null) => (s ?? "").toLowerCase();
const seatOk = (want: string[] | null, got: string | null) => {
  if (want === null) return got === null || got.trim() === "";
  const tokens = norm(got).split(/[^a-z0-9]+/).filter(Boolean);
  return want.every((w) => tokens.includes(w));
};

type Field = "tier" | "date" | "price" | "quantity" | "seat" | "title";
const FIELDS: Field[] = ["tier", "date", "price", "quantity", "seat", "title"];
function score(c: EvalCase, f: TicketFacts): Record<Field, boolean> {
  const e = c.expect!;
  return {
    tier: f.tierId === (allShows && e.tierIdAllShows !== undefined ? e.tierIdAllShows : e.tierId),
    date: f.date === e.date,
    price: e.printedPrice.includes(f.printedPrice),
    quantity: (f.quantity ?? 1) === e.quantity,
    seat: seatOk(e.seat, f.seat),
    title: norm(f.eventTitle).includes(e.title),
  };
}

/** What would leave for the model: the cleaned text of the case, read from its text or from its PDF. */
async function cleaned(c: EvalCase): Promise<CleanResult> {
  if (!pdf) return cleanTicketText({ pages: c.pages, payloads: c.payloads ?? [], names: c.names ?? [] });
  return prepareForExtraction(await casePdf(c, pdf), c.names ?? []);
}

type Outcome = { id: string; right: boolean; fields?: Record<Field, boolean>; leaked: string[]; note?: string; ms?: number; tokens?: { in: number; out: number } };

async function runOnce(cases: EvalCase[]): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const [i, c] of cases.entries()) {
    const clean = await cleaned(c);
    if (c.refused) {
      const right = !clean.ok && clean.reason === c.refused;
      out.push({ id: c.id, right, leaked: [], note: right ? `stopped: ${c.refused}` : `not stopped (${clean.ok ? "sent" : clean.reason})` });
      console.log(`${right ? "OK  " : "MISS"}  ${c.id.padEnd(40)} ${right ? "stopped before sending" : "should have been stopped"}`);
      continue;
    }
    if (!clean.ok) {
      out.push({ id: c.id, right: false, leaked: [], note: `the cleaner refused it: ${clean.reason}${clean.left ? ` (${clean.left.join(", ")})` : ""}` });
      console.log(`MISS  ${c.id.padEnd(40)} cleaner: ${clean.reason}`);
      continue;
    }
    if (i > 0 && gapMs) await new Promise((r) => setTimeout(r, gapMs));
    if (show) console.log(`--- ${c.id}: what the model reads ---\n${clean.text}\n---`);
    const before = sent.length;
    const res = await extractTicketFacts(clean.text, allShows ? EVERY_SHOW : { tiers: [...SHOWS[c.show]] }, { provider, model });
    const leaked = [...new Set([...leaks(clean.text, c), ...sent.slice(before).flatMap((p) => leaks(p, c))])];
    if (!res.ok) {
      out.push({ id: c.id, right: false, leaked, note: `no answer: ${res.reason}${res.detail ? ` (${res.detail})` : ""}` });
      console.log(`MISS  ${c.id.padEnd(40)} no answer: ${res.reason} ${res.detail ?? ""}`);
      continue;
    }
    const fields = score(c, res.facts);
    const wrong = FIELDS.filter((k) => !fields[k]);
    const right = !wrong.length && !leaked.length;
    const notes = [
      ...wrong.map((k) => `${k} ${JSON.stringify(k === "tier" ? res.facts.tierId : k === "price" ? res.facts.printedPrice : k === "title" ? res.facts.eventTitle : res.facts[k])}`),
      ...leaked.map((l) => `LEAKED ${JSON.stringify(l)}`),
    ];
    out.push({ id: c.id, right, fields, leaked, note: notes.join(", "), ms: res.ms, tokens: res.tokens });
    console.log(`${right ? "OK  " : "MISS"}  ${c.id.padEnd(40)} ${String(res.ms).padStart(6)} ms  ${notes.join(", ")}`);
    if (show) console.log(JSON.stringify(res.facts));
  }
  return out;
}

async function main() {
  if (pdf) await initWriter();
  const cases = CASES.filter((c) => !only || c.id === only);
  const mode = [allShows ? "every show offered" : "the picked show's categories", pdf ? `through a PDF (${pdf})` : "from text"].join(", ");
  console.log(`${model}: ${cases.length} made-up tickets, ${mode}${repeat > 1 ? `, ${repeat} runs` : ""}\n`);

  const runs: Outcome[][] = [];
  for (let r = 0; r < repeat; r++) {
    if (repeat > 1) console.log(`--- run ${r + 1} of ${repeat}`);
    runs.push(await runOnce(cases));
  }

  const all = runs.flat();
  const read = all.filter((o) => o.fields);
  const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "-");
  console.log("");
  runs.forEach((run, r) => console.log(`run ${r + 1}: right on ${run.filter((o) => o.right).length}/${run.length}`));
  console.log(`per field: ${FIELDS.map((k) => `${k} ${pct(read.filter((o) => o.fields![k]).length, read.length)}`).join(", ")}`);
  const leakedCases = all.filter((o) => o.leaked.length);
  console.log(
    leakedCases.length
      ? `PERSONAL DATA SENT in ${leakedCases.length} reading(s)`
      : `nothing personal sent: all ${requests} requests that left searched for each case's names, numbers and codes`
  );
  const timed = all.filter((o) => o.ms !== undefined);
  if (timed.length) {
    const sorted = timed.map((o) => o.ms!).sort((a, b) => a - b);
    const tokIn = timed.reduce((s, o) => s + o.tokens!.in, 0) / timed.length;
    const tokOut = timed.reduce((s, o) => s + o.tokens!.out, 0) / timed.length;
    console.log(`time per ticket: median ${sorted[Math.floor(sorted.length / 2)]} ms, slowest ${sorted[sorted.length - 1]} ms`);
    console.log(`tokens per ticket: ${Math.round(tokIn)} in, ${Math.round(tokOut)} out`);
    const p = PRICE[model];
    if (p) {
      const usd = (tokIn * p[0] + tokOut * p[1]) / 1e6;
      console.log(`paid: about Rp${Math.round(usd * IDR_PER_USD)} per ticket, Rp${Math.round(usd * IDR_PER_USD * 1000).toLocaleString("id-ID")} per 1,000 tickets, before tax`);
    }
  }
  const wrong = all.filter((o) => !o.right);
  if (wrong.length) console.log("\nnot right:\n  " + wrong.map((o) => `${o.id}: ${o.note}`).join("\n  "));
  process.exit(wrong.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
