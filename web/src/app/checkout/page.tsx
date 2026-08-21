"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { ArrowLeft, Lock, ShieldCheck, Loader2, QrCode, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import {
  SEED_LISTINGS, getEventById, getTier, platformFee, MATERAI, useOrders, DISPUTE_WINDOW_H,
} from "@/lib/mock";
import { useAccessGuard } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters } from "@/lib/i18n";

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-neutral-gray">{label}</span>
      <span className={bold ? "font-fredoka font-bold text-neutral-black" : "text-neutral-black"}>{value}</span>
    </div>
  );
}

function CheckoutInner() {
  const t = useT();
  const ready = useAccessGuard("account");
  const { formatIDR, formatEventDate } = useFormatters();
  const params = useSearchParams();
  const router = useRouter();
  const listing = SEED_LISTINGS.find((l) => l.id === params.get("listing"));
  const event = listing && getEventById(listing.eventId);
  const tier = listing && event ? getTier(event, listing.tierId) : undefined;
  const buy = useOrders((s) => s.buy);

  const [method, setMethod] = useState<"qris" | "usdc">("qris");
  const [processing, setProcessing] = useState(false);

  if (!listing || !event || !tier) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-28 pb-16 text-center">
        <p className="text-neutral-gray">{t("Listing not found.", "Listing tidak ditemukan.")}</p>
        <Link href="/events" className="text-primary-navy font-medium">{t("Back to browse", "Balik ke jelajah")}</Link>
      </div>
    );
  }

  const qty = Math.max(1, Number(params.get("qty")) || 1);
  const subtotal = listing.askPrice * qty;
  const fee = platformFee(subtotal);
  const total = subtotal + fee + MATERAI;

  const pay = () => {
    setProcessing(true);
    setTimeout(() => {
      const id = buy(listing, event, tier, qty);
      toast.success(t("Paid. Your money is now in escrow.", "Pembayaran berhasil. Dana kamu sekarang di escrow."));
      router.push(`/tickets/${id}`);
    }, 1800);
  };

  if (!ready) return <PageGate />;

  return (
    <div className="max-w-7xl mx-auto w-full px-5 lg:px-10 pt-28 pb-16">
      <Link href={`/events/${event.id}`} className="inline-flex items-center gap-1 text-neutral-gray hover:text-primary-navy text-sm mb-4">
        <ArrowLeft className="w-4 h-4" /> {t("Back", "Kembali")}
      </Link>
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black mb-6">{t("Checkout", "Checkout")}</h1>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        {/* Left */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* Item */}
          <div className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4 flex gap-4 min-w-0">
            <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-neutral-light-gray-1 shrink-0">
              <Image src={event.image} alt={event.title} fill className="object-cover" />
            </div>
            <div className="min-w-0">
              <h3 className="font-fredoka font-semibold text-neutral-black truncate">{event.title}</h3>
              <p className="text-sm text-neutral-gray">{formatEventDate(event.dateISO)} · {event.city}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-xs">{tier.name}</Badge.Base>
                <Badge.Base className="bg-secondary-cream-soft text-secondary-brown-dark text-xs">{t(`${qty} tickets`, `${qty} tiket`)}</Badge.Base>
                <span className="text-xs text-neutral-gray">{t("Seller", "Penjual")} {listing.sellerName}</span>
              </div>
            </div>
          </div>

          {/* Payment method */}
          <div className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4">
            <h4 className="font-fredoka font-semibold text-neutral-black mb-3">{t("Payment method", "Metode bayar")}</h4>
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: "qris", label: "QRIS", desc: "GoPay, OVO, DANA, bank", Icon: QrCode },
                { id: "usdc", label: "Crypto (demo)", desc: t("Stablecoin, optional", "Stablecoin, opsional"), Icon: Coins },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`text-left p-3 rounded-xl border-2 transition cursor-pointer min-w-0 ${
                    method === m.id ? "border-lummy-500 bg-secondary-blue-light" : "border-neutral-light-gray-1 hover:border-lummy-500"
                  }`}
                >
                  <m.Icon className="w-5 h-5 text-lummy-500 mb-1" />
                  <div className="font-medium text-sm text-neutral-black">{m.label}</div>
                  <div className="text-xs text-neutral-gray break-words">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4">
            <Lock className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
            <span>{t(
              `Your payment is locked in escrow, not handed to the seller, until the event ends plus ${DISPUTE_WINDOW_H} hours. If the ticket fails at the gate, you file a dispute with evidence recorded there, and an arbiter decides. Refunds are never automatic.`,
              `Pembayaranmu dikunci di escrow, bukan diserahkan ke penjual, sampai acara selesai plus ${DISPUTE_WINDOW_H} jam. Kalau tiketnya gagal di gate, kamu ajukan sengketa dengan bukti yang direkam di sana, lalu arbiter yang memutuskan. Refund tidak pernah otomatis.`
            )}</span>
          </div>
        </div>

        {/* Right: summary */}
        <div className="lg:sticky lg:top-24 h-fit bg-neutral-white rounded-3xl border border-lummy-500 p-6 flex flex-col gap-4">
          <h4 className="font-fredoka font-semibold text-neutral-black">{t("Summary", "Rincian")}</h4>
          <div className="flex flex-col gap-2">
            <Row label={qty > 1 ? t(`Tickets (${qty} × ${formatIDR(listing.askPrice)})`, `Tiket (${qty} × ${formatIDR(listing.askPrice)})`) : t("Ticket price", "Harga tiket")} value={formatIDR(subtotal)} />
            <Row label={t("Service fee (5%, min. IDR 25,000)", "Biaya layanan (5%, min. IDR 25.000)")} value={formatIDR(fee)} />
            <Row label={t("e-stamp + e-signature fee", "e-Materai + biaya TTE")} value={formatIDR(MATERAI)} />
            <div className="border-t border-dashed border-neutral-light-gray-1 my-1" />
            <Row label={t("Total", "Total")} value={formatIDR(total)} bold />
          </div>
          <Button.Primary wrapperClass="w-full" className="w-full" onClick={pay}>
            {t("Pay", "Bayar")} {formatIDR(total)}
          </Button.Primary>
          <p className="flex items-center gap-1.5 text-xs text-secondary-green-dark justify-center">
            <ShieldCheck className="w-3.5 h-3.5" /> {t("Protected by Lummy escrow", "Dijamin escrow Lummy")}
          </p>
        </div>
      </div>

      <Modal open={processing} onClose={() => {}}>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 text-lummy-500 animate-spin" />
          <p className="font-fredoka font-semibold text-neutral-black">{t("Processing payment...", "Memproses pembayaran...")}</p>
          <p className="text-sm text-neutral-gray text-center">{t("Securing your money in escrow.", "Mengamankan dana kamu di escrow.")}</p>
        </div>
      </Modal>
    </div>
  );
}

export default function CheckoutPage() {
  const t = useT();
  return (
    <Suspense fallback={<div className="pt-28 pb-16 text-center text-neutral-gray">{t("Loading...", "Memuat...")}</div>}>
      <CheckoutInner />
    </Suspense>
  );
}
