// Who hears what (lib/features.ts, `emails`). Each function is called right after the change it
// reports is saved, by the code that saved it, and does its reading and sending after the answer is
// sent (lib/email/send), so none of them can slow down or fail that request. Addresses are the
// accounts' sign-in addresses, the ones they have proved they read; nothing else is collected.
import type { SupabaseClient } from "@supabase/supabase-js";
import { EVENT_DURATION_H } from "@/lib/mock/escrow";
import type { DisputeReason, Remedy } from "@/lib/mock/types";
import type { Database } from "@/lib/supabase/types";
import { queueEmails, type Mail } from "./send";
import { claimReceipt, claimToSeller, orderPaid, ruling, showCancelled, ticketsListed, type OrderFacts, type Rendered } from "./templates";

if (typeof window !== "undefined") throw new Error("lib/email/notify hanya boleh dipakai di server");

type Admin = SupabaseClient<Database>;

const H = 3_600_000;
/** People told about one listing at most, and how many addresses are looked up at once. */
const MAX_FOLLOWERS = 2000;
const LOOKUPS_AT_ONCE = 20;

const ORDER_COLUMNS =
  "id, buyer_id, seller_id, event_title, event_date, tier_name, quantity, amount, fee, materai, rail, chain_id, " +
  "disputes(reason, verdict_remedy, refund_amount, decided_at)";

type OrderRow = {
  id: string;
  buyer_id: string;
  seller_id: string | null;
  event_title: string;
  event_date: string;
  tier_name: string;
  quantity: number;
  amount: number;
  fee: number;
  materai: number;
  rail: string | null;
  chain_id: number | null;
  disputes: Claim | Claim[] | null;
};
type Claim = { reason: DisputeReason; verdict_remedy: Remedy | null; refund_amount: number | null; decided_at: string | null };

/** An account's sign-in address, or null when the account is gone. */
async function addressOf(admin: Admin, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    if (error.status === 404) return null;
    throw new Error(error.message);
  }
  return data.user?.email ?? null;
}

const mail = (to: string | null, kind: string, ref: string, r: Rendered): Mail[] => (to ? [{ to, kind, ref, ...r }] : []);

async function loadOrders(admin: Admin, ids: string[]) {
  const { data, error } = await admin.from("orders").select(ORDER_COLUMNS).in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderRow[];
}

function factsOf(r: OrderRow): OrderFacts {
  return {
    id: r.id,
    eventTitle: r.event_title,
    eventDate: r.event_date,
    tierName: r.tier_name,
    quantity: r.quantity,
    amount: Number(r.amount),
    fee: Number(r.fee),
    materai: Number(r.materai),
    currency: r.rail === "usdc" ? "USDC" : "IDR",
    chainId: r.chain_id,
  };
}

const claimOf = (r: OrderRow) => (Array.isArray(r.disputes) ? r.disputes[0] : r.disputes) ?? null;

/** The order is written and its money held: QRIS (lib/payments/checkout), USDC (lib/payments/usdc), or the straight path (api/orders). */
export function notifyOrderPaid(admin: Admin, orderId: string) {
  queueEmails(`order-paid ${orderId}`, async () => {
    const [row] = await loadOrders(admin, [orderId]);
    if (!row) return [];
    return mail(await addressOf(admin, row.buyer_id), "order-paid", row.id, orderPaid(factsOf(row)));
  });
}

/** The buyer filed a claim (api/orders/[id]): the seller hears it, the buyer gets a receipt. */
export function notifyClaimFiled(admin: Admin, orderId: string) {
  queueEmails(`claim ${orderId}`, async () => {
    const [row] = await loadOrders(admin, [orderId]);
    const claim = row && claimOf(row);
    if (!row || !claim) return [];
    const o = factsOf(row);
    const [buyer, seller] = await Promise.all([addressOf(admin, row.buyer_id), addressOf(admin, row.seller_id)]);
    return [...mail(seller, "claim-seller", row.id, claimToSeller(o, claim.reason)), ...mail(buyer, "claim-buyer", row.id, claimReceipt(o, claim.reason))];
  });
}

/** Staff ruled on a claim (api/orders/[id]): both sides hear it. */
export function notifyRuling(admin: Admin, orderId: string) {
  queueEmails(`ruling ${orderId}`, async () => {
    const [row] = await loadOrders(admin, [orderId]);
    const claim = row && claimOf(row);
    if (!row || !claim?.verdict_remedy || !claim.decided_at) return [];
    const o = factsOf(row);
    const refund = Number(claim.refund_amount ?? 0);
    const [buyer, seller] = await Promise.all([addressOf(admin, row.buyer_id), addressOf(admin, row.seller_id)]);
    return [
      ...mail(buyer, "ruling-buyer", row.id, ruling(o, "buyer", claim.verdict_remedy, refund)),
      ...mail(seller, "ruling-seller", row.id, ruling(o, "seller", claim.verdict_remedy, refund)),
    ];
  });
}

/** Orders this cancellation refunded (api/events/[id]); a run that finishes the rest later sends theirs then. */
export function notifyShowCancelled(admin: Admin, orderIds: string[]) {
  if (!orderIds.length) return;
  queueEmails(`cancelled ${orderIds.length} orders`, async () => {
    const rows = await loadOrders(admin, orderIds);
    const out: Mail[] = [];
    for (const row of rows) out.push(...mail(await addressOf(admin, row.buyer_id), "show-cancelled", row.id, showCancelled(factsOf(row))));
    return out;
  });
}

/**
 * A show's followers hear about new tickets at most once in this many hours, however many sellers
 * list: at most four alert emails a day per show they follow. After the first one the show's page
 * lists whatever comes next, so more emails the same afternoon would be noise, and this bounds what
 * any number of accounts can send to one show's followers.
 */
const SHOW_QUIET_H = 6;
/** One seller's listings on a show reach its followers at most once in this many hours. */
const SELLER_QUIET_H = 24;

type LiveListing = { id: string; event_id: string; seller_id: string | null; created_at: string; cleared_at: string | null };

/**
 * Why this listing's followers are not told, or null when they are. Listing costs nothing and a
 * listing can be withdrawn and posted again, so without this a seller could email every follower
 * of a show in a loop. Only listings that came before this one count, so of two at once the first
 * is told; a listing held back still counts, so posting again gains nothing.
 */
async function heldBack(admin: Admin, l: LiveListing): Promise<string | null> {
  const count = (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) =>
    Promise.resolve(q).then((r) => {
      if (r.error) throw new Error(r.error.message);
      return r.count ?? 0;
    });
  const others = () => admin.from("listings").select("id", { count: "exact", head: true }).eq("event_id", l.event_id).neq("id", l.id);
  const sellerFrom = new Date(Date.parse(l.created_at) - SELLER_QUIET_H * H).toISOString();
  // Live from its clearance when staff cleared it, from its posting otherwise.
  const liveAt = l.cleared_at ?? l.created_at;
  const showFrom = new Date(Date.parse(liveAt) - SHOW_QUIET_H * H).toISOString();
  const [sameSeller, cleared, posted] = await Promise.all([
    l.seller_id ? count(others().eq("seller_id", l.seller_id).gte("created_at", sellerFrom).lt("created_at", l.created_at)) : 0,
    count(others().gte("cleared_at", showFrom).lt("cleared_at", liveAt)),
    // Live as soon as it was posted: never held, so no clearance. One withdrawn while still held
    // counts too, which only ever holds back more.
    count(others().is("cleared_at", null).in("status", ["active", "sold", "cancelled"]).gte("created_at", showFrom).lt("created_at", liveAt)),
  ]);
  if (sameSeller) return `its seller listed on this show in the ${SELLER_QUIET_H} hours before`;
  if (cleared + posted) return `another listing of this show went live in the ${SHOW_QUIET_H} hours before`;
  return null;
}

/**
 * A listing just went on sale: saved active (api/listings), or cleared by staff from review
 * (api/listings/[id]). Everyone following its show, or its tier, hears once, however many of their
 * alerts match; the seller does not; and not at all when heldBack says so. A listing goes on sale
 * only once (one conditional update moves it out of review, and nothing moves it back), so nobody
 * hears twice about the same listing.
 */
export function notifyListingLive(admin: Admin, listingId: string) {
  queueEmails(`listing ${listingId}`, async () => {
    const { data: listing, error } = await admin
      .from("listings")
      .select("id, event_id, tier_id, seller_id, ask_price, quantity, status, created_at, cleared_at")
      .eq("id", listingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!listing || listing.status !== "active") return [];
    const why = await heldBack(admin, listing);
    if (why) {
      console.info("[email] new-ticket alert held back:", listing.id, why);
      return [];
    }
    const [ev, tier, subs] = await Promise.all([
      admin.from("catalogue_events").select("title, starts_at, status, currency").eq("id", listing.event_id).maybeSingle(),
      admin.from("tiers").select("name").eq("id", listing.tier_id).maybeSingle(),
      admin
        .from("alert_subscriptions")
        .select("user_id")
        .eq("event_id", listing.event_id)
        // Ids are checked by the database (^[a-z0-9-]{3,64}$), so this filter cannot be bent.
        .or(`tier_id.is.null,tier_id.eq.${listing.tier_id}`)
        .order("id")
        .limit(MAX_FOLLOWERS),
    ]);
    const failed = ev.error ?? tier.error ?? subs.error;
    if (failed) throw new Error(failed.message);
    const show = ev.data;
    if (!show?.title || !show.starts_at || !tier.data || show.status === "cancelled") return [];
    if (Date.now() >= new Date(show.starts_at).getTime() + EVENT_DURATION_H * H) return [];

    const people = [...new Set((subs.data ?? []).map((s) => s.user_id))].filter((id) => id !== listing.seller_id);
    if (!people.length) return [];
    const letter = ticketsListed({
      eventId: listing.event_id,
      eventTitle: show.title,
      eventDate: show.starts_at,
      tierName: tier.data.name,
      quantity: listing.quantity,
      askPrice: Number(listing.ask_price),
      currency: show.currency === "USDC" ? "USDC" : "IDR",
    });
    const out: Mail[] = [];
    for (let i = 0; i < people.length; i += LOOKUPS_AT_ONCE) {
      const batch = await Promise.all(people.slice(i, i + LOOKUPS_AT_ONCE).map((id) => addressOf(admin, id).catch(() => null)));
      for (const to of batch) out.push(...mail(to, "tickets-listed", listing.id, letter));
    }
    return out;
  });
}
