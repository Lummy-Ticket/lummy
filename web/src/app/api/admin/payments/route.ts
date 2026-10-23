// Money that needs a person, for staff (docs/09 §6, §7): QRIS payments that came in without an order
// and wait for a refund, public-ledger records the contract refused, and the latest payments. Until
// Money Out is connected a refund goes out from the Xendit dashboard; staff record it here, so the
// list only holds what is still owed.
//   GET   the overview
//   POST  { action: "refunded", id, note }   a refund was sent for an unfulfilled payment
//   POST  { action: "ledger-retry", orderId } clear a refused record and try the chain again
import { NextResponse } from "next/server";
import { formatEther, parseEther } from "viem";
import { publicClient } from "@/lib/chain/escrow";
import { ledgerTarget } from "@/lib/chain/ledger";
import { ledgerAccount } from "@/lib/chain/server";
import { syncLedger } from "@/lib/orders/ledger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";
import type { PaymentsOverview, StaffPayment } from "@/lib/payments/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

const PAYMENT_ID = /^pay-[0-9a-f]{12}$/;
const ORDER_ID = /^[\w-]{1,64}$/;
/** Xendit refunds a QRIS payment only within 7 days of it; after that the money goes back as a transfer. */
const QRIS_REFUND_DAYS = 7;
/** The same floor lib/orders/ledger.ts stops at. */
const GAS_FLOOR = parseEther("0.002");

const SELECT =
  "id, status, total, test_mode, provider_payment_id, provider_ref, created_at, paid_at, refunded_at, refund_note, buyer_id, " +
  "listing:listings!payments_listing_id_fkey(events(title)), orders(id, ledger_id, ledger_status)";

type Row = {
  id: string;
  status: string;
  total: number;
  test_mode: boolean;
  provider_payment_id: string | null;
  provider_ref: string | null;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
  refund_note: string | null;
  buyer_id: string;
  listing: { events: { title: string } | null } | null;
  orders: { id: string; ledger_id: string | null; ledger_status: string | null } | { id: string; ledger_id: string | null; ledger_status: string | null }[] | null;
};

async function staff() {
  const admin = supabaseAdmin();
  if (!admin) return { error: fail(503, "database belum tersambung di server ini") } as const;
  const user = await currentUser();
  if (!user) return { error: fail(401, "masuk dulu") } as const;
  if (!user.staff) return { error: fail(403, "cuma staf") } as const;
  return { admin, user } as const;
}

export async function GET() {
  const s = await staff();
  if ("error" in s) return s.error;
  const { admin } = s;

  const [needs, refunded, recent, stuck, waiting] = await Promise.all([
    // QRIS only: a USDC payment settles on chain, refunds included, so staff have nothing to do here.
    admin.from("payments").select(SELECT).eq("provider", "xendit").eq("status", "unfulfilled").order("paid_at", { ascending: false }).limit(50),
    admin.from("payments").select(SELECT).eq("provider", "xendit").eq("status", "refunded").order("refunded_at", { ascending: false }).limit(10),
    admin.from("payments").select(SELECT).eq("provider", "xendit").order("created_at", { ascending: false }).limit(20),
    admin
      .from("orders")
      .select("id, event_title, amount, escrow_status, ledger_error, ledger_id")
      .not("ledger_error", "is", null)
      .order("ledger_synced_at", { ascending: false })
      .limit(50),
    admin.from("orders").select("id", { count: "exact", head: true }).not("payment_id", "is", null).is("ledger_status", null).is("ledger_error", null),
  ]);
  const failed = [needs, refunded, recent, stuck, waiting].find((r) => r.error)?.error;
  if (failed) return fail(500, failed.message);

  const rows = (r: { data: unknown }) => (r.data ?? []) as Row[];
  // Names for everyone listed; emails only for the people staff may have to send money back to.
  const owed = [...rows(needs), ...rows(refunded)];
  const ids = [...new Set(owed.map((r) => r.buyer_id))];
  const [profiles, emails] = await Promise.all([
    ids.length ? admin.from("profiles").select("id, full_name").in("id", ids) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    Promise.all(ids.map(async (id) => [id, (await admin.auth.admin.getUserById(id)).data.user?.email ?? null] as const)),
  ]);
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
  const mail = new Map(emails);

  const view = (r: Row, withBuyer: boolean): StaffPayment => {
    const order = Array.isArray(r.orders) ? r.orders[0] : r.orders;
    return {
      id: r.id,
      status: r.status,
      total: Number(r.total),
      testMode: r.test_mode,
      number: r.provider_payment_id || null,
      createdAt: r.created_at,
      paidAt: r.paid_at,
      refundedAt: r.refunded_at,
      refundNote: r.refund_note,
      eventTitle: r.listing?.events?.title ?? "",
      buyer: withBuyer ? { name: names.get(r.buyer_id) || "Lummy", email: mail.get(r.buyer_id) ?? null } : null,
      refundBy: r.paid_at ? new Date(Date.parse(r.paid_at) + QRIS_REFUND_DAYS * 86_400_000).toISOString() : null,
      orderId: order?.id ?? null,
      ledgerId: order?.ledger_id ?? null,
      ledgerStatus: order?.ledger_status ?? null,
    };
  };

  // The ledger's health: which contract, and whether its operator still has gas to record with.
  let ledger: PaymentsOverview["ledger"] = null;
  const t = ledgerTarget();
  if (t) {
    const account = ledgerAccount(t.chain.id);
    const balance = account
      ? await publicClient(t.chain, t.rpcUrl)
          .getBalance({ address: account.address })
          .catch(() => null)
      : null;
    ledger = {
      contract: t.ledger,
      chainId: t.chain.id,
      operator: account?.address ?? null,
      gasEth: balance === null ? null : Number(formatEther(balance)).toFixed(4),
      low: balance !== null && balance < GAS_FLOOR,
      waiting: waiting.count ?? 0,
    };
  }

  const overview: PaymentsOverview = {
    needsRefund: rows(needs).map((r) => view(r, true)),
    refunded: rows(refunded).map((r) => view(r, true)),
    recent: rows(recent).map((r) => view(r, false)),
    stuck: (stuck.data ?? []).map((o) => ({
      id: o.id,
      eventTitle: o.event_title,
      amount: Number(o.amount),
      escrowStatus: o.escrow_status,
      error: o.ledger_error ?? "",
      ledgerId: o.ledger_id,
    })),
    ledger,
  };
  return NextResponse.json(overview, { headers: noStore });
}

export async function POST(req: Request) {
  const s = await staff();
  if ("error" in s) return s.error;
  const { admin, user } = s;
  const body = ((await req.json().catch(() => null)) ?? {}) as { action?: unknown; id?: unknown; orderId?: unknown; note?: unknown };

  if (body.action === "refunded") {
    const id = String(body.id ?? "");
    if (!PAYMENT_ID.test(id)) return fail(400, "nomor pembayaran tidak dikenal");
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    const at = new Date().toISOString();
    const r = await admin
      .from("payments")
      .update({ status: "refunded", refunded_at: at, refunded_by: user.id, refund_note: note || null, updated_at: at })
      .eq("id", id)
      .eq("provider", "xendit")
      .eq("status", "unfulfilled")
      .select("id");
    if (r.error) return fail(500, r.error.message);
    if (!r.data.length) return fail(409, "pembayaran ini tidak sedang menunggu refund");
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  if (body.action === "ledger-retry") {
    const orderId = String(body.orderId ?? "");
    if (!ORDER_ID.test(orderId)) return fail(400, "pesanan tidak dikenal");
    const cleared = await admin
      .from("orders")
      .update({ ledger_error: null })
      .eq("id", orderId)
      .not("payment_id", "is", null)
      .not("ledger_error", "is", null)
      .select("id");
    if (cleared.error) return fail(500, cleared.error.message);
    if (!cleared.data.length) return fail(409, "catatan pesanan ini tidak sedang macet");
    // Staff wait for the answer here: the chain either takes the missing steps now or says why not.
    const result = await syncLedger(admin, orderId);
    return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: noStore });
  }

  return fail(400, "aksi tidak dikenal");
}
