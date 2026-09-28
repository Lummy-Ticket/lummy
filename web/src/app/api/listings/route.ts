// A listing from an account. The server decides everything that matters: the face value comes
// from the tier, the price must sit in the 50-150% band, a listing flagged by the checks or posted
// close to doors waits for a person, and a barcode already sold is refused. Until the AI pipeline
// reads real PDFs, the file is one of the sample tickets and its signals come from the server's
// own table (lib/listings/rules.ts).
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { EVENT_DURATION_H, isLateListing } from "@/lib/mock/escrow";
import { SAMPLE_SIGNALS, inPriceBand, isBlocked, isFlagged, isSampleTicket, publicSellerName } from "@/lib/listings/rules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isDemoEmail } from "@/lib/supabase/demo";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const H = 3_600_000;
/**
 * The catalogue is shared, and listing costs nothing while files are samples, so an ordinary
 * account keeps at most this many listings live or in review. Demo accounts and staff are not
 * limited.
 */
const OPEN_LISTING_LIMIT = 3;
const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

type Body = { eventId?: unknown; tierId?: unknown; askPrice?: unknown; quantity?: unknown; splittable?: unknown; gateKtp?: unknown; sample?: unknown };

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu untuk menjual");

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const tierId = typeof body.tierId === "string" ? body.tierId : "";
  const askPrice = Number(body.askPrice);
  const quantity = Number(body.quantity);
  if (!/^[\w-]{1,64}$/.test(eventId) || !/^[\w-]{1,64}$/.test(tierId)) return fail(400, "acara atau kategori tidak dikenal");
  if (!Number.isInteger(askPrice) || askPrice <= 0) return fail(400, "harga harus rupiah utuh");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 8) return fail(400, "jumlah tiket 1 sampai 8");
  if (!isSampleTicket(body.sample)) return fail(400, "pilih salah satu tiket contoh");
  const signals = SAMPLE_SIGNALS[body.sample];
  if (isBlocked(signals)) return fail(409, "barcode ini sudah pernah dijual di Lummy, jadi listing diblokir");

  if (!user.staff && !isDemoEmail(user.email)) {
    const open = await admin.from("listings").select("id", { count: "exact", head: true }).eq("seller_id", user.id).in("status", ["active", "review"]);
    if (open.error) return fail(500, open.error.message);
    if ((open.count ?? 0) >= OPEN_LISTING_LIMIT) {
      return fail(429, `satu akun paling banyak punya ${OPEN_LISTING_LIMIT} listing yang tayang atau direview`);
    }
  }

  const [ev, tier] = await Promise.all([
    admin.from("catalogue_events").select("starts_at, status").eq("id", eventId).maybeSingle(),
    admin.from("tiers").select("face_value").eq("id", tierId).eq("event_id", eventId).maybeSingle(),
  ]);
  if (ev.error || tier.error) return fail(500, (ev.error ?? tier.error)!.message);
  if (!ev.data?.starts_at) return fail(404, "acara tidak ditemukan");
  if (!tier.data) return fail(400, "kategori ini bukan milik acara itu");
  if (ev.data.status === "cancelled" || Date.now() >= new Date(ev.data.starts_at).getTime() + EVENT_DURATION_H * H) {
    return fail(409, "acara ini sudah lewat atau dibatalkan");
  }
  const faceValue = tier.data.face_value;
  if (!inPriceBand(askPrice, faceValue)) return fail(400, "harga harus di antara 50% dan 150% harga asli");

  // Duplicate-pass fraud clusters in the hours before doors, so late listings are reviewed too.
  const late = isLateListing(ev.data.starts_at);
  const status = isFlagged(signals) || late ? "review" : "active";
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
      status,
      late_listing: late,
      autofilled: signals.autofilled,
      forgery_score: signals.forgeryScore,
      pdf_suspicious: signals.pdfSuspicious,
      barcode_duplicate: false,
      extraction: { source: "sample", sample: body.sample },
    })
    .select("id, status")
    .single();
  if (error || !data) return fail(500, error?.message ?? "listing gagal disimpan");

  if (status === "active") revalidateTag("catalogue", { expire: 0 });
  return NextResponse.json(data, { headers: noStore });
}
