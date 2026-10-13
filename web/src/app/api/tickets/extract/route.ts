// Fills the sell form in from a ticket PDF (docs/09 §5.1): the text, with every name and number taken
// out, goes to the model with the categories of every show on sale, and the answer comes back as a
// suggestion the seller confirms. Nothing is stored. Off unless this server has an AI provider
// (docs/config/01), so lummy.id answers "not available" until billing and the key are in place.
import { NextResponse } from "next/server";
import { isEventOver } from "@/lib/mock/seed";
import { resaleAllowed } from "@/lib/mock/transfer";
import { loadCatalogue } from "@/lib/supabase/catalogue";
import { currentUser } from "@/lib/supabase/session";
import { aiProvider } from "@/lib/tickets/ai";
import { MAX_TICKET_BYTES, TicketError } from "@/lib/tickets/analyze";
import { MIN_HOLDER_CHARS } from "@/lib/tickets/checks";
import { catalogueTiers, fillAllowed, namesToTakeOut, readTicketFacts } from "@/lib/tickets/fill";
import { TICKET_ERRORS } from "@/lib/tickets/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string, code?: string) => NextResponse.json({ error, code }, { status, headers: noStore });

/** Whether this server fills the form in from a ticket. */
export async function GET() {
  return NextResponse.json({ available: !!aiProvider() }, { headers: noStore });
}

export async function POST(req: Request) {
  if (!aiProvider()) return fail(503, "isi otomatis belum aktif di server ini", "off");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu untuk mengisi dari tiket");

  const form = await req.formData().catch(() => null);
  const file = form?.get("ticket");
  if (!(file instanceof File)) return fail(400, "kirim file PDF tiketnya");
  if (file.size > MAX_TICKET_BYTES) return fail(413, TICKET_ERRORS.too_big, "too_big");
  // The original buyer's name is what keeps it out of the text the model reads, so it comes first.
  const holder = form?.get("holder");
  const typed = typeof holder === "string" ? holder.trim() : "";
  if (typed.length < MIN_HOLDER_CHARS) return fail(400, "ketik dulu nama pemesan asli, supaya ikut dibuang sebelum tiketnya dibaca", "need_holder");
  const names = namesToTakeOut(user, typed);
  // Counted only once the request could go to the model.
  if (!fillAllowed(user.id)) return fail(429, "terlalu sering, coba lagi beberapa menit lagi");

  const events = ((await loadCatalogue())?.events ?? []).filter((e) => !isEventOver(e) && resaleAllowed(e.transferPolicy));
  if (!events.length) return NextResponse.json({ outcome: "no_shows" }, { headers: noStore });

  try {
    const out = await readTicketFacts(new Uint8Array(await file.arrayBuffer()), names, catalogueTiers(events));
    if (!out.ok) return NextResponse.json({ outcome: out.reason }, { headers: noStore });
    const event = events.find((e) => e.tiers.some((t) => t.id === out.facts.tierId));
    return NextResponse.json({ outcome: "filled", facts: out.facts, eventId: event?.id ?? null }, { headers: noStore });
  } catch (e) {
    if (e instanceof TicketError) return fail(422, TICKET_ERRORS[e.code], e.code);
    console.error("ticket fill failed:", e);
    return fail(500, "isi otomatis gagal, isi sendiri ya");
  }
}
