// Checks a ticket PDF for the sell page before anything is stored (docs/09 §5.2, §5.3): reads
// every barcode, compares each against the barcodes live listings hold, and inspects how the file
// was made. Nothing is saved; publishing runs the same check again on the same file.
import { NextResponse } from "next/server";
import { MAX_TICKET_BYTES, TicketError } from "@/lib/tickets/analyze";
import { TICKET_ERRORS, checkTicket, readerWorks, ticketPepper } from "@/lib/tickets/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string, code?: string) => NextResponse.json({ error, code }, { status, headers: noStore });

/** Whether this deployment checks real PDFs: a pepper, a database and a reader that works. */
export async function GET() {
  const available = !!ticketPepper() && !!supabaseAdmin() && (await readerWorks());
  return NextResponse.json({ available }, { headers: noStore });
}

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  const pepper = ticketPepper();
  if (!admin || !pepper) return fail(503, "pemeriksaan tiket belum aktif di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu untuk memeriksa tiket");

  const form = await req.formData().catch(() => null);
  const file = form?.get("ticket");
  if (!(file instanceof File)) return fail(400, "kirim file PDF tiketnya");
  if (file.size > MAX_TICKET_BYTES) return fail(413, TICKET_ERRORS.too_big, "too_big");

  try {
    const { check } = await checkTicket(admin, new Uint8Array(await file.arrayBuffer()), pepper);
    return NextResponse.json(check, { headers: noStore });
  } catch (e) {
    if (e instanceof TicketError) return fail(422, TICKET_ERRORS[e.code], e.code);
    console.error("ticket check failed:", e);
    return fail(500, "pemeriksaan tiket gagal, coba lagi");
  }
}
