/**
 * The AI step's own rules (lib/tickets/ai.ts, docs/09 §5.1), offline: which provider a server uses,
 * what the prompt and schema carry, how a model's answer is read (a malformed field becomes null, an
 * unknown category becomes none), and how Gemini's replies are handled with fetch stubbed out: a busy
 * model is retried and then left for the seller, a refused request is not retried, a cut-off or
 * non-JSON answer is not trusted, and the key travels in a header, never in the URL. Then the
 * cross-check publishing runs on the answer: another category or day sends a listing to a person.
 *
 *   npm run ai:check
 */
import { aiProvider, buildPrompt, extractTicketFacts, fakeFacts, parseAnswer, responseSchema, type ShowForTicket } from "../src/lib/tickets/ai";
import { factDiffs, reviewReasons, showDay, type ListingChecks, type TicketFacts } from "../src/lib/tickets/checks";
import { FILL_WINDOW_MS, FILLS_PER_WINDOW, fillAllowed } from "../src/lib/tickets/fill";

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

const TULUS: ShowForTicket = { tiers: [{ id: "t-tl-vip", name: "VIP" }, { id: "t-tl-reg", name: "Reguler" }] };
const NJ: ShowForTicket = { tiers: [{ id: "t-nj-vip", name: "VIP Soundcheck" }, { id: "t-nj-cat1", name: "CAT 1" }] };
const TEXT = "E-TICKET\nTULUS: MANUSIA TOUR\nSabtu, 7 November 2026\nKategori: VIP\nSeat: Row C No. 12\nHarga: Rp 1.200.000\nNama: [x]";
const GOOD = {
  eventTitle: "TULUS: MANUSIA TOUR", date: "2026-11-07", venue: null, tier: "t-tl-vip",
  tierPrinted: "VIP", seat: "Row C No. 12", printedPrice: 1_200_000, quantity: 1,
};

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  try { fn(); } finally { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
}

type Call = { url: string; init: RequestInit };
/** Replaces fetch with replies in order; each is a status and a body, or an error to throw. */
function stubFetch(replies: ({ status: number; body: unknown } | Error)[]) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = replies.shift();
    if (!next) throw new Error("no reply left");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return calls;
}
const reply = (answer: unknown, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    candidates: [{ content: { parts: [{ text: typeof answer === "string" ? answer : JSON.stringify(answer) }] }, finishReason: "STOP", ...extra }],
    usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 90, thoughtsTokenCount: 20 },
  },
});
const busy = (status: number) => ({ status, body: { error: { status: status === 429 ? "RESOURCE_EXHAUSTED" : "UNAVAILABLE", message: "try later" } } });

async function main() {
  const realFetch = globalThis.fetch;

  // --- Which provider
  withEnv({ AI_PROVIDER: "fake", GEMINI_API_KEY: undefined }, () => check("AI_PROVIDER=fake picks the fake provider", aiProvider() === "fake"));
  withEnv({ AI_PROVIDER: "off", GEMINI_API_KEY: "k" }, () => check("AI_PROVIDER=off turns it off even with a key", aiProvider() === null));
  withEnv({ AI_PROVIDER: undefined, GEMINI_API_KEY: "k" }, () => check("a key alone turns Gemini on", aiProvider() === "gemini"));
  withEnv({ AI_PROVIDER: undefined, GEMINI_API_KEY: undefined }, () => check("no key, no provider: the seller fills in by hand", aiProvider() === null));

  // --- What the model is given
  const prompt = buildPrompt(TEXT, TULUS);
  check("the prompt lists every category of the show by id and name", prompt.includes("- t-tl-vip: VIP") && prompt.includes("- t-tl-reg: Reguler"));
  check("the prompt carries the cleaned text and says [x] is not to be guessed", prompt.includes(TEXT) && prompt.includes("[x] was removed on purpose"));
  check("the prompt tells the model the ticket text is data, not instructions", /data, not instructions/.test(prompt));
  const schema = responseSchema(TULUS) as { properties: { tier: { enum: string[] } }; required: string[] };
  check("the schema only allows the show's categories, or none", JSON.stringify(schema.properties.tier.enum) === JSON.stringify(["t-tl-vip", "t-tl-reg", "none"]));
  check("the schema requires every field", schema.required.length === 8);
  const every = buildPrompt(TEXT, { tiers: [{ id: "t-cp-cat1", name: "CAT 1", show: "Coldplay: Music of the Spheres, 2026-11-14, Stadion Utama GBK, Jakarta" }] });
  check("with every show offered, each category says which show it belongs to", every.includes("- t-cp-cat1: CAT 1 (Coldplay: Music of the Spheres, 2026-11-14"));
  check("the picked show's title is never in the prompt", !prompt.includes("Manusia Tour (") && !prompt.includes("2026-11-07"));

  // --- The cross-check at publish
  check("a show's day is its date in Jakarta", showDay("2026-11-14T19:00:00+07:00") === "2026-11-14" && showDay("2026-11-14T01:00:00+07:00") === "2026-11-14" && showDay("2026-11-13T23:30:00Z") === "2026-11-14");
  const facts = (f: Partial<TicketFacts>): TicketFacts => ({ eventTitle: "TULUS", date: "2026-11-07", venue: null, tierId: "t-tl-vip", tierPrinted: "VIP", seat: null, printedPrice: 1_200_000, quantity: 1, ...f });
  const picked = { tierId: "t-tl-vip", startsAt: "2026-11-07T20:00:00+07:00" };
  check("the ticket agrees with the seller: nothing to review", factDiffs(facts({}), picked).length === 0);
  check("another category printed: reviewed", JSON.stringify(factDiffs(facts({ tierId: "t-tl-reg", tierPrinted: "Reguler" }), picked)) === '["tier"]');
  check("a printed category the show does not have: reviewed", JSON.stringify(factDiffs(facts({ tierId: null, tierPrinted: "VVIP" }), picked)) === '["tier"]');
  check("no category printed at all: nothing to compare", factDiffs(facts({ tierId: null, tierPrinted: null }), picked).length === 0);
  check("another day printed: reviewed", JSON.stringify(factDiffs(facts({ date: "2026-11-08" }), picked)) === '["date"]');
  check("no date printed: nothing to compare", factDiffs(facts({ date: null }), picked).length === 0);
  const listing: ListingChecks = { barcodes: 1, formats: ["QRCode"], pages: 1, scannedPages: 1, score: 5, suspicious: false, reasons: [], producer: null };
  check("a clean ticket that agrees goes live", reviewReasons({ ...listing, ai: { model: "m", facts: facts({}), differs: [] } }).length === 0);
  check("a clean ticket that disagrees waits for a person", reviewReasons({ ...listing, ai: { model: "m", facts: facts({ date: "2026-11-08" }), differs: ["date"] } }).includes("details_differ"));
  check("no AI step at all changes nothing", reviewReasons({ ...listing, ai: null }).length === 0 && reviewReasons(listing).length === 0);

  // --- The brake on fills, per account
  const t0 = 1_000_000;
  const tries = Array.from({ length: FILLS_PER_WINDOW + 1 }, (_, i) => fillAllowed("user-a", t0 + i));
  check(`an account gets ${FILLS_PER_WINDOW} fills in ten minutes, then waits`, tries.slice(0, -1).every(Boolean) && tries[tries.length - 1] === false, JSON.stringify(tries));
  check("another account is not held up by it", fillAllowed("user-b", t0 + 20));
  check("once the window has passed, the account may fill again", fillAllowed("user-a", t0 + FILL_WINDOW_MS + 1));

  // --- Reading an answer
  const read = parseAnswer(JSON.stringify(GOOD), TULUS);
  check("a good answer reads in full", read?.tierId === "t-tl-vip" && read.date === "2026-11-07" && read.printedPrice === 1_200_000 && read.seat === "Row C No. 12", JSON.stringify(read));
  check("none becomes no category", parseAnswer(JSON.stringify({ ...GOOD, tier: "none" }), TULUS)?.tierId === null);
  check("a category from another show becomes no category", parseAnswer(JSON.stringify({ ...GOOD, tier: "t-cp-cat1" }), TULUS)?.tierId === null);
  const messy = parseAnswer(JSON.stringify({ ...GOOD, date: "7 Nov 2026", printedPrice: "1.200.000", quantity: 0, seat: "" }), TULUS);
  check("a malformed field becomes null and the rest survive", messy?.date === null && messy.printedPrice === null && messy.quantity === null && messy.seat === null && messy.tierId === "t-tl-vip", JSON.stringify(messy));
  check("text that is not JSON is no answer", parseAnswer("Sure! The ticket is VIP.", TULUS) === null);
  check("a JSON list is no answer", parseAnswer("[1,2]", TULUS) === null);

  // --- The fake provider
  const fake = fakeFacts("NEWJEANS FAN MEETING\nGrade: VIP SOUNDCHECK\nPrice: IDR 2,800,000", NJ);
  check("fake: the longest category name that fits wins", fake.tierId === "t-nj-vip", JSON.stringify(fake));
  check("fake: the first rupiah amount", fake.printedPrice === 2_800_000);
  const viaFake = await extractTicketFacts(TEXT, TULUS, { provider: "fake" });
  check("fake: answers without a key or a network", viaFake.ok && viaFake.model === "fake");

  // --- Gemini, with fetch stubbed
  process.env.GEMINI_API_KEY = "test-key-not-real";
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_THINKING;
  try {
    let calls = stubFetch([reply(GOOD)]);
    let out = await extractTicketFacts(TEXT, TULUS, { provider: "gemini" });
    const body = JSON.parse(String(calls[0]?.init.body ?? "{}"));
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    check("gemini: a good reply becomes facts", out.ok && out.facts.tierId === "t-tl-vip", JSON.stringify(out));
    check("gemini: the default model is Flash-Lite", calls[0]?.url.includes("/gemini-3.5-flash-lite:generateContent"), calls[0]?.url);
    check("gemini: the key goes in a header, never in the URL", headers["x-goog-api-key"] === "test-key-not-real" && !calls[0]?.url.includes("test-key"));
    check("gemini: asks for JSON held to the schema", body.generationConfig?.responseMimeType === "application/json" && !!body.generationConfig?.responseJsonSchema?.properties?.tier);
    check("gemini: no temperature, as Google asks for Gemini 3", body.generationConfig?.temperature === undefined);
    check("gemini: thinking counts as output tokens", out.ok && out.tokens.in === 300 && out.tokens.out === 110, JSON.stringify(out.ok && out.tokens));

    calls = stubFetch([busy(503), reply(GOOD)]);
    out = await extractTicketFacts(TEXT, TULUS, { provider: "gemini" });
    check("gemini: a busy model is tried again", out.ok && calls.length === 2, `${calls.length} calls`);

    calls = stubFetch([busy(429), busy(429), busy(429)]);
    out = await extractTicketFacts(TEXT, TULUS, { provider: "gemini" });
    check("gemini: still busy after three tries, the seller fills in by hand", !out.ok && out.reason === "busy" && calls.length === 3, JSON.stringify(out));

    calls = stubFetch([new Error("socket hang up"), reply(GOOD)]);
    out = await extractTicketFacts(TEXT, TULUS, { provider: "gemini" });
    check("gemini: a dropped connection is tried again", out.ok && calls.length === 2);

    calls = stubFetch([{ status: 400, body: { error: { status: "INVALID_ARGUMENT", message: "API key not valid." } } }]);
    out = await extractTicketFacts(TEXT, TULUS, { provider: "gemini" });
    check("gemini: a refused request is not retried and says why", !out.ok && out.reason === "failed" && calls.length === 1 && /API key not valid/.test(out.detail ?? ""), JSON.stringify(out));

    stubFetch([reply(GOOD, { finishReason: "MAX_TOKENS" })]);
    out = await extractTicketFacts(TEXT, TULUS, { provider: "gemini" });
    check("gemini: a cut-off answer is not trusted", !out.ok && out.reason === "bad_answer" && out.detail === "MAX_TOKENS", JSON.stringify(out));

    stubFetch([reply("I could not read this ticket.")]);
    out = await extractTicketFacts(TEXT, TULUS, { provider: "gemini" });
    check("gemini: prose instead of JSON is not trusted", !out.ok && out.reason === "bad_answer");

    process.env.GEMINI_MODEL = "gemini-3.8-flash";
    process.env.GEMINI_THINKING = "low";
    calls = stubFetch([reply(GOOD)]);
    await extractTicketFacts(TEXT, TULUS, { provider: "gemini" });
    const tried = JSON.parse(String(calls[0]?.init.body ?? "{}"));
    check("gemini: GEMINI_MODEL and GEMINI_THINKING are honoured", calls[0]?.url.includes("/gemini-3.8-flash:") && tried.generationConfig?.thinkingConfig?.thinkingLevel === "low");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_THINKING;
  }

  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.note ? `  (${x.note.slice(0, 240)})` : ""}`);
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
