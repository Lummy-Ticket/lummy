// Writing an order, shared by both ways of paying: straight away while payment is simulated or
// runs on the testnet escrow (POST /api/orders), and after Xendit reports a QRIS payment
// (lib/payments/checkout, docs/09 §6). The price, fee and stamp duty come from the listing here,
// never from the browser.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DISPUTE_WINDOW_H, EVENT_DURATION_H } from "@/lib/mock/escrow";
import { resaleAllowed } from "@/lib/mock/transfer";
import { MATERAI, platformFee } from "@/lib/mock/util";
import type { Database } from "@/lib/supabase/types";

if (typeof window !== "undefined") throw new Error("lib/orders/create hanya boleh dipakai di server");

type Admin = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];
type OrderInsert = Tables["orders"]["Insert"];

const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const LISTING_COLUMNS =
  "id, event_id, tier_id, seller_id, seller_name, ask_price, status, gate_ktp, late_listing, ticket_path, ticket_sha256, barcode_hmac" as const;

export type ListingForSale = Pick<
  Tables["listings"]["Row"],
  "id" | "event_id" | "tier_id" | "seller_id" | "seller_name" | "ask_price" | "status" | "gate_ktp" | "late_listing" | "ticket_path" | "ticket_sha256" | "barcode_hmac"
>;

type EventRow = Database["public"]["Views"]["catalogue_events"]["Row"];

export type Purchase = {
  listing: ListingForSale;
  event: { title: string; starts_at: string } & Pick<EventRow, "status" | "image_url" | "transfer_policy">;
  tierName: string;
  /** When the show is scheduled to end: the start of the claim window. */
  scheduledEnd: number;
};

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

/** The listing with its show and tier, whatever state the listing is in now. */
export async function loadPurchase(admin: Admin, listingId: string): Promise<{ ok: true; listing: ListingForSale | null; purchase: Purchase | null } | Fail> {
  const { data: listing, error } = await admin.from("listings").select(LISTING_COLUMNS).eq("id", listingId).maybeSingle();
  if (error) return fail(500, error.message);
  if (!listing) return { ok: true, listing: null, purchase: null };
  const [ev, tier] = await Promise.all([
    admin.from("catalogue_events").select("title, starts_at, status, image_url, transfer_policy").eq("id", listing.event_id).maybeSingle(),
    admin.from("tiers").select("name").eq("id", listing.tier_id).maybeSingle(),
  ]);
  if (ev.error || tier.error) return fail(500, (ev.error ?? tier.error)!.message);
  const event = ev.data;
  if (!event?.title || !event.starts_at || !tier.data) return { ok: true, listing, purchase: null };
  return {
    ok: true,
    listing,
    purchase: {
      listing,
      event: { title: event.title, starts_at: event.starts_at, status: event.status, image_url: event.image_url, transfer_policy: event.transfer_policy },
      tierName: tier.data.name,
      scheduledEnd: new Date(event.starts_at).getTime() + EVENT_DURATION_H * H,
    },
  };
}

/** Whether this buyer may buy this listing now, in the order the checks have always run. */
export async function checkPurchase(admin: Admin, buyerId: string, listingId: string): Promise<{ ok: true; purchase: Purchase } | Fail> {
  const loaded = await loadPurchase(admin, listingId);
  if (!loaded.ok) return loaded;
  const { listing, purchase } = loaded;
  if (!listing || listing.status !== "active") return fail(409, "listing ini sudah tidak dijual");
  if (listing.seller_id === buyerId) return fail(400, "tidak bisa membeli listing sendiri");
  if (!purchase) return fail(409, "acara untuk listing ini tidak ditemukan");
  if (purchase.event.status === "cancelled" || Date.now() >= purchase.scheduledEnd) return fail(409, "acara ini sudah lewat atau dibatalkan");
  // A listing that went up before the organiser's rule was recorded still cannot be bought.
  if (!resaleAllowed(purchase.event.transfer_policy)) return fail(409, "penyelenggara acara ini melarang tiketnya dijual ulang");
  return { ok: true, purchase };
}

/** Money for `quantity` seats: the subtotal the escrow holds, the fee and the stamp duty. */
export function priceOf(askPrice: number, quantity: number) {
  const amount = askPrice * quantity;
  const fee = platformFee(amount);
  return { amount, fee, materai: MATERAI, total: amount + fee + MATERAI };
}

export type ChainFields = {
  chain_id: number;
  contract_address: string;
  onchain_listing_id: string;
  onchain_price: string;
  dispute_deadline: string;
  tx_create: string;
  tx_fund: string;
  tx_handover: string;
};

/**
 * The order row for a purchase. `endsAt` starts the claim window (the demo switch moves it).
 * `price` is what the buyer actually paid, when that was settled earlier (a QRIS hold); without it
 * the price comes from the listing now.
 */
export function orderInsert(
  buyerId: string,
  p: Purchase,
  quantity: number,
  opts: { endsAt: number; chain?: ChainFields | null; paymentId?: string; price?: { amount: number; fee: number; materai: number } }
): OrderInsert {
  const { amount, fee, materai } = opts.price ?? priceOf(p.listing.ask_price, quantity);
  const chain = opts.chain ?? null;
  return {
    listing_id: p.listing.id,
    event_id: p.listing.event_id,
    buyer_id: buyerId,
    seller_id: p.listing.seller_id,
    event_title: p.event.title,
    event_image: p.event.image_url,
    event_date: p.event.starts_at,
    tier_name: p.tierName,
    seller_name: p.listing.seller_name,
    quantity,
    amount,
    fee,
    materai,
    gate_ktp: p.listing.gate_ktp,
    late_listing: p.listing.late_listing,
    // The seller's PDF is handed over with the order (GET /api/orders/[id]/ticket).
    ticket_file: !!p.listing.ticket_path,
    // After the handover the contract is already in its window state.
    escrow_status: chain ? "DisputeWindow" : "Funded",
    event_ends_at: iso(chain ? Math.floor(opts.endsAt / 1000) * 1000 : opts.endsAt),
    dispute_deadline: chain ? chain.dispute_deadline : iso(opts.endsAt + DISPUTE_WINDOW_H * H),
    payment_id: opts.paymentId ?? null,
    ...chain,
  };
}
