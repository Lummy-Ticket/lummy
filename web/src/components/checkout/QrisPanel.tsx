"use client";

// The QRIS step of checkout (docs/09 §6): the code to scan, the time left, and what Xendit says
// about it, read every few seconds. Paid takes the buyer to the order. Expired or cancelled gives
// the seats back and says so. In test mode a real app cannot pay the code, so a button pays it
// through Xendit's simulator instead, which still runs the whole path: Xendit, webhook, order.
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormatters, useT } from "@/lib/i18n";
import { paymentAction, readPayment, type PaymentStatus, type PaymentView } from "@/lib/payments/client";

const POLL_MS = 3000;

export function QrisPanel({
  initial,
  onPaid,
  onClose,
}: {
  initial: PaymentView;
  onPaid: (orderId: string, testMode: boolean) => void;
  onClose: (status: PaymentStatus) => void;
}) {
  const t = useT();
  const { formatIDR } = useFormatters();
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState<"simulate" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(false);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // Ask while it waits for money, and while a paid hold is still writing its order.
  const waiting = p.status === "pending" || (p.status === "paid" && !p.orderId);
  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    const i = setInterval(() => {
      readPayment(p.id).then(
        (next) => alive && setP(next),
        () => {
          // Keep the last answer; the next tick asks again.
        }
      );
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(i);
    };
  }, [p.id, waiting]);

  useEffect(() => {
    if (p.status === "paid" && p.orderId && !done.current) {
      done.current = true;
      onPaid(p.orderId, p.testMode);
    }
  }, [p.status, p.orderId, p.testMode, onPaid]);

  const act = async (action: "simulate" | "cancel") => {
    setBusy(action);
    setError(null);
    try {
      setP(await paymentAction(p.id, action));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const left = Math.max(0, Math.floor((Date.parse(p.expiresAt) - now) / 1000));
  const clock = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;

  const closed: Partial<Record<PaymentStatus, { en: string; id: string }>> = {
    expired: {
      en: "This QRIS expired before it was paid. The tickets are back on sale; press Pay for a new code.",
      id: "QRIS ini kedaluwarsa sebelum dibayar. Tiketnya kembali dijual; tekan Bayar untuk kode baru.",
    },
    canceled: { en: "Payment cancelled. The tickets are back on sale.", id: "Pembayaran dibatalkan. Tiketnya kembali dijual." },
    failed: { en: "The payment did not go through. Nothing was charged.", id: "Pembayaran tidak berhasil. Tidak ada yang ditagih." },
    unfulfilled: {
      en: "Your payment arrived after the tickets went to another buyer. We will refund it, and the team will email you.",
      id: "Pembayaranmu masuk setelah tiketnya terjual ke pembeli lain. Uangnya kami kembalikan, dan tim kami akan mengirim email.",
    },
  };
  const ended = closed[p.status];

  return (
    <div data-qris-panel data-qris-status={p.status} className="flex flex-col items-center gap-4 p-6 text-center">
      <div className="flex items-center gap-2 font-fredoka font-semibold text-lg text-neutral-black">
        <QrCode className="w-5 h-5 text-lummy-500" /> {t("Pay with QRIS", "Bayar dengan QRIS")}
      </div>

      {p.status === "pending" && (
        <>
          <div className="rounded-2xl border border-neutral-light-gray-1 bg-neutral-white p-3">
            <QRCodeSVG value={p.qrString ?? ""} size={208} marginSize={1} level="M" aria-label={t("QRIS code", "Kode QRIS")} />
          </div>
          <div>
            <div className="font-fredoka font-bold text-xl text-neutral-black">{formatIDR(p.amount)}</div>
            <div className="text-xs text-neutral-gray mt-0.5">
              {left > 0 ? t(`Valid for ${clock}`, `Berlaku ${clock}`) : t("Time is up. Checking with Xendit...", "Waktu habis. Mengecek ke Xendit...")}
            </div>
          </div>
          <p className="flex items-center gap-2 text-sm text-neutral-gray">
            <Loader2 className="w-4 h-4 animate-spin text-lummy-500" />
            {t("Waiting for payment. Scan with GoPay, OVO, DANA, ShopeePay or any bank app.", "Menunggu pembayaran. Scan pakai GoPay, OVO, DANA, ShopeePay, atau aplikasi bank.")}
          </p>
          {p.testMode && (
            <div className="w-full rounded-2xl bg-secondary-orange-soft p-3 text-xs text-secondary-orange-dark text-left">
              {t(
                "Xendit test mode: a real app cannot pay this code. The button below pays it through Xendit's simulator; no money moves.",
                "Mode test Xendit: aplikasi sungguhan tidak bisa membayar kode ini. Tombol di bawah membayarnya lewat simulator Xendit; tidak ada uang yang berpindah."
              )}
            </div>
          )}
          <div className="flex w-full flex-col gap-2">
            {p.testMode && (
              <Button.Primary data-qris-simulate wrapperClass="w-full" className="w-full" disabled={!!busy} onClick={() => void act("simulate")}>
                {busy === "simulate" && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("Simulate payment (test mode)", "Simulasikan pembayaran (mode test)")}
              </Button.Primary>
            )}
            <button
              data-qris-cancel
              type="button"
              disabled={!!busy}
              onClick={() => void act("cancel")}
              className="text-sm text-neutral-gray hover:text-primary-navy disabled:opacity-50 cursor-pointer"
            >
              {busy === "cancel" ? t("Cancelling...", "Membatalkan...") : t("Cancel payment", "Batalkan pembayaran")}
            </button>
          </div>
        </>
      )}

      {p.status === "paid" && (
        <p className="flex items-center gap-2 text-sm text-secondary-green-dark">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("Payment received. Preparing your order...", "Pembayaran diterima. Menyiapkan pesananmu...")}
        </p>
      )}

      {ended && (
        <>
          <p className="rounded-2xl bg-secondary-pink-soft p-3 text-sm text-secondary-pink-dark">{t(ended.en, ended.id)}</p>
          <Button.Primary wrapperClass="w-full" className="w-full" onClick={() => onClose(p.status)}>
            {t("Close", "Tutup")}
          </Button.Primary>
        </>
      )}

      {error && <p className="text-xs text-secondary-pink-dark">{error}</p>}
    </div>
  );
}
