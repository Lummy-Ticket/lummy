// The AI research step for a show request (tasks 12.1; meetings of 22 and 28 Oct 2026): Claude with
// web search and web fetch looks for the show's official page or promoter, its ticket categories and
// official prices, and the terms the tickets are sold under on resale and names, each with the link
// it came from. It decides nothing: staff open the sources, check them and approve or reject, as on
// 7 Nov 2026 when the January catalogue was researched by hand. Run on a staff click only, so it
// costs nothing until someone asks, and within a route's time. Server only.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

if (typeof window !== "undefined") throw new Error("lib/events/research is server-only");

/** The default model; CLAUDE_RESEARCH_MODEL can name another. */
export const DEFAULT_RESEARCH_MODEL = "claude-opus-5-5";
/** Searches and page reads one research may make, which bounds its time and cost. */
export const MAX_SEARCHES = 6;
export const MAX_FETCHES = 4;
const MAX_TOKENS = 8000;
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

/** What the request says about the show. The seller's name and free-text note are never sent. */
export type RequestForResearch = {
  title: string;
  startsAt: string;
  venue: string;
  city: string;
  country: string;
  currency: "IDR" | "USDC";
  organizerRef: string;
  pdfTier: string;
  printedPrice: number | null;
};

const https = z.string().transform((s) => {
  try {
    const u = new URL(s.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.toString().slice(0, 500) : "";
  } catch {
    return "";
  }
});
const line = (max: number) => z.string().transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max));

const Findings = z.object({
  official_url: https,
  matches_request: z.boolean(),
  show: z.object({ title: line(160), date: line(10), start_time: line(5), venue: line(120), city: line(80) }),
  tiers: z
    .array(z.object({ name: line(80), price: z.number().finite().min(0).max(1e9), source: https }))
    .transform((t) => t.filter((x) => x.name).slice(0, 15)),
  price_note: line(400),
  resale: z.enum(["forbidden", "capped_at_face", "allowed", "unclear"]),
  resale_quote: line(500),
  resale_source: https,
  name_rule: z.enum(["id_match", "letter", "open", "unclear"]),
  name_rule_quote: line(500),
  name_rule_source: https,
  letter_template_url: https.catch(""),
  sold_out: z.enum(["yes", "no", "unclear"]),
  sources: z.array(z.object({ url: https, title: line(160) })).transform((s) => s.filter((x) => x.url).slice(0, 12)),
  summary: line(900),
});
export type Findings = z.infer<typeof Findings>;

/** What is kept on the request: the findings, with what was asked and what it cost. */
export type Research = Findings & { model: string; at: string; searches: number; tokens: { in: number; out: number } };

export type ResearchOutcome =
  | { ok: true; research: Research }
  | { ok: false; reason: "off" | "busy" | "failed" | "no_answer"; detail?: string };

const url = { type: "string", description: "An https URL, or an empty string when there is none." };

/** The one tool the model answers with; strict, so its input always holds to the schema. */
export const REPORT_TOOL = {
  name: "report_findings",
  description: "Report what you found about the show, once, at the end. Leave a field empty, or say unclear, rather than guess.",
  strict: true,
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["official_url", "matches_request", "show", "tiers", "price_note", "resale", "resale_quote", "resale_source", "name_rule", "name_rule_quote", "name_rule_source", "letter_template_url", "sold_out", "sources", "summary"],
    properties: {
      official_url: { ...url, description: "The show's official page or the promoter's official post about it." },
      matches_request: { type: "boolean", description: "Whether what you found is the show asked for: same artist or title, city and date." },
      show: {
        type: "object",
        additionalProperties: false,
        required: ["title", "date", "start_time", "venue", "city"],
        properties: {
          title: { type: "string", description: "The title as the organiser writes it." },
          date: { type: "string", description: "YYYY-MM-DD as published, or empty." },
          start_time: { type: "string", description: "HH:MM local time as published (show start, not doors), or empty." },
          venue: { type: "string" },
          city: { type: "string" },
        },
      },
      tiers: {
        type: "array",
        description: "Every ticket category with its official face price.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "price", "source"],
          properties: {
            name: { type: "string", description: "The category as the organiser names it." },
            price: { type: "number", description: "Official price per ticket before tax and fees: rupiah for a show in Indonesia, US dollars abroad. 0 when not found." },
            source: url,
          },
        },
      },
      price_note: { type: "string", description: "Anything staff should know about the prices: phases, sources that disagree, tax and fees." },
      resale: { type: "string", enum: ["forbidden", "capped_at_face", "allowed", "unclear"] },
      resale_quote: { type: "string", description: "The exact sentence of the terms on resale or transfer, in its own language, or empty." },
      resale_source: url,
      name_rule: { type: "string", enum: ["id_match", "letter", "open", "unclear"] },
      name_rule_quote: { type: "string", description: "The exact sentence on names, ID or representatives, or empty." },
      name_rule_source: url,
      letter_template_url: { ...url, description: "The organiser's own letter of authorisation form (template surat kuasa) for this show, when they publish one." },
      sold_out: { type: "string", enum: ["yes", "no", "unclear"] },
      sources: {
        type: "array",
        description: "Every page you relied on.",
        items: { type: "object", additionalProperties: false, required: ["url", "title"], properties: { url, title: { type: "string" } } },
      },
      summary: { type: "string", description: "Two to four sentences in Indonesian for staff: what you found, what is missing, what to check." },
    },
  },
};

/** The rules the research follows: the same reading staff gave the January 2027 catalogue. */
export function researchSystem(today: string) {
  return [
    `You research one live show for Lummy, an Indonesian ticket resale marketplace that holds the buyer's money in escrow. Today is ${today}.`,
    "Staff decide whether the show joins the catalogue. You collect facts, each with the URL it came from, and invent nothing: a field you could not find stays empty or unclear.",
    "",
    "Find:",
    "1. The show's official page, or the promoter's official post or account about it, and the ticketing partner's page.",
    "2. Every ticket category and its official face price per ticket, before government tax and platform fees. Where prices came in phases (presale, early bird, normal or general sale), give the normal or last phase. A package for a group (a table for six) is not a category. Prefer the promoter's site, the official ticketing partner (Loket, tiket.com, Traveloka, SODTix and the like) and a bank's presale FAQ; when those cannot be read, two reputable news outlets that agree.",
    "3. The terms the tickets are sold under, on resale and on names:",
    "   - resale: forbidden when a ticket resold or offered for sale becomes invalid, or resale is prohibited outright; capped_at_face when resale is allowed only at or below the official price; allowed when the terms let a ticket be passed on or resold; unclear when no terms were found. A clause that only voids tickets bought by businesses or traders to resell, or that calls tickets from third parties the buyer's own risk, is not a ban.",
    "   - name_rule: id_match when tickets are bought in the name on an ID that cannot be changed, or the ID must match at entry or wristband exchange; letter when a representative with a signed letter of authorisation (surat kuasa) and a copy of the holder's ID is accepted; open when whoever holds the ticket may enter; unclear otherwise.",
    "   Quote the exact sentence for each, in its own language.",
    "   When representatives are accepted and the organiser publishes its own letter of authorisation form, give its link.",
    "4. The date, start time (not doors), venue and city as published, and whether it is sold out.",
    "",
    "Answer only by calling report_findings, once, at the end.",
  ].join("\n");
}

/** What the seller asked for, as the model reads it. Nothing about the seller themself. */
export function researchPrompt(r: RequestForResearch) {
  const local = new Date(r.startsAt).toISOString().slice(0, 16).replace("T", " ");
  return [
    "A seller asks for this show to be added to the catalogue:",
    `- Title: ${r.title}`,
    `- When (UTC): ${local}`,
    `- Venue: ${r.venue}, ${r.city}, ${r.country}`,
    `- Paid in: ${r.currency === "USDC" ? "USDC (a show abroad, prices in US dollars)" : "rupiah"}`,
    `- Official page the seller gave: ${r.organizerRef}`,
    ...(r.pdfTier ? [`- The seller's own ticket: ${r.pdfTier}${r.printedPrice ? `, printed price ${r.printedPrice}` : ""} (not checked)`] : []),
    "",
    "Research it as the instructions say, then call report_findings.",
  ].join("\n");
}

type Opts = { key: string; model?: string; deadline: number; today?: string };

/**
 * One research, inside the deadline. A paused server-tool turn is sent back to continue; a turn that
 * ends without the report gets one reminder. Nothing is retried after an API error: staff press the
 * button again.
 */
export async function researchRequest(r: RequestForResearch, o: Opts): Promise<ResearchOutcome> {
  const model = o.model || process.env.CLAUDE_RESEARCH_MODEL?.trim() || DEFAULT_RESEARCH_MODEL;
  const client = new Anthropic({ apiKey: o.key, maxRetries: 0 });
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: researchPrompt(r) }];
  const used = { in: 0, out: 0, searches: 0 };
  let reminded = false;
  for (let turn = 0; turn < 8; turn++) {
    const left = o.deadline - Date.now();
    if (left < 3_000) return { ok: false, reason: "busy", detail: "out of time" };
    let msg: Anthropic.Message;
    try {
      msg = await client.messages.create(
        {
          model,
          max_tokens: MAX_TOKENS,
          output_config: { effort: "low" },
          system: researchSystem(today),
          tools: [
            { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES },
            { type: "web_fetch_20260209", name: "web_fetch", max_uses: MAX_FETCHES },
            REPORT_TOOL,
          ],
          messages,
        },
        { timeout: left }
      );
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: "busy", detail: "timed out" };
      if (e instanceof Anthropic.APIConnectionError) return { ok: false, reason: "busy", detail: "network error" };
      if (e instanceof Anthropic.APIError && e.status) {
        const err = (e.error as { error?: { type?: string; message?: string } } | undefined)?.error;
        const status = `HTTP ${e.status} ${err?.type ?? ""}`.trim();
        return RETRYABLE.has(e.status) ? { ok: false, reason: "busy", detail: status } : { ok: false, reason: "failed", detail: `${status}: ${String(err?.message ?? "").slice(0, 160)}` };
      }
      return { ok: false, reason: "failed", detail: e instanceof Error ? e.message.slice(0, 160) : "unknown error" };
    }
    used.in += msg.usage.input_tokens;
    used.out += msg.usage.output_tokens;
    used.searches += msg.usage.server_tool_use?.web_search_requests ?? 0;

    const report = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === REPORT_TOOL.name);
    if (report) {
      const parsed = Findings.safeParse(report.input);
      if (!parsed.success) return { ok: false, reason: "no_answer", detail: parsed.error.issues[0]?.message ?? "bad report" };
      return { ok: true, research: { ...parsed.data, model, at: new Date().toISOString(), searches: used.searches, tokens: { in: used.in, out: used.out } } };
    }
    if (msg.stop_reason === "refusal") return { ok: false, reason: "failed", detail: "refusal" };
    if (msg.stop_reason === "max_tokens") return { ok: false, reason: "no_answer", detail: "max_tokens" };
    messages.push({ role: "assistant", content: msg.content });
    // A long server-tool turn pauses; sending it back lets the server go on.
    if (msg.stop_reason === "pause_turn") continue;
    if (reminded) return { ok: false, reason: "no_answer", detail: msg.stop_reason ?? "no stop reason" };
    reminded = true;
    messages.push({ role: "user", content: "Call report_findings now with what you found; leave unknown fields empty or unclear." });
  }
  return { ok: false, reason: "no_answer", detail: "too many turns" };
}
