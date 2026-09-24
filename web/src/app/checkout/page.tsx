"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { ArrowLeft, Lock, ShieldCheck, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import {
  SEED_LISTINGS, getEventById, getTier, isBuyable, isEventOver, platformFee, MATERAI, useOrders, DISPUTE_WINDOW_H, EVENT_DURATION_H, type OrderChain,
} from "@/lib/mock";
import { chainCheckoutReady, demoPrefs, openChainOrder, useChainInfo } from "@/lib/chain/client";
import { useAccessGuard } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters } from "@/lib/i18n";

/**
 * Unix seconds when the show ends, which is when the contract starts the dispute window. The demo
 * switch pretends it already has, so the testnet window runs right away.
 */
function showEndsAt(dateISO: string) {
  if (demoPrefs.eventEnded()) return Math.floor(Date.now() / 1000);
  return Math.floor((new Date(dateISO).getTime() + EVENT_DURATION_H * 3_600_000) / 1000);
}

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
  const chainInfo = useChainInfo();
  const onchain = chainCheckoutReady(chainInfo);

  const [processing, setProcessing] = useState(false);

  // Not found, flagged, duplicate, or for a show that is already over: nothing to pay for.
  if (!listing || !event || !tier || !isBuyable(listing) || isEventOver(event)) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-28 pb-16 text-center flex flex-col items-center gap-3">
        <p className="text-neutral-gray">{t("This listing is not available to buy.", "Listing ini tidak bisa dibeli.")}</p>
        <Link href={event ? `/events/${event.id}` : "/events"} className="text-primary-navy font-medium">{t("See other tickets", "Lihat tiket lain")}</Link>
      </div>
    );
  }

  // A hand-edited URL cannot buy more seats than the listing holds.
  const qty = Math.min(listing.quantity, Math.max(1, Number(params.get("qty")) || 1));
  const subtotal = listing.askPrice * qty;
  const fee = platformFee(subtotal);
  const total = subtotal + fee + MATERAI;

  const pay = async () => {
    setProcessing(true);
    let chain: OrderChain | undefined;
    if (onchain && chainInfo?.escrow) {
      const endsAt = showEndsAt(event.dateISO);
      try {
        const r = await openChainOrder(endsAt);
        chain = { listingId: r.listingId, escrow: chainInfo.escrow, price: r.price, eventEndsAt: endsAt, txs: r.txs };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`${t("Chain unavailable, saved as a sample order", "Chain tidak tersedia, pesanan disimpan sebagai contoh")}: ${msg}`);
      }
    } else {
      await new Promise((r) => setTimeout(r, 1800));
    }
    const id = buy(listing, event, tier, qty, chain);
    toast.success(
      chain
        ? t("Paid. Your money is locked in the escrow contract on Arbitrum.", "Pembayaran berhasil. Dana kamu dikunci di kontrak escrow di Arbitrum.")
        : t("Paid. Your money is now in escrow.", "Pembayaran berhasil. Dana kamu sekarang di escrow.")
    );
    router.push(`/tickets/${id}`);
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
              <Image src={event.image} alt={event.title} fill sizes="96px" className="object-cover" />
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

          {/* Payment. QRIS is the one rail: it covers e-wallets and bank apps alike. */}
          <div className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4">
            <h2 className="font-fredoka font-semibold text-lg text-neutral-black mb-3">{t("Payment", "Pembayaran")}</h2>
            <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-primary-navy bg-secondary-blue-light">
              <span className="w-10 h-10 rounded-lg bg-neutral-white text-primary-navy grid place-items-center shrink-0 border border-lummy-500">
                <QrCode className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-medium text-sm text-neutral-black">QRIS</div>
                <div className="text-xs text-neutral-gray">{t("Scan with GoPay, OVO, DANA, ShopeePay or any bank app", "Scan pakai GoPay, OVO, DANA, ShopeePay, atau aplikasi bank")}</div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4">
            <Lock className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
            <span>{t(
              `Your payment waits in escrow until ${DISPUTE_WINDOW_H} hours after the show. Turned away at the gate? File a claim with a photo from there and an arbiter decides.`,
              `Pembayaranmu ditahan escrow sampai ${DISPUTE_WINDOW_H} jam setelah acara. Ditolak di gate? Ajukan klaim dengan foto dari sana, lalu arbiter yang memutuskan.`
            )}</span>
          </div>
        </div>

        {/* Right: summary */}
        <div className="lg:sticky lg:top-24 h-fit bg-neutral-white rounded-3xl border border-lummy-500 p-6 flex flex-col gap-4">
          <h2 className="font-fredoka font-semibold text-lg text-neutral-black">{t("Summary", "Rincian")}</h2>
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
          {onchain && (
            <p className="text-[11px] text-neutral-gray text-center -mt-2">
              {t(
                `Chain mode: a real escrow on Arbitrum Sepolia, ${chainInfo?.priceUsdc ?? "1"} test USDC standing in for the rupiah.`,
                `Mode chain: escrow sungguhan di Arbitrum Sepolia, ${chainInfo?.priceUsdc ?? "1"} USDC testnet mewakili rupiahnya.`
              )}
            </p>
          )}
        </div>
      </div>

      <Modal open={processing} onClose={() => {}}>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 text-lummy-500 animate-spin" />
          <p className="font-fredoka font-semibold text-neutral-black">{t("Processing payment...", "Memproses pembayaran...")}</p>
          <p className="text-sm text-neutral-gray text-center">
            {onchain
              ? t("Locking your money in the escrow contract: listing, payment, handover.", "Mengunci dana di kontrak escrow: listing, pembayaran, serah terima.")
              : t("Securing your money in escrow.", "Mengamankan dana kamu di escrow.")}
          </p>
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
