// Buying with an account. The seats are claimed in one database call, so two buyers pressing Pay
// together cannot both get them, and the price, fee and stamp duty are worked out here from the
// listing, never taken from the browser. Payment is simulated; with chain mode (demo key) the
// money is also locked in the testnet escrow before the order is written.
import type { Hex } from "viem";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { chainError, openOrder, operatorSetup, readListing, writeAllowed } from "@/lib/chain/server";
import { demoKeyAllowed, demoMode } from "@/lib/demo-key";
import { DISPUTE_WINDOW_H, EVENT_DURATION_H } from "@/lib/mock/escrow";
import { resaleAllowed } from "@/lib/mock/transfer";
import { MATERAI, platformFee } from "@/lib/mock/util";
import { HELD } from "@/lib/orders/map";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isDemoEmail } from "@/lib/supabase/demo";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const H = 3_600_000;
/**
 * While payment is simulated, buying costs nothing, so one account could empty the catalogue
 * everyone shares. An ordinary account holds at most this many open orders at a time; demo
 * accounts (presenters, behind the demo key) and staff are not limited.
 */
const OPEN_ORDER_LIMIT = 3;
const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });
const iso = (ms: number) => new Date(ms).toISOString();

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu untuk membeli");

  const body = (await req.json().catch(() => null)) as { listingId?: unknown; quantity?: unknown; chain?: unknown; demoEnded?: unknown } | null;
  const listingId = typeof body?.listingId === "string" ? body.listingId : "";
  const quantity = Number(body?.quantity);
  if (!/^[\w-]{1,64}$/.test(listingId)) return fail(400, "listing tidak dikenal");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 8) return fail(400, "jumlah tiket 1 sampai 8");

  // Presenter switches act for real, so they sit behind the demo key like chain mode itself.
  const op = body?.chain === true ? operatorSetup() : null;
  if (body?.chain === true && !op) return fail(503, "mode chain mati: kunci operator belum diset");
  if (op && !writeAllowed(req, op)) return fail(401, "demo key salah atau belum diisi");
  const demoEnded = body?.demoEnded === true;
  if (demoEnded && (demoMode() === "off" || !demoKeyAllowed(req))) return fail(401, "demo key salah atau belum diisi");

  if (!user.staff && !isDemoEmail(user.email)) {
    const open = await admin.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", user.id).in("escrow_status", HELD);
    if (open.error) return fail(500, open.error.message);
    if ((open.count ?? 0) >= OPEN_ORDER_LIMIT) {
      return fail(429, `selama pembayaran masih simulasi, satu akun paling banyak punya ${OPEN_ORDER_LIMIT} pesanan berjalan`);
    }
  }

  const { data: listing, error: listingError } = await admin
    .from("listings")
    .select("id, event_id, tier_id, seller_id, seller_name, ask_price, status, gate_ktp, late_listing")
    .eq("id", listingId)
    .maybeSingle();
  if (listingError) return fail(500, listingError.message);
  if (!listing || listing.status !== "active") return fail(409, "listing ini sudah tidak dijual");
  if (listing.seller_id === user.id) return fail(400, "tidak bisa membeli listing sendiri");

  const [ev, tier] = await Promise.all([
    admin.from("catalogue_events").select("title, starts_at, status, image_url, transfer_policy").eq("id", listing.event_id).maybeSingle(),
    admin.from("tiers").select("name").eq("id", listing.tier_id).maybeSingle(),
  ]);
  if (ev.error || tier.error) return fail(500, (ev.error ?? tier.error)!.message);
  const event = ev.data;
  if (!event?.title || !event.starts_at || !tier.data) return fail(409, "acara untuk listing ini tidak ditemukan");
  const scheduledEnd = new Date(event.starts_at).getTime() + EVENT_DURATION_H * H;
  if (event.status === "cancelled" || Date.now() >= scheduledEnd) return fail(409, "acara ini sudah lewat atau dibatalkan");
  // A listing that went up before the organiser's rule was recorded still cannot be bought.
  if (!resaleAllowed(event.transfer_policy)) return fail(409, "penyelenggara acara ini melarang tiketnya dijual ulang");

  const claim = await admin.rpc("claim_listing", { p_listing_id: listingId, p_quantity: quantity });
  if (claim.error) return fail(500, claim.error.message);
  // Nothing claimed comes back as a row of nulls, not as null.
  if (!claim.data?.id) return fail(409, "tiketnya baru saja dibeli orang lain, atau jumlahnya tidak tersedia");
  const giveBack = () => admin.rpc("release_listing", { p_listing_id: listingId, p_quantity: quantity });

  // The show's end starts the window. The presenter switch pretends it has already come.
  const endsAt = demoEnded ? Date.now() : scheduledEnd;
  let chain: {
    chain_id: number;
    contract_address: string;
    onchain_listing_id: string;
    onchain_price: string;
    dispute_deadline: string;
    tx_create: string;
    tx_fund: string;
    tx_handover: string;
  } | null = null;
  if (op) {
    try {
      const endsAtSec = Math.floor(endsAt / 1000);
      const r = await openOrder(op, endsAtSec);
      // The contract counts the window from the later of the handover and the show's end.
      const live = await readListing(op, r.listingId as Hex).catch(() => null);
      chain = {
        chain_id: op.chain.id,
        contract_address: op.escrow,
        onchain_listing_id: r.listingId,
        onchain_price: r.price,
        dispute_deadline: iso(live ? live.deadline * 1000 : Math.max(Date.now(), endsAtSec * 1000) + DISPUTE_WINDOW_H * H),
        tx_create: r.txs.create,
        tx_fund: r.txs.fund,
        tx_handover: r.txs.handover,
      };
    } catch (e) {
      await giveBack();
      return fail(502, chainError(e));
    }
  }

  const subtotal = listing.ask_price * quantity;
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      listing_id: listing.id,
      event_id: listing.event_id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      event_title: event.title,
      event_image: event.image_url,
      event_date: event.starts_at,
      tier_name: tier.data.name,
      seller_name: listing.seller_name,
      quantity,
      amount: subtotal,
      fee: platformFee(subtotal),
      materai: MATERAI,
      gate_ktp: listing.gate_ktp,
      late_listing: listing.late_listing,
      // After the handover the contract is already in its window state.
      escrow_status: chain ? "DisputeWindow" : "Funded",
      event_ends_at: iso(chain ? Math.floor(endsAt / 1000) * 1000 : endsAt),
      dispute_deadline: chain ? chain.dispute_deadline : iso(endsAt + DISPUTE_WINDOW_H * H),
      ...chain,
    })
    .select("id")
    .single();
  if (orderError || !order) {
    await giveBack();
    if (chain) console.error("[orders] escrow opened on chain but the order was not saved:", chain.onchain_listing_id);
    return fail(500, orderError?.message ?? "pesanan gagal disimpan");
  }

  // The catalogue shows what is left on sale: expire it now, not in 30 seconds.
  revalidateTag("catalogue", { expire: 0 });
  return NextResponse.json({ id: order.id }, { headers: noStore });
}
