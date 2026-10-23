// Buying with an account. The seats are claimed in one database call, so two buyers pressing Pay
// together cannot both get them, and the price, fee and stamp duty are worked out from the listing
// (lib/orders/create), never taken from the browser. Payment here is simulated; with chain mode
// (demo key) the money is also locked in the testnet escrow before the order is written. Once QRIS
// is switched on (docs/09 §6), an ordinary account pays through POST /api/payments instead.
import type { Hex } from "viem";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { chainError, openOrder, operatorSetup, readListing, writeAllowed } from "@/lib/chain/server";
import { demoKeyAllowed, demoMode } from "@/lib/demo-key";
import { notifyOrderPaid } from "@/lib/email/notify";
import { DISPUTE_WINDOW_H } from "@/lib/mock/escrow";
import { checkPurchase, orderInsert, type ChainFields } from "@/lib/orders/create";
import { HELD } from "@/lib/orders/map";
import { xenditConfig } from "@/lib/payments/xendit";
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

  const ordinary = !user.staff && !isDemoEmail(user.email);
  // With QRIS on, the money has to come through it; this straight path stays for chain mode,
  // presenters and staff.
  if (!op && ordinary && xenditConfig()) return fail(409, "pembayaran sekarang lewat QRIS: muat ulang halaman checkout");
  if (ordinary) {
    const open = await admin.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", user.id).in("escrow_status", HELD);
    if (open.error) return fail(500, open.error.message);
    if ((open.count ?? 0) >= OPEN_ORDER_LIMIT) {
      return fail(429, `selama pembayaran masih simulasi, satu akun paling banyak punya ${OPEN_ORDER_LIMIT} pesanan berjalan`);
    }
  }

  const check = await checkPurchase(admin, user.id, listingId);
  if (!check.ok) return fail(check.status, check.error);
  const purchase = check.purchase;
  // A show priced in USDC is paid from the buyer's own wallet only (POST /api/payments).
  if (purchase.event.currency === "USDC") return fail(409, "acara ini dibayar dengan USDC dari wallet: muat ulang halaman checkout");

  const claim = await admin.rpc("claim_listing", { p_listing_id: listingId, p_quantity: quantity });
  if (claim.error) return fail(500, claim.error.message);
  // Nothing claimed comes back as a row of nulls, not as null.
  if (!claim.data?.id) return fail(409, "tiketnya baru saja dibeli orang lain, atau jumlahnya tidak tersedia");
  const giveBack = () => admin.rpc("release_listing", { p_listing_id: listingId, p_quantity: quantity });

  // The show's end starts the window. The presenter switch pretends it has already come.
  const endsAt = demoEnded ? Date.now() : purchase.scheduledEnd;
  let chain: ChainFields | null = null;
  if (op) {
    try {
      const endsAtSec = Math.floor(endsAt / 1000);
      const r = await openOrder(op, endsAtSec, { barcodeKey: purchase.listing.barcode_hmac, sha256: purchase.listing.ticket_sha256 });
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

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert(orderInsert(user.id, purchase, quantity, { endsAt, chain }))
    .select("id")
    .single();
  if (orderError || !order) {
    await giveBack();
    if (chain) console.error("[orders] escrow opened on chain but the order was not saved:", chain.onchain_listing_id);
    return fail(500, orderError?.message ?? "pesanan gagal disimpan");
  }

  // The catalogue shows what is left on sale: expire it now, not in 30 seconds.
  revalidateTag("catalogue", { expire: 0 });
  notifyOrderPaid(admin, order.id);
  return NextResponse.json({ id: order.id }, { headers: noStore });
}
