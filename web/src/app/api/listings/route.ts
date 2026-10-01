// A listing from an account. The server decides everything that matters: the face value comes
// from the tier, the price must sit in the 50-150% band, a listing flagged by the checks or posted
// close to doors waits for a person, and a barcode already sold is refused. The ticket is either
// a real PDF, checked here (lib/tickets) and kept in the private bucket, or one of the sample
// tickets, whose signals come from the server's own table (lib/listings/rules.ts).
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { EVENT_DURATION_H, isLateListing } from "@/lib/mock/escrow";
import { resaleAllowed } from "@/lib/mock/transfer";
import type { ListingAI } from "@/lib/mock/types";
import { SAMPLE_SIGNALS, inPriceBand, isBlocked, isFlagged, isSampleTicket, publicSellerName } from "@/lib/listings/rules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isDemoEmail } from "@/lib/supabase/demo";
import { currentUser } from "@/lib/supabase/session";
import type { Json } from "@/lib/supabase/types";
import { MAX_TICKET_BYTES, TicketError } from "@/lib/tickets/analyze";
import { isDuplicate, reviewReasons, toListingChecks } from "@/lib/tickets/checks";
import { TICKET_ERRORS, checkTicket, setKey, ticketPepper } from "@/lib/tickets/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Reading a long PDF takes seconds.
export const maxDuration = 60;

const H = 3_600_000;
/**
 * The catalogue is shared, and listing costs nothing, so an ordinary account keeps at most this
 * many listings live or in review. Demo accounts and staff are not limited.
 */
const OPEN_LISTING_LIMIT = 3;
const MAX_QUANTITY = 8;
const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });
const DUPLICATE = "barcode ini sudah pernah dijual di Lummy, jadi listing diblokir";

type Body = { eventId?: unknown; tierId?: unknown; askPrice?: unknown; quantity?: unknown; splittable?: unknown; gateKtp?: unknown; sample?: unknown };

const isMultipart = (req: Request) => (req.headers.get("content-type") ?? "").startsWith("multipart/form-data");

/** A real PDF arrives as a form with the file; a sample ticket as JSON, as before. */
async function readBody(req: Request): Promise<{ body: Body; file: File | null } | null> {
  if (!isMultipart(req)) return { body: ((await req.json().catch(() => null)) as Body | null) ?? {}, file: null };
  const form = await req.formData().catch(() => null);
  if (!form) return null;
  const field = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const file = form.get("ticket");
  return {
    body: {
      eventId: field("eventId"),
      tierId: field("tierId"),
      askPrice: field("askPrice"),
      quantity: field("quantity"),
      splittable: field("splittable") === "true",
      gateKtp: field("gateKtp") === "true",
    },
    file: file instanceof File ? file : null,
  };
}

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu untuk menjual");

  const read = await readBody(req);
  if (!read) return fail(400, "form tidak terbaca");
  const { body, file } = read;
  if (isMultipart(req) && !file) return fail(400, "kirim file PDF tiketnya");
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const tierId = typeof body.tierId === "string" ? body.tierId : "";
  const askPrice = Number(body.askPrice);
  if (!/^[\w-]{1,64}$/.test(eventId) || !/^[\w-]{1,64}$/.test(tierId)) return fail(400, "acara atau kategori tidak dikenal");
  if (!Number.isInteger(askPrice) || askPrice <= 0) return fail(400, "harga harus rupiah utuh");

  // The ticket: a real PDF checked here, or a sample ticket with the server's own signals.
  let signals: ListingAI;
  let ticket: (Awaited<ReturnType<typeof checkTicket>> & { bytes: Uint8Array }) | null = null;
  if (file) {
    const pepper = ticketPepper();
    if (!pepper) return fail(503, "pemeriksaan tiket belum aktif di server ini");
    if (file.size > MAX_TICKET_BYTES) return fail(413, TICKET_ERRORS.too_big);
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      ticket = { ...(await checkTicket(admin, bytes, pepper)), bytes };
    } catch (e) {
      if (e instanceof TicketError) return fail(422, TICKET_ERRORS[e.code]);
      console.error("ticket check failed:", e);
      return fail(500, "pemeriksaan tiket gagal, coba lagi");
    }
    if (isDuplicate(ticket.check)) return fail(409, DUPLICATE);
    signals = { autofilled: false, forgeryScore: ticket.check.score, barcodeDuplicate: false, pdfSuspicious: ticket.check.suspicious };
  } else {
    if (!isSampleTicket(body.sample)) return fail(400, "pilih salah satu tiket contoh");
    signals = SAMPLE_SIGNALS[body.sample];
    if (isBlocked(signals)) return fail(409, DUPLICATE);
  }

  // Each barcode is one ticket, and the buyer receives the whole PDF, so a listing sells every
  // ticket in it. Only a PDF with no readable barcode says its own quantity.
  const barcodes = ticket?.analysis.barcodes ?? [];
  if (barcodes.length > MAX_QUANTITY) return fail(400, `satu listing paling banyak ${MAX_QUANTITY} tiket, pisahkan PDF-nya`);
  const quantity = barcodes.length || Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return fail(400, `jumlah tiket 1 sampai ${MAX_QUANTITY}`);

  if (!user.staff && !isDemoEmail(user.email)) {
    const open = await admin.from("listings").select("id", { count: "exact", head: true }).eq("seller_id", user.id).in("status", ["active", "review"]);
    if (open.error) return fail(500, open.error.message);
    if ((open.count ?? 0) >= OPEN_LISTING_LIMIT) {
      return fail(429, `satu akun paling banyak punya ${OPEN_LISTING_LIMIT} listing yang tayang atau direview`);
    }
  }

  const [ev, tier] = await Promise.all([
    admin.from("catalogue_events").select("starts_at, status, transfer_policy").eq("id", eventId).maybeSingle(),
    admin.from("tiers").select("face_value").eq("id", tierId).eq("event_id", eventId).maybeSingle(),
  ]);
  if (ev.error || tier.error) return fail(500, (ev.error ?? tier.error)!.message);
  if (!ev.data?.starts_at) return fail(404, "acara tidak ditemukan");
  if (!tier.data) return fail(400, "kategori ini bukan milik acara itu");
  if (!resaleAllowed(ev.data.transfer_policy)) return fail(409, "penyelenggara acara ini melarang tiketnya dijual ulang");
  if (ev.data.status === "cancelled" || Date.now() >= new Date(ev.data.starts_at).getTime() + EVENT_DURATION_H * H) {
    return fail(409, "acara ini sudah lewat atau dibatalkan");
  }
  const faceValue = tier.data.face_value;
  if (!inPriceBand(askPrice, faceValue)) return fail(400, "harga harus di antara 50% dan 150% harga asli");

  // Duplicate-pass fraud clusters in the hours before doors, so late listings are reviewed too.
  const late = isLateListing(ev.data.starts_at);
  const checks = ticket ? toListingChecks(ticket.check) : null;
  const status = (checks ? reviewReasons(checks).length > 0 : isFlagged(signals)) || late ? "review" : "active";
  const keys = barcodes.map((b) => b.key);
  const { data, error } = await admin
    .from("listings")
    .insert({
      event_id: eventId,
      tier_id: tierId,
      seller_id: user.id,
      seller_name: publicSellerName(user.name),
      ask_price: askPrice,
      face_value: faceValue,
      quantity,
      splittable: body.splittable === true,
      gate_ktp: body.gateKtp === true,
      // A real ticket stays out of the catalogue until its barcodes are held and its file is stored.
      status: ticket ? "review" : status,
      late_listing: late,
      autofilled: signals.autofilled,
      forgery_score: signals.forgeryScore,
      pdf_suspicious: signals.pdfSuspicious,
      barcode_duplicate: false,
      ...(ticket
        ? {
            ticket_sha256: ticket.analysis.sha256,
            barcode_hmac: keys.length ? setKey(keys) : null,
            extraction: {
              source: "pdf",
              pages: ticket.analysis.pages,
              scannedPages: ticket.analysis.scannedPages,
              barcodes: barcodes.map((b) => ({ format: b.format, tail: b.tail, page: b.page })),
            },
            forensics: ticket.analysis.forensics as unknown as Json,
            checks: checks as unknown as Json,
          }
        : { extraction: { source: "sample", sample: String(body.sample) } }),
    })
    .select("id, status")
    .single();
  // The set's key collides with a live listing's: the same tickets, listed in the meantime.
  if (error?.code === "23505") return fail(409, DUPLICATE);
  if (error || !data) return fail(500, error?.message ?? "listing gagal disimpan");

  if (ticket) {
    const undo = async () => void (await admin.from("listings").delete().eq("id", data.id));
    if (keys.length) {
      const held = await admin
        .from("listing_barcodes")
        .insert(barcodes.map((b) => ({ listing_id: data.id, barcode_hmac: b.key, format: b.format, page: b.page })));
      if (held.error) {
        await undo();
        // Another listing took one of these barcodes between the check and now.
        return held.error.code === "23505" ? fail(409, DUPLICATE) : fail(500, held.error.message);
      }
    }
    const path = `${data.id}.pdf`;
    const stored = await admin.storage.from("tickets").upload(path, ticket.bytes, { contentType: "application/pdf", upsert: false });
    if (stored.error) {
      await undo();
      return fail(500, `file tiket gagal disimpan: ${stored.error.message}`);
    }
    const done = await admin.from("listings").update({ ticket_path: path, status }).eq("id", data.id).select("id, status").single();
    if (done.error || !done.data) {
      await admin.storage.from("tickets").remove([path]);
      await undo();
      return fail(500, done.error?.message ?? "listing gagal disimpan");
    }
    data.status = done.data.status;
  }

  if (data.status === "active") revalidateTag("catalogue", { expire: 0 });
  return NextResponse.json(data, { headers: noStore });
}
