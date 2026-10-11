// Menyusulkan buku besar publik dengan database untuk pesanan QRIS (docs/09 §7). Database yang
// memutuskan, karena uangnya di Xendit; kontrak LummyLedger mencatat. Satu fungsi membandingkan pesanan
// dengan catatannya di chain lalu mengirim langkah yang kurang, berurutan: catat pembayaran, undur
// jadwal, klaim, lalu putusan, pencairan, atau refund. Dipanggil sesudah tiap perubahan pesanan (lewat
// after(), jadi pengguna tidak menunggu chain) dan oleh sapuan harian, jadi langkah yang gagal terkirim
// menyusul sendiri. Penolakan kontrak yang tidak akan hilang dengan dicoba ulang dicatat di ledger_error
// untuk diperiksa staf, dan pesanan itu berhenti dicoba.
import { after } from "next/server";
import { formatEther, parseEther, type Hex } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicClient } from "@/lib/chain/escrow";
import {
  handoverHashOf,
  ledgerAs,
  ledgerOrderId,
  ledgerTarget,
  paymentRefOf,
  readRecord,
  ticketCommitOf,
  type LedgerRecord,
  type LedgerStatus,
  type RefundReason,
} from "@/lib/chain/ledger";
import { chainError, ledgerAccount, serial } from "@/lib/chain/server";
import type { Database } from "@/lib/supabase/types";

if (typeof window !== "undefined") throw new Error("lib/orders/ledger hanya boleh dipakai di server");

type Admin = SupabaseClient<Database>;

const ARBITRUM_ONE = 42161;
/** Di bawah saldo ini operator tidak mengirim apa pun, supaya checkout escrow demo tidak kehabisan gas. */
const GAS_FLOOR = parseEther("0.002");
/** Penolakan kontrak yang datanya sendiri tidak cocok: dicoba ulang pun hasilnya sama. */
const PERMANENT = new Set([
  "WindowClosed", "PaymentAlreadyUsed", "CommitAlreadyUsed", "CannotMoveEventEarlier", "NotDisputed", "AmountAbovePrice",
  "IsDisputed", "ZeroAmount", "NoPaymentRef", "NoHandoverProof", "NoEventEnd",
]);

const SELECT =
  "id, amount, escrow_status, disputed, event_ends_at, auto_refund_reason, payment_id, listing_id, " +
  "ledger_id, ledger_chain_id, ledger_contract, ledger_status, ledger_error, disputes(decided_at, refund_amount)";

type Row = {
  id: string;
  amount: number;
  escrow_status: string;
  disputed: boolean;
  event_ends_at: string | null;
  auto_refund_reason: string | null;
  payment_id: string | null;
  listing_id: string | null;
  ledger_id: string | null;
  ledger_chain_id: number | null;
  ledger_contract: string | null;
  ledger_status: string | null;
  ledger_error: string | null;
  disputes: { decided_at: string | null; refund_amount: number | null } | { decided_at: string | null; refund_amount: number | null }[] | null;
};

export type LedgerSync =
  | { ok: true; status: LedgerStatus | "Skipped"; txs: Hex[] }
  | { ok: false; error: string; permanent: boolean };

/** Yang seharusnya tercatat, menurut database. */
function wanted(row: Row) {
  const dispute = Array.isArray(row.disputes) ? row.disputes[0] : row.disputes;
  const final = row.escrow_status === "Released" || row.escrow_status === "Refunded" ? row.escrow_status : null;
  const reason: RefundReason =
    row.auto_refund_reason === "EVENT_CANCELLED" ? "EventCancelled" : row.auto_refund_reason === "EVENT_POSTPONED" ? "EventPostponed" : "Other";
  return {
    final,
    disputed: row.disputed || !!dispute,
    endsAt: Math.floor(new Date(row.event_ends_at ?? 0).getTime() / 1000),
    // Putusan staf dicatat sebagai pembagian; tanpa putusan, pencairan atau refund biasa.
    toBuyer: final && dispute?.decided_at ? Math.round(Number(dispute.refund_amount ?? 0)) : null,
    reason,
  };
}

const closed = (rec: LedgerRecord) => !rec.disputed && rec.now > rec.deadline;

export async function syncLedger(admin: Admin, orderId: string): Promise<LedgerSync> {
  const { data, error } = await admin.from("orders").select(SELECT).eq("id", orderId).maybeSingle();
  if (error) return { ok: false, error: error.message, permanent: false };
  const row = data as unknown as Row | null;
  if (!row?.payment_id) return { ok: false, error: "bukan pesanan QRIS", permanent: true };
  if (row.ledger_status === "Skipped") return { ok: true, status: "Skipped", txs: [] };
  if (row.ledger_error) return { ok: false, error: row.ledger_error, permanent: true };

  const failed = async (message: string, permanent: boolean): Promise<LedgerSync> => {
    await admin
      .from("orders")
      .update({ ledger_synced_at: new Date().toISOString(), ...(permanent ? { ledger_error: message.slice(0, 300) } : {}) })
      .eq("id", row.id);
    if (permanent) console.error("[ledger] needs a look:", row.id, message);
    return { ok: false, error: message, permanent };
  };

  // App tanpa buku besar (atau tanpa kunci) tetap jalan seperti biasa: tidak ada yang ditulis.
  const t = ledgerTarget(row.ledger_contract ? { chainId: row.ledger_chain_id, address: row.ledger_contract } : undefined);
  if (!t) return { ok: false, error: "buku besar belum di-deploy untuk chain ini", permanent: false };
  const account = ledgerAccount(t.chain.id);
  if (!account) return { ok: false, error: "kunci operator buku besar belum diset", permanent: false };

  const pay = await admin.from("payments").select("provider_ref, test_mode").eq("id", row.payment_id).single();
  if (pay.error) return failed(pay.error.message, false);
  // Pembayaran uji cuma di jaringan uji, uang sungguhan cuma di mainnet: catatan publik tidak boleh
  // mencampur keduanya.
  if (pay.data.test_mode === (t.chain.id === ARBITRUM_ONE)) {
    return failed(pay.data.test_mode ? "pembayaran uji tidak dicatat di mainnet" : "pembayaran sungguhan butuh buku besar mainnet", true);
  }
  if (!pay.data.provider_ref) return failed("pembayaran belum punya nomor Xendit", false);
  if (!row.event_ends_at) return failed("pesanan tanpa jadwal selesai acara", true);

  const want = wanted(row);
  const id = ledgerOrderId(row.id);
  try {
    // Antrean kunci penandatangannya (antrean operator escrow kalau tidak ada kunci khusus), dan catatan
    // dibaca di dalamnya, jadi dua sinkron pesanan yang sama di instance ini tidak mengirim langkah dua kali.
    return await serial(account.address, async (): Promise<LedgerSync> => {
      const pc = publicClient(t.chain, t.rpcUrl);
      const as = ledgerAs(t, account);
      const txs: Hex[] = [];
      let rec = await readRecord(t, id);

      const pending =
        rec.status === "None" ||
        (rec.status === "Open" && (want.endsAt > rec.eventEndsAt || (want.disputed && !rec.disputed) || !!want.final));
      if (pending) {
        const balance = await pc.getBalance({ address: account.address });
        if (balance < GAS_FLOOR) return failed(`saldo gas operator buku besar tinggal ${formatEther(balance)} ETH`, false);
      }

      if (rec.status === "None") {
        const listing = row.listing_id
          ? (await admin.from("listings").select("barcode_hmac, ticket_sha256").eq("id", row.listing_id).maybeSingle()).data
          : null;
        const amount = BigInt(Math.round(Number(row.amount)));
        txs.push(
          await as.open(
            id,
            amount,
            paymentRefOf(pay.data.provider_ref!),
            ticketCommitOf(listing?.barcode_hmac ?? null),
            handoverHashOf(id, listing?.ticket_sha256 ?? null),
            want.endsAt
          )
        );
        // Dari sini catatan diikuti dari efek tiap langkah yang sudah masuk blok, bukan dibaca ulang: RPC
        // publik bisa menjawab dari node yang tertinggal satu blok, sehingga langkah barusan tidak terlihat.
        rec = { ...rec, status: "Open", amount, openedAt: rec.now, eventEndsAt: want.endsAt, disputed: false, deadline: want.endsAt + rec.disputeWindow };
        // Dicatat sekarang juga, supaya halaman pesanan sudah bisa menautkan buktinya walau langkah
        // berikutnya gagal.
        await admin.from("orders").update({ ledger_id: id, ledger_chain_id: t.chain.id, ledger_contract: t.ledger, ledger_status: "Open" }).eq("id", row.id);
      }

      if (rec.status === "Open" && want.endsAt > rec.eventEndsAt && !closed(rec)) {
        txs.push(await as.postponeEvent(id, want.endsAt));
        rec = { ...rec, eventEndsAt: want.endsAt, deadline: want.endsAt + rec.disputeWindow };
      }
      if (rec.status === "Open" && want.disputed && !rec.disputed) {
        txs.push(await as.raiseDispute(id));
        rec = { ...rec, disputed: true };
      }
      if (rec.status === "Open" && want.final) {
        if (want.toBuyer !== null) {
          txs.push(await as.resolveDispute(id, BigInt(want.toBuyer)));
          rec = { ...rec, status: want.toBuyer === 0 ? "Released" : "Refunded" };
        } else if (want.final === "Refunded") {
          txs.push(await as.refund(id, want.reason));
          rec = { ...rec, status: "Refunded" };
        } else if (rec.disputed) {
          return failed("catatan bersengketa, tapi database mencairkan tanpa putusan", true);
        } else {
          // Batasnya sama dengan database, tapi jam kontrak bisa tertinggal beberapa detik. Selisih kecil
          // ditunggu; selebihnya disusulkan sinkron berikutnya.
          const behind = rec.deadline - rec.now;
          if (behind >= 0 && behind <= 15) {
            await new Promise((r) => setTimeout(r, (behind + 2) * 1000));
            rec = { ...rec, now: (await readRecord(t, id)).now };
          }
          if (rec.now > rec.deadline) {
            txs.push(await as.release(id));
            rec = { ...rec, status: "Released" };
          }
        }
      }

      if (want.final && rec.status !== "Open" && rec.status !== want.final) {
        return failed(`catatan ${rec.status}, database ${want.final}`, true);
      }
      await admin
        .from("orders")
        .update({
          ledger_id: id,
          ledger_chain_id: t.chain.id,
          ledger_contract: t.ledger,
          ledger_status: rec.status === "None" ? null : rec.status,
          ledger_error: null,
          ledger_synced_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      return { ok: true, status: rec.status, txs };
    });
  } catch (e) {
    const name = chainError(e);
    return failed(name, PERMANENT.has(name));
  }
}

/**
 * Sinkron sesudah respons terkirim, supaya pengguna tidak menunggu chain. Di luar request (skrip)
 * langsung dijalankan.
 */
export function queueLedgerSync(admin: Admin, orderId: string) {
  const run = () =>
    syncLedger(admin, orderId)
      .then((r) => {
        if (!r.ok && !r.permanent) console.warn("[ledger] will retry:", orderId, r.error);
      })
      .catch((e) => console.error("[ledger]", orderId, e));
  try {
    after(run);
  } catch {
    void run();
  }
}

export type LedgerSweep = { due: number; synced: number; left: number; failed: number; stuck: number };

/**
 * Sapuan harian: pesanan QRIS yang catatannya belum final dan tidak macet, yang paling lama tidak dicek
 * dulu. Berhenti di batas waktunya dan menyisakan sisanya untuk sapuan berikutnya.
 */
export async function syncLedgerDue(admin: Admin, budgetMs: number, batch = 25): Promise<LedgerSweep> {
  const report: LedgerSweep = { due: 0, synced: 0, left: 0, failed: 0, stuck: 0 };
  if (!ledgerTarget()) return report;
  const started = Date.now();
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .not("payment_id", "is", null)
    .is("ledger_error", null)
    .or("ledger_status.is.null,ledger_status.eq.Open")
    .order("ledger_synced_at", { ascending: true, nullsFirst: true })
    .limit(batch);
  if (error) throw new Error(error.message);
  report.due = data.length;
  for (const { id } of data) {
    if (Date.now() - started > budgetMs) {
      report.left++;
      continue;
    }
    const r = await syncLedger(admin, id);
    if (r.ok) report.synced++;
    else if (r.permanent) report.stuck++;
    else report.failed++;
  }
  return report;
}
