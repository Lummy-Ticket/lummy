// Paying with QRIS through Xendit (docs/09 §6).
//   1. Pay holds the seats (claim_listing) and opens a QRIS payment that expires with the hold.
//   2. The order is written only when Xendit reports the money, and the report is always read
//      back from Xendit itself: a webhook is only a nudge, so a forged one writes nothing.
//   3. A hold nobody paid gives its seats back a few minutes after the QRIS expired at Xendit
//      (expire_payments), so a payment can no longer land on seats sold to someone else. Money
//      that arrives anyway takes the seats again if they are free, or waits for a refund.
// One open hold per buyer: starting another closes the first.
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOrderPaid } from "@/lib/email/notify";
import { checkPurchase, loadPurchase, orderInsert, priceOf } from "@/lib/orders/create";
import { queueLedgerSync } from "@/lib/orders/ledger";
import type { Database } from "@/lib/supabase/types";
import { GRACE_SECONDS, HOLD_MINUTES } from "./hold";
import type { PaymentStatus, PaymentView } from "./types";
import {
  cancelQris, createQris, QRIS_MAX, readPayment, readQris, XENDIT_PAYMENT_ID, XenditError, xenditConfig, type Qris, type XenditConfig,
} from "./xendit";

if (typeof window !== "undefined") throw new Error("lib/payments/checkout hanya boleh dipakai di server");

type Admin = SupabaseClient<Database>;
export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false, status, error }) as const;

/** A page asking every few seconds reads Xendit at most this often. */
const RECHECK_MS = 10_000;
/**
 * New holds one buyer may open in HOLD_RATE_MINUTES. A person never needs that many; the cap keeps
 * one account from flooding Xendit with QRIS requests or churning seats.
 */
const HOLDS_PER_WINDOW = 20;
const HOLD_RATE_MINUTES = 10;
export const PAYMENT_ID = /^pay-[0-9a-f]{12}$/;

const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const seatsChanged = () => revalidateTag("catalogue", { expire: 0 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stale = (row: PaymentRow) => !row.checked_at || Date.now() - Date.parse(row.checked_at) >= RECHECK_MS;

export function paymentView(row: PaymentRow, orderId: string | null): PaymentView {
  return {
    id: row.id,
    status: row.status as PaymentStatus,
    amount: Number(row.total),
    expiresAt: row.expires_at,
    qrString: row.status === "pending" ? row.qr_string : null,
    testMode: row.test_mode,
    orderId,
  };
}

async function reread(admin: Admin, id: string): Promise<PaymentRow> {
  const { data, error } = await admin.from("payments").select("*").eq("id", id).single();
  if (error || !data) throw new Error(error?.message ?? "pembayaran tidak ditemukan");
  return data;
}

export async function orderIdOf(admin: Admin, paymentId: string): Promise<string | null> {
  const { data, error } = await admin.from("orders").select("id").eq("payment_id", paymentId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/** Holds past their time plus grace give the seats back. Returns how many closed. */
export async function expireHolds(admin: Admin) {
  const { data, error } = await admin.rpc("expire_payments", { p_grace_seconds: GRACE_SECONDS });
  if (error) throw new Error(error.message);
  if (data?.length) seatsChanged();
  return data?.length ?? 0;
}

/** Closes an open hold and gives its seats back; unfulfilled means money came that cannot be honoured. */
async function close(admin: Admin, id: string, status: "expired" | "canceled" | "failed" | "unfulfilled") {
  const { data, error } = await admin.rpc("close_payment", { p_id: id, p_status: status });
  if (error) throw new Error(error.message);
  if (data) seatsChanged();
}

/**
 * The order for a paid hold, written once: orders.payment_id is unique, so a second writer gets
 * the first one's order. A show or listing cancelled while the QRIS was open gets no order; the
 * money waits for a refund instead.
 */
async function ensureOrder(admin: Admin, row: PaymentRow): Promise<string | null> {
  const existing = await orderIdOf(admin, row.id);
  if (existing) return existing;
  const loaded = await loadPurchase(admin, row.listing_id);
  if (!loaded.ok) throw new Error(loaded.error);
  const p = loaded.purchase;
  if (!p || p.listing.status === "cancelled" || p.listing.status === "rejected" || p.event.status === "cancelled") {
    await admin.from("payments").update({ status: "unfulfilled", updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "paid");
    console.error("[payments] paid, but the listing or show is gone; refund it:", row.id);
    return null;
  }
  // The amounts the buyer paid, kept on the hold, not the listing's price today.
  const price = { amount: Number(row.amount), fee: Number(row.fee), materai: Number(row.materai) };
  const ins = await admin
    .from("orders")
    .insert(orderInsert(row.buyer_id, p, row.quantity, { endsAt: p.scheduledEnd, paymentId: row.id, price }))
    .select("id")
    .single();
  if (ins.error) {
    if (ins.error.code === "23505") return orderIdOf(admin, row.id);
    throw new Error(ins.error.message);
  }
  // The public record on chain follows once the answer is sent (docs/09 §7), and so does the
  // buyer's email. Only the writer of the order gets here, so it goes once.
  queueLedgerSync(admin, ins.data.id);
  notifyOrderPaid(admin, ins.data.id);
  return ins.data.id;
}

/**
 * The payment number a webhook named, once Xendit itself confirms it is a finished payment of this
 * hold's QRIS. Null otherwise: the webhook's word alone is never stored.
 */
async function confirmedNumber(cfg: XenditConfig, row: PaymentRow, named: string | null): Promise<string | null> {
  if (!named || !XENDIT_PAYMENT_ID.test(named) || !row.provider_ref) return null;
  const p = await readPayment(cfg, named).catch(() => null);
  return p && p.paymentRequestId === row.provider_ref && p.status === "SUCCEEDED" ? p.id : null;
}

/** Records Xendit's payment number on a hold that has none yet; one already there is kept. */
async function fillNumber(admin: Admin, id: string, number: string | null) {
  if (!number) return;
  const { data } = await admin.from("payments").select("provider_payment_id").eq("id", id).single();
  if (data && !data.provider_payment_id) {
    await admin.from("payments").update({ provider_payment_id: number, updated_at: new Date().toISOString() }).eq("id", id);
  }
}

/**
 * Brings a hold up to date with Xendit, and writes the order once the money is in. Holds still
 * open are read at most every RECHECK_MS unless `force` (the webhook, the simulator). Closed holds
 * are read again only when forced, for money that arrives late. `named` is the payment number a
 * webhook carried; it is only kept after Xendit confirms it.
 */
export async function syncPayment(admin: Admin, cfg: XenditConfig, row: PaymentRow, force = false, named: string | null = null): Promise<PaymentRow> {
  if (row.status === "paid") {
    // Paid before Xendit had named the payment: fill its number in from a webhook or a later read.
    if (!row.provider_payment_id && row.provider_ref && (force || stale(row))) {
      const number = (await confirmedNumber(cfg, row, named)) ?? (await readQris(cfg, row.provider_ref).catch(() => null))?.latestPaymentId ?? null;
      await admin.from("payments").update({ checked_at: new Date().toISOString() }).eq("id", row.id);
      await fillNumber(admin, row.id, number);
    }
    await ensureOrder(admin, row);
    return reread(admin, row.id);
  }
  // Money waiting for a refund, or already refunded: nothing Xendit says can change it now.
  if (row.status === "unfulfilled" || row.status === "refunded") return row;
  if (!row.provider_ref) {
    // The request never reached Xendit, so nobody can pay it: close it once its time is up.
    if (row.status === "pending" && Date.parse(row.expires_at) < Date.now()) await close(admin, row.id, "failed");
    return reread(admin, row.id);
  }
  if (row.status !== "pending" && !force) return row;
  if (!force && !stale(row)) return row;

  let qris: Qris;
  try {
    qris = await readQris(cfg, row.provider_ref);
  } catch (e) {
    console.error("[payments] could not read Xendit for", row.id, (e as Error).message);
    return row;
  }
  await admin.from("payments").update({ checked_at: new Date().toISOString() }).eq("id", row.id);

  if (qris.status === "SUCCEEDED") {
    if (qris.referenceId !== row.id || qris.amount !== Number(row.total)) {
      // Money arrived that does not match this hold, so it cannot be honoured: the seats go back and
      // the money waits for a refund, where staff can see it, instead of the hold quietly expiring.
      console.error("[payments] Xendit reports a payment that does not match its hold; refund it:", row.id, qris.id);
      if (row.status === "pending") await close(admin, row.id, "unfulfilled");
      else {
        await admin
          .from("payments")
          .update({ status: "unfulfilled", updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .in("status", ["expired", "canceled", "failed"]);
      }
      return reread(admin, row.id);
    }
    // Right after a payment Xendit can answer SUCCEEDED before the request names the payment (seen
    // for several seconds on 8 Oct 2026). Xendit's webhook names it at once, so take that number
    // once Xendit confirms it; without one, ask the request a few more times.
    let number = qris.latestPaymentId ?? (await confirmedNumber(cfg, row, named));
    for (let i = 0; i < 3 && !number; i++) {
      await sleep(1000);
      number = (await readQris(cfg, row.provider_ref).catch(() => null))?.latestPaymentId ?? null;
    }
    const marked = await admin.rpc("mark_payment_paid", { p_id: row.id, p_provider_payment_id: number ?? "" });
    if (marked.error) throw new Error(marked.error.message);
    // Another reader may have marked it first, without the number: record it now.
    await fillNumber(admin, row.id, number);
    if (row.status !== "pending") seatsChanged();
    if (marked.data === "paid") await ensureOrder(admin, await reread(admin, row.id));
    if (marked.data === "unfulfilled") console.error("[payments] paid after its seats went back; refund it:", row.id);
    return reread(admin, row.id);
  }

  if (row.status === "pending") {
    if (qris.status === "EXPIRED" || qris.status === "CANCELED" || qris.status === "FAILED") {
      await close(admin, row.id, qris.status === "FAILED" ? "failed" : qris.status === "CANCELED" ? "canceled" : "expired");
    } else if (Date.parse(row.expires_at) + GRACE_SECONDS * 1000 < Date.now()) {
      // Still open at Xendit well past its time: shut it there first, then give the seats back.
      // Paid in between, the cancel fails and the next read finds the money.
      try {
        await cancelQris(cfg, row.provider_ref);
        await close(admin, row.id, "expired");
      } catch (e) {
        console.error("[payments] could not cancel an overdue QRIS:", row.id, (e as Error).message);
      }
    }
  }
  return reread(admin, row.id);
}

/** The buyer gives up the hold: shut the QRIS at Xendit, then give the seats back. */
export async function cancelHold(admin: Admin, cfg: XenditConfig, row: PaymentRow): Promise<PaymentRow> {
  if (row.status !== "pending") return row;
  if (row.provider_ref) {
    try {
      await cancelQris(cfg, row.provider_ref);
    } catch {
      // Maybe paid a moment ago: let Xendit's answer decide.
      const fresh = await syncPayment(admin, cfg, row, true);
      if (fresh.status !== "pending") return fresh;
      throw new XenditError("QRIS belum bisa dibatalkan, coba lagi sebentar", 502);
    }
  }
  await close(admin, row.id, "canceled");
  return reread(admin, row.id);
}

/**
 * The show was cancelled: every QRIS still open on its listings is shut at Xendit and its seats go
 * back, before the listings themselves close. One paid a moment ago takes its own path, which finds
 * the show cancelled and leaves the money waiting for a refund. Returns how many closed, and how many
 * could not be shut yet (they run out with their QRIS, 15 minutes at most).
 */
export async function closeHoldsOfEvent(admin: Admin, eventId: string): Promise<{ closed: number; left: number }> {
  const listings = await admin.from("listings").select("id").eq("event_id", eventId);
  if (listings.error) throw new Error(listings.error.message);
  if (!listings.data.length) return { closed: 0, left: 0 };
  const open = await admin.from("payments").select("*").in("listing_id", listings.data.map((l) => l.id)).eq("status", "pending");
  if (open.error) throw new Error(open.error.message);
  const cfg = xenditConfig();
  let closed = 0;
  let left = 0;
  for (const row of open.data) {
    try {
      let now = row;
      if (cfg) now = await cancelHold(admin, cfg, row);
      else {
        await close(admin, row.id, "canceled");
        now = await reread(admin, row.id);
      }
      if (now.status === "pending") left++;
      else closed++;
    } catch (e) {
      left++;
      console.error("[payments] could not close a hold on a cancelled show:", row.id, (e as Error).message);
    }
  }
  return { closed, left };
}

/**
 * Pay with QRIS: hold the seats, open the QRIS, and hand back what the page shows. Pressing Pay
 * again for the same seats while the code is still good returns the same hold.
 */
export async function startCheckout(
  admin: Admin,
  cfg: XenditConfig,
  buyerId: string,
  listingId: string,
  quantity: number
): Promise<Result<PaymentView>> {
  await expireHolds(admin);

  const open = await admin.from("payments").select("*").eq("buyer_id", buyerId).eq("status", "pending");
  if (open.error) return fail(500, open.error.message);
  const release = (row: PaymentRow) =>
    cancelHold(admin, cfg, row).catch((e) => console.error("[payments] could not close an older hold:", row.id, (e as Error).message));
  // The same seats with time left: hand back the same code. Other seats of the same listing go
  // back first, so this hold counts them.
  for (const row of (open.data ?? []).filter((r) => r.listing_id === listingId)) {
    if (row.quantity === quantity && row.provider_ref && Date.parse(row.expires_at) - Date.now() > 60_000) {
      const fresh = await syncPayment(admin, cfg, row, true);
      if (fresh.status === "pending") return { ok: true, value: paymentView(fresh, null) };
      if (fresh.status === "paid") return { ok: true, value: paymentView(fresh, await orderIdOf(admin, fresh.id)) };
    } else {
      await release(row);
    }
  }

  // A start that cannot go ahead leaves the buyer's other hold alone.
  const check = await checkPurchase(admin, buyerId, listingId);
  if (!check.ok) return check;
  if (check.purchase.event.currency !== "IDR") return fail(400, "acara ini dibayar dengan USDC dari wallet, bukan QRIS");
  const price = priceOf(check.purchase.listing.ask_price, quantity);
  if (price.total > QRIS_MAX) {
    return fail(400, `QRIS paling banyak ${rupiah(QRIS_MAX)} per pembayaran, sedangkan totalnya ${rupiah(price.total)}. Kurangi jumlah tiketnya.`);
  }
  const recent = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", buyerId)
    .gte("created_at", new Date(Date.now() - HOLD_RATE_MINUTES * 60_000).toISOString());
  if (recent.error) return fail(500, recent.error.message);
  if ((recent.count ?? 0) >= HOLDS_PER_WINDOW) {
    return fail(429, `terlalu banyak percobaan bayar dalam ${HOLD_RATE_MINUTES} menit terakhir; coba lagi sebentar lagi`);
  }
  // One open hold per buyer: this one replaces any on other listings.
  for (const row of (open.data ?? []).filter((r) => r.listing_id !== listingId)) await release(row);

  const claim = await admin.rpc("claim_listing", { p_listing_id: listingId, p_quantity: quantity });
  if (claim.error) return fail(500, claim.error.message);
  // Nothing claimed comes back as a row of nulls, not as null.
  if (!claim.data?.id) return fail(409, "tiketnya baru saja dibeli orang lain, atau jumlahnya tidak tersedia");

  const expiresAt = new Date(Math.ceil((Date.now() + HOLD_MINUTES * 60_000) / 1000) * 1000);
  const inserted = await admin
    .from("payments")
    .insert({ buyer_id: buyerId, listing_id: listingId, quantity, ...price, test_mode: cfg.testMode, expires_at: expiresAt.toISOString() })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) {
    await admin.rpc("release_listing", { p_listing_id: listingId, p_quantity: quantity });
    // Another tab of this buyer opened a hold a moment ago (one open hold per buyer is a database
    // rule, payments_one_open_per_buyer): hand that one back if it is for these seats and ready.
    if (inserted.error?.code === "23505") {
      const other = await admin.from("payments").select("*").eq("buyer_id", buyerId).eq("status", "pending").maybeSingle();
      if (other.data && other.data.listing_id === listingId && other.data.quantity === quantity && other.data.provider_ref) {
        return { ok: true, value: paymentView(other.data, null) };
      }
      return fail(409, "masih ada pembayaran lain yang berjalan; selesaikan atau batalkan dulu");
    }
    return fail(500, inserted.error?.message ?? "pembayaran gagal disimpan");
  }
  const row = inserted.data;
  seatsChanged();

  let qrisId: string | null = null;
  try {
    const qris = await createQris(cfg, { referenceId: row.id, amount: price.total, expiresAt, description: `Lummy Ticket ${row.id}` });
    qrisId = qris.id;
    if (!qris.qrString) throw new XenditError("Xendit tidak mengirim kode QR", 502);
    const now = new Date().toISOString();
    const saved = await admin
      .from("payments")
      .update({ provider_ref: qris.id, qr_string: qris.qrString, checked_at: now, updated_at: now })
      .eq("id", row.id)
      .select("*")
      .single();
    if (saved.error || !saved.data) throw new Error(saved.error?.message ?? "pembayaran gagal disimpan");
    return { ok: true, value: paymentView(saved.data, null) };
  } catch (e) {
    // Nobody saw a code for this hold, so nobody can pay it: shut it and give the seats back.
    if (qrisId) await cancelQris(cfg, qrisId).catch(() => null);
    await close(admin, row.id, "failed").catch(() => null);
    return fail(502, `QRIS gagal dibuat: ${(e as Error).message}`);
  }
}
