// The AI step around a ticket PDF (docs/09 §5.1), for the routes: the file's text, cleaned of every
// name and number, goes to the model with the categories it may match, and nothing else leaves. The
// sell page asks for it to fill the form in; publishing asks again, on the file it stores, rather
// than trust what the page says it read.
import type { EventItem } from "@/lib/mock/types";
import { aiProvider, extractTicketFacts, type ShowForTicket } from "./ai";
import { MIN_HOLDER_CHARS, showDay, type TicketFacts } from "./checks";
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

/**
 * The names the cleaner takes out of a ticket: the original buyer's as the seller typed it, the
 * account's own, and the account's email before the @ (a ticket may print it as a username).
 */
export function namesToTakeOut(user: { fullName: string; email: string }, holder: string) {
  const local = user.email.split("@")[0] ?? "";
  return [holder.slice(0, 120), user.fullName, local.length >= 5 ? local : ""].map((n) => n.trim()).filter((n) => n.length >= MIN_HOLDER_CHARS);
}

/**
 * A model call costs money and quota, so one account gets a few per window. Kept per server
 * instance: a soft brake for a person clicking again and again, not a wall against a botnet.
 */
export const FILL_WINDOW_MS = 10 * 60_000;
export const FILLS_PER_WINDOW = 10;
const recent = new Map<string, number[]>();

/** Whether this account may ask for another fill now; counts it when it may. */
export function fillAllowed(userId: string, now = Date.now()) {
  // Forget accounts whose window has passed, so the map stays the size of the last ten minutes.
  if (recent.size > 1_000) for (const [id, times] of recent) if (times.every((t) => now - t >= FILL_WINDOW_MS)) recent.delete(id);
  const times = (recent.get(userId) ?? []).filter((t) => now - t < FILL_WINDOW_MS);
  if (times.length >= FILLS_PER_WINDOW) {
    recent.set(userId, times);
    return false;
  }
  recent.set(userId, [...times, now]);
  return true;
}

/** Every category of every show on sale, each with its show, so the model can find the show too. */
export function catalogueTiers(events: EventItem[]): ShowForTicket {
  return {
    tiers: events.flatMap((e) =>
      e.tiers.map((t) => ({ id: t.id, name: t.name, show: `${e.title}, ${showDay(e.dateISO)}, ${e.venue}, ${e.city}` }))
    ),
  };
}
