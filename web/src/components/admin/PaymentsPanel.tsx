"use client";

// Money that needs a person, for staff (docs/09 §6, §7). QRIS payments that came in without an order
// wait here until someone sends the money back from the Xendit dashboard and records it; records the
// public ledger refused wait for a retry. Below them, the latest payments and the ledger's own health.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Fuel, Loader2, Mail, RotateCcw, ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { explorerAddress } from "@/lib/chain/config";
import { useFormatters, useT } from "@/lib/i18n";
import { shortHash } from "@/lib/mock";
import type { PaymentsOverview, StaffPayment, StuckRecord } from "@/lib/payments/types";

type Words = { en: string; id: string };

const STATUS: Record<string, Words & { tone: string }> = {
  pending: { en: "Waiting for payment", id: "Menunggu dibayar", tone: "bg-secondary-blue-extra text-primary-navy" },
  paid: { en: "Paid", id: "Dibayar", tone: "bg-secondary-blue-soft text-lummy-500" },
  unfulfilled: { en: "Needs a refund", id: "Perlu refund", tone: "bg-secondary-gold-soft text-secondary-brown-dark" },
  refunded: { en: "Refunded", id: "Direfund", tone: "bg-neutral-light-gray-1 text-neutral-black" },
  expired: { en: "Expired", id: "Kedaluwarsa", tone: "bg-neutral-light-gray-1 text-neutral-gray" },
  canceled: { en: "Cancelled", id: "Dibatalkan", tone: "bg-neutral-light-gray-1 text-neutral-gray" },
  failed: { en: "Failed", id: "Gagal", tone: "bg-neutral-light-gray-1 text-neutral-gray" },
};

/** Where a paid order's public record stands. */
const RECORD: Record<string, Words> = {
  Open: { en: "On the public record", id: "Tercatat publik" },
  Released: { en: "Payout recorded", id: "Pencairan dicatat" },
  Refunded: { en: "Refund recorded", id: "Refund dicatat" },
  Skipped: { en: "Paid before the ledger", id: "Dibayar sebelum buku besar" },
};

/** The overview, read again on `refresh`. Staff signed in with an account only. */
export function usePaymentsOverview(active: boolean) {
  const [data, setData] = useState<PaymentsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    fetch("/api/admin/payments", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as PaymentsOverview & { error?: string };
        if (!alive) return;
        if (r.ok) {
          setData(j);
          setError(null);
        } else setError(j.error ?? `HTTP ${r.status}`);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [active, nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, refresh };
}

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/admin/payments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { error?: string; status?: string };
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

function StatusChip({ status }: { status: string }) {
  const t = useT();
  const s = STATUS[status] ?? { en: status, id: status, tone: "bg-neutral-light-gray-1 text-neutral-gray" };
  return <span className={`inline-block text-[11px] font-medium rounded-full px-2 py-0.5 ${s.tone}`}>{t(s.en, s.id)}</span>;
}

function NeedsRefund({ p, onDone }: { p: StaffPayment; onDone: () => void }) {
  const t = useT();
  const { formatIDR, formatDateTime } = useFormatters();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Xendit refunds a QRIS itself only within 7 days of the payment; after that it is a transfer.
  const inWindow = !!p.refundBy && Date.now() < Date.parse(p.refundBy);
  const copy = (value: string) => {
    navigator.clipboard?.writeText(value);
    toast.success(t("Copied", "Disalin"));
  };
  const record = async () => {
    setBusy(true);
    try {
      await post({ action: "refunded", id: p.id, note });
      toast.success(t("Recorded as refunded", "Dicatat sudah direfund"));
      onDone();
    } catch (e) {
      toast.error(`${t("Not recorded", "Gagal dicatat")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-refund={p.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-fredoka font-semibold text-neutral-black truncate">{p.eventTitle || t("Unknown show", "Acara tidak diketahui")}</h3>
          <div className="text-xs text-neutral-gray mt-1">
            {t("Paid", "Dibayar")} {p.paidAt ? formatDateTime(p.paidAt) : "-"}
            {p.testMode && <> · {t("Xendit test mode", "mode uji Xendit")}</>}
          </div>
        </div>
        <span className="font-fredoka font-bold text-lummy-500 text-nowrap">{formatIDR(p.total)}</span>
      </div>

      <div className="mt-3 flex flex-col gap-1.5 text-sm">
        {p.buyer && (
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="w-4 h-4 text-neutral-gray shrink-0" />
            <span className="truncate text-neutral-black">
              {p.buyer.name}
              {p.buyer.email && (
                <>
                  {" · "}
                  <a href={`mailto:${p.buyer.email}`} className="text-primary-navy hover:opacity-80">{p.buyer.email}</a>
                </>
              )}
            </span>
          </div>
        )}
        {p.number && (
          <div className="flex items-center gap-2 text-xs text-neutral-gray min-w-0">
            {t("Xendit payment", "Pembayaran Xendit")} <span className="font-mono text-neutral-black truncate">{p.number}</span>
            <button onClick={() => copy(p.number!)} aria-label={t("Copy", "Salin")} className="cursor-pointer hover:text-primary-navy shrink-0">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <p className={`text-xs mt-3 rounded-xl px-3 py-2 ${inWindow ? "bg-secondary-blue-extra text-primary-navy" : "bg-secondary-gold-soft text-secondary-brown-dark"}`}>
        {inWindow
          ? t(
              `Refund the QRIS itself in the Xendit dashboard (Transactions, search the payment number) until ${formatDateTime(p.refundBy!)}. The buyer paid the total, so all of it goes back.`,
              `Refund QRIS-nya langsung di dashboard Xendit (Transactions, cari nomor pembayarannya) sampai ${formatDateTime(p.refundBy!)}. Pembeli membayar totalnya, jadi semuanya dikembalikan.`
            )
          : t(
              "Past the 7 days in which Xendit refunds a QRIS: send the total by transfer to an account the buyer names, then record it here.",
              "Lewat 7 hari batas refund QRIS di Xendit: kirim totalnya lewat transfer ke rekening yang disebut pembeli, lalu catat di sini."
            )}
      </p>

      {open ? (
        <form
          className="mt-3 flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void record();
          }}
        >
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            aria-label={t("Refund or transfer reference", "Nomor refund atau transfer")}
            placeholder={t("Refund or transfer reference (optional)", "Nomor refund atau transfer (opsional)")}
            className="flex-1 min-w-0 rounded-xl border border-lummy-500 px-4 py-2.5 text-sm text-neutral-black outline-none"
          />
          <Button.Ghost type="submit" disabled={busy} className="text-sm flex items-center gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {t("Record the refund", "Catat refundnya")}
          </Button.Ghost>
        </form>
      ) : (
        <Button.Ghost className="text-sm mt-3 flex items-center gap-1.5" onClick={() => setOpen(true)}>
          <Undo2 className="w-4 h-4" /> {t("I sent the money back", "Uangnya sudah kukembalikan")}
        </Button.Ghost>
      )}
    </div>
  );
}

function Stuck({ s, onDone }: { s: StuckRecord; onDone: () => void }) {
  const t = useT();
  const { formatIDR } = useFormatters();
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      const r = await post({ action: "ledger-retry", orderId: s.id });
      toast.success(t(`On the record again: ${r.status ?? "ok"}`, `Tercatat lagi: ${r.status ?? "ok"}`));
    } catch (e) {
      toast.error(`${t("The contract refused again", "Kontrak menolak lagi")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      onDone();
    }
  };
  return (
    <div data-stuck={s.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-fredoka font-semibold text-neutral-black truncate">{s.eventTitle}</h3>
          <div className="text-xs text-neutral-gray mt-1">
            {t("Order", "Pesanan")} <span className="font-mono">{s.id}</span> · {s.escrowStatus}
          </div>
        </div>
        <span className="font-fredoka font-bold text-lummy-500 text-nowrap">{formatIDR(s.amount)}</span>
      </div>
      <p className="text-xs mt-3 rounded-xl px-3 py-2 bg-secondary-gold-soft text-secondary-brown-dark flex gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          {t("The contract refused a step:", "Kontrak menolak satu langkah:")} <span className="font-mono">{s.error}</span>.{" "}
          {t(
            "The order itself is fine; its public record stopped. Retry once the cause is fixed.",
            "Pesanannya sendiri tidak apa-apa; catatan publiknya yang berhenti. Coba lagi setelah penyebabnya beres."
          )}
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button.Ghost className="text-sm flex items-center gap-1.5" disabled={busy} onClick={() => void retry()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} {t("Try the chain again", "Coba catat lagi")}
        </Button.Ghost>
        {s.ledgerId && (
          <Link href={`/proof/${s.ledgerId}`} className="text-sm text-primary-navy font-medium hover:opacity-80">
            {t("Open its record", "Buka catatannya")}
          </Link>
        )}
      </div>
    </div>
  );
}

function Recent({ p }: { p: StaffPayment }) {
  const t = useT();
  const { formatIDR, formatDateTime } = useFormatters();
  const record = p.ledgerStatus ? RECORD[p.ledgerStatus] : null;
  return (
    <li data-payment={p.id} className="flex items-center justify-between gap-3 py-3 border-b border-dashed border-neutral-light-gray-1 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-neutral-black truncate">{p.eventTitle || t("Unknown show", "Acara tidak diketahui")}</div>
        <div className="text-xs text-neutral-gray mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{formatDateTime(p.createdAt)}</span>
          <span className="font-mono">{p.id}</span>
          {p.testMode && <span>{t("test", "uji")}</span>}
          {p.status === "paid" &&
            (p.ledgerId && record ? (
              <Link href={`/proof/${p.ledgerId}`} className="inline-flex items-center gap-1 text-secondary-green-dark hover:opacity-80">
                <ShieldCheck className="w-3.5 h-3.5" /> {t(record.en, record.id)}
              </Link>
            ) : record ? (
              <span>{t(record.en, record.id)}</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> {t("being recorded", "sedang dicatat")}
              </span>
            ))}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-fredoka font-semibold text-neutral-black">{formatIDR(p.total)}</div>
        <StatusChip status={p.status} />
      </div>
    </li>
  );
}

export function PaymentsPanel({ data, error, refresh }: { data: PaymentsOverview | null; error: string | null; refresh: () => void }) {
  const t = useT();
  const { formatIDR, formatDateTime } = useFormatters();

  if (!data) {
    return error ? (
      <div className="flex flex-col items-start gap-2">
        <p className="text-neutral-gray text-sm">{t("Payments could not be loaded", "Pembayaran gagal dimuat")}: {error}</p>
        <Button.Ghost className="text-sm" onClick={refresh}>{t("Try again", "Coba lagi")}</Button.Ghost>
      </div>
    ) : (
      <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
    );
  }

  const heading = "font-fredoka font-semibold text-lg text-neutral-black mb-3";
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-neutral-gray">
        {t(
          "QRIS money that needs a person. A payment that arrived after its seats went to someone else, or after its show was cancelled, has no order: its money goes back. Until payouts are connected, send it back from the Xendit dashboard and record it here.",
          "Uang QRIS yang butuh tangan orang. Pembayaran yang masuk setelah kursinya jatuh ke orang lain, atau setelah acaranya batal, tidak punya pesanan: uangnya dikembalikan. Sampai pencairan otomatis tersambung, kembalikan dari dashboard Xendit lalu catat di sini."
        )}
      </p>

      <section>
        <h2 className={heading}>
          {t("Needs a refund", "Perlu refund")} <span className="text-neutral-gray text-sm font-normal">({data.needsRefund.length})</span>
        </h2>
        {data.needsRefund.length === 0 ? (
          <div className="bg-neutral-white rounded-3xl border border-dashed border-neutral-light-gray-1 p-8 text-center text-sm text-neutral-gray">
            {t("Nobody is owed money.", "Tidak ada uang yang harus dikembalikan.")}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {data.needsRefund.map((p) => (
              <NeedsRefund key={p.id} p={p} onDone={refresh} />
            ))}
          </div>
        )}
      </section>

      {data.stuck.length > 0 && (
        <section>
          <h2 className={heading}>
            {t("Public record needs a look", "Catatan publik perlu dicek")} <span className="text-neutral-gray text-sm font-normal">({data.stuck.length})</span>
          </h2>
          <div className="flex flex-col gap-4">
            {data.stuck.map((s) => (
              <Stuck key={s.id} s={s} onDone={refresh} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className={heading}>{t("Latest payments", "Pembayaran terbaru")}</h2>
        {data.recent.length === 0 ? (
          <p className="text-sm text-neutral-gray">{t("No QRIS payments yet.", "Belum ada pembayaran QRIS.")}</p>
        ) : (
          <ul className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 px-5">
            {data.recent.map((p) => (
              <Recent key={p.id} p={p} />
            ))}
          </ul>
        )}
      </section>

      {data.refunded.length > 0 && (
        <section>
          <h2 className={heading}>{t("Refunded by staff", "Direfund staf")}</h2>
          <ul className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 px-5">
            {data.refunded.map((p) => (
              <li key={p.id} className="py-3 border-b border-dashed border-neutral-light-gray-1 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-black truncate">{p.eventTitle}</span>
                  <span className="text-sm font-fredoka font-semibold text-neutral-black shrink-0">{formatIDR(p.total)}</span>
                </div>
                <div className="text-xs text-neutral-gray mt-0.5">
                  {p.refundedAt ? formatDateTime(p.refundedAt) : ""} · {p.buyer?.name}
                  {p.refundNote && <> · <span className="font-mono">{p.refundNote}</span></>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.ledger && (
        <section className="rounded-3xl border border-neutral-light-gray-1 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-black">
            <ShieldCheck className="w-4 h-4 text-secondary-green-dark" /> {t("Public ledger", "Buku besar publik")}
          </div>
          <div className="mt-3 flex flex-col gap-2 text-xs text-neutral-gray">
            <div className="flex items-center justify-between gap-3">
              <span>{t("Contract", "Kontrak")}</span>
              <a href={explorerAddress(data.ledger.chainId, data.ledger.contract) ?? "#"} target="_blank" rel="noreferrer" className="font-mono text-primary-navy inline-flex items-center gap-1">
                {shortHash(data.ledger.contract)} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1">
                <Fuel className="w-3.5 h-3.5" /> {t("Operator gas", "Gas operator")}
              </span>
              <span className={`font-mono ${data.ledger.low ? "text-secondary-orange-dark" : "text-neutral-black"}`}>
                {data.ledger.gasEth === null ? t("unknown", "tidak terbaca") : `${data.ledger.gasEth} ETH`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{t("Paid orders still being recorded", "Pesanan dibayar yang sedang dicatat")}</span>
              <span className="text-neutral-black">{data.ledger.waiting}</span>
            </div>
          </div>
          {data.ledger.low && (
            <p className="text-xs mt-3 rounded-xl px-3 py-2 bg-secondary-gold-soft text-secondary-brown-dark">
              {t(
                "Below 0.002 ETH the operator stops recording, so the escrow demo keeps its gas. Top it up from an Arbitrum Sepolia faucet; the records catch up by themselves.",
                "Di bawah 0,002 ETH operator berhenti mencatat, supaya demo escrow tetap punya gas. Isi ulang dari faucet Arbitrum Sepolia; catatannya menyusul sendiri."
              )}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
