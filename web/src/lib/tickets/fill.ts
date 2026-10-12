// The AI step around a ticket PDF (docs/09 §5.1), for the routes: the file's text, cleaned of every
// name and number, goes to the model with the categories it may match, and nothing else leaves. The
// sell page asks for it to fill the form in; publishing asks again, on the file it stores, rather
// than trust what the page says it read.
import type { EventItem } from "@/lib/mock/types";
import { aiProvider, extractTicketFacts, type ShowForTicket } from "./ai";
import { showDay, type TicketFacts } from "./checks";
import { prepareForExtraction } from "./extract";

if (typeof window !== "undefined") throw new Error("lib/tickets/fill is server-only");

export type FillOutcome =
  | { ok: true; facts: TicketFacts; model: string }
  | { ok: false; reason: "off" | "no_text" | "no_ticket_page" | "personal_data_left" | "busy" | "failed" | "bad_answer" };

/**
 * What the ticket prints, or why it was not read. `names`: the seller's account name and the
 * holder's name the seller typed, both taken out of the text wherever they appear. Throws
 * TicketError for a file that is not a readable PDF, as the check does.
 */
export async function readTicketFacts(bytes: Uint8Array, names: string[], show: ShowForTicket, timeoutMs = 20_000): Promise<FillOutcome> {
  if (!aiProvider()) return { ok: false, reason: "off" };
  const clean = await prepareForExtraction(bytes, names);
  if (!clean.ok) return { ok: false, reason: clean.reason };
  const out = await extractTicketFacts(clean.text, show, { timeoutMs });
  if (!out.ok) {
    // The reason only: the text and the answer stay out of the logs.
    if (out.reason !== "off") console.warn(`[ai] no facts from the ticket: ${out.reason}${out.detail ? ` (${out.detail})` : ""}`);
    return { ok: false, reason: out.reason };
  }
  return { ok: true, facts: out.facts, model: out.model };
}

/** Every category of every show on sale, each with its show, so the model can find the show too. */
export function catalogueTiers(events: EventItem[]): ShowForTicket {
  return {
    tiers: events.flatMap((e) =>
      e.tiers.map((t) => ({ id: t.id, name: t.name, show: `${e.title}, ${showDay(e.dateISO)}, ${e.venue}, ${e.city}` }))
    ),
  };
}
