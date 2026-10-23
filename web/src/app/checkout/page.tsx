"use client";

import type React from "react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/components/legal/LegalPage";
import Image from "next/image";
import toast from "react-hot-toast";
import { ArrowLeft, Lock, ShieldCheck, Loader2, QrCode, Wallet } from "lucide-react";
import { TransferPolicyNote } from "@/components/common/TransferPolicyNote";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import {
  getTier, isBuyable, isEventOver, platformFee, MATERAI, useOrders, useUser, DISPUTE_WINDOW_H, EVENT_DURATION_H, type OrderChain,
  needsNameAcknowledgement, resaleAllowed,
} from "@/lib/mock";
import { useCatalogue } from "@/lib/catalogue";
import { chainCheckoutReady, demoPrefs, openChainOrder, useChainInfo } from "@/lib/chain/client";
import { OrderError, placeOrder } from "@/lib/orders/client";
import { startPayment, usePaymentsConfig, type PaymentView } from "@/lib/payments/client";
import { QrisPanel } from "@/components/checkout/QrisPanel";
import { USDC_FAUCET, UsdcPanel } from "@/components/checkout/UsdcPanel";
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
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-neutral-gray">{label}</span>
      <span className={`shrink-0 whitespace-nowrap tabular-nums ${bold ? "font-bold text-neutral-black" : "text-neutral-black"}`}>{value}</span>
    </div>
  );
}

function CheckoutInner() {
  const t = useT();
  const ready = useAccessGuard("account");
  const { formatIDR, formatMoney, formatEventDate } = useFormatters();
  const params = useSearchParams();
  const router = useRouter();
  const catalogue = useCatalogue();
  const listing = catalogue.listingById(params.get("listing") ?? "");
  const event = listing && catalogue.eventById(listing.eventId);
  const tier = listing && event ? getTier(event, listing.tierId) : undefined;
  const buy = useOrders((s) => s.buy);
  // A real account buys through the server and keeps the order in the database. A sample
  // persona keeps it in this browser, as before.
  const account = useUser((s) => !!s.user?.account);
  // A show abroad priced in USDC is paid from the buyer's own wallet, whatever else is switched on
  // (tasks/founder-house-usdc.md).
  const usdc = event?.currency === "USDC";
  const chainInfo = useChainInfo();
  const onchain = chainCheckoutReady(chainInfo) && !usdc;
  // With QRIS switched on (docs/09 §6), an account pays through it. Chain mode keeps the testnet
  // escrow, and a sample persona keeps its order in this browser.
  const payments = usePaymentsConfig(account && !onchain);
  const qris = account && !onchain && !!payments?.enabled && !usdc;
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [usdcOpen, setUsdcOpen] = useState(false);

  const [processing, setProcessing] = useState(false);
  // Where the gate matches ID to the name, the buyer says they know before paying.
  const [nameRiskOk, setNameRiskOk] = useState(false);

  // Not found, flagged, duplicate, or for a show that is already over: nothing to pay for.
  if (!listing || !event || !tier || !isBuyable(listing) || isEventOver(event) || !resaleAllowed(event.transferPolicy)) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-28 pb-16 text-center flex flex-col items-center gap-3">
        <p className="text-neutral-gray">{t("This listing is not available to buy.", "Listing ini tidak bisa dibeli.")}</p>
        <Link href={event ? `/events/${event.id}` : "/events"} className="text-primary-navy font-medium">{t("See other tickets", "Lihat tiket lain")}</Link>
      </div>
    );
  }

  // A hand-edited URL cannot buy more seats than the listing holds, and a set that is not
  // splittable is bought whole: the server would refuse anything else.
  const qty = listing.splittable ? Math.min(listing.quantity, Math.max(1, Number(params.get("qty")) || 1)) : listing.quantity;
  const subtotal = listing.askPrice * qty;
  // In USDC, while it runs on testnet, there is no fee and no stamp duty (the server agrees).
  const fee = usdc ? 0 : platformFee(subtotal);
  const materai = usdc ? 0 : MATERAI;
  const total = subtotal + fee + materai;
  const money = (n: number) => formatMoney(n, event.currency);
  const mustConfirmName = needsNameAcknowledgement(event.transferPolicy);
  // QRIS takes at most this much per payment; the server refuses more as well.
  const overQris = qris && !!payments && total > payments.max;

  const payAccount = async () => {
    setProcessing(true);
    try {
      // The "show is over" switch lives under chain mode in the Dev Panel, so it only counts with it.
      const { id } = await placeOrder({ listingId: listing.id, quantity: qty, chain: onchain, demoEnded: onchain && demoPrefs.eventEnded() });
      toast.success(
        onchain
          ? t("Paid. Your money is locked in the escrow contract on Arbitrum.", "Pembayaran berhasil. Dana kamu dikunci di kontrak escrow di Arbitrum.")
          : t("Order saved to your account. The payment was simulated; the escrow rules are real.", "Pesanan tersimpan di akunmu. Pembayarannya simulasi, aturan escrow-nya sungguhan.")
      );
      router.push(`/tickets/${id}`);
      // The catalogue lives in the root layout, which a client navigation keeps: fetch it again so
      // the seats just bought are no longer on sale when the buyer looks back.
      router.refresh();
    } catch (e) {
      setProcessing(false);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`${t("Payment failed", "Pembayaran gagal")}: ${msg}`);
      // Someone else got the seats first: show what is left instead.
      if (e instanceof OrderError && e.status === 409) router.refresh();
    }
  };

  // Holds the seats and opens the QRIS; the panel below takes it from there.
  const payQris = async () => {
    setProcessing(true);
    try {
      setPayment(await startPayment(listing.id, qty));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`${t("Payment failed", "Pembayaran gagal")}: ${msg}`);
      if (e instanceof OrderError && e.status === 409) router.refresh();
    } finally {
      setProcessing(false);
    }
  };

  const pay = async () => {
    if (usdc) return setUsdcOpen(true);
    if (account) return qris ? payQris() : payAccount();
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
        <div data-reveal="stagger" className="flex flex-col gap-5 min-w-0">
          {/* Item */}
          <div className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4 flex gap-4 min-w-0">
            <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-neutral-light-gray-1 shrink-0">
              <Image src={event.image} alt={event.title} fill sizes="96px" className="object-cover" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-neutral-black truncate">{event.title}</h3>
              <p className="text-sm text-neutral-gray">{formatEventDate(event.dateISO)} · {event.city}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-xs">{tier.name}</Badge.Base>
                <Badge.Base className="bg-secondary-cream-soft text-secondary-brown-dark text-xs">{t(`${qty} tickets`, `${qty} tiket`)}</Badge.Base>
                <span className="text-xs text-neutral-gray">{t("Seller", "Penjual")} {listing.sellerName}</span>
              </div>
            </div>
          </div>

          {!usdc && <TransferPolicyNote policy={event.transferPolicy} audience="buyer" />}

          {/* Payment. A show in Indonesia has one rail, QRIS, which covers e-wallets and bank apps
              alike; a show abroad priced in USDC is paid from the buyer's own wallet. */}
          <div className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4">
            <h2 className="font-semibold text-lg text-neutral-black mb-3">{t("Payment", "Pembayaran")}</h2>
            <div data-pay-rail={usdc ? "usdc" : "qris"} className="flex items-center gap-3 p-3 rounded-xl border-2 border-primary-navy bg-secondary-blue-light">
              <span className="w-10 h-10 rounded-lg bg-neutral-white text-primary-navy grid place-items-center shrink-0 border border-lummy-500">
                {usdc ? <Wallet className="w-5 h-5" /> : <QrCode className="w-5 h-5" />}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-sm text-neutral-black">{usdc ? t("USDC from your wallet", "USDC dari wallet-mu") : "QRIS"}</div>
                <div className="text-xs text-neutral-gray">
                  {usdc
                    ? t(
                        "MetaMask, Rabby or another browser wallet. Two signatures, no gas: Lummy pays it.",
                        "MetaMask, Rabby, atau wallet browser lain. Dua tanda tangan, tanpa gas: Lummy yang membayar."
                      )
                    : t("Scan with GoPay, OVO, DANA, ShopeePay or any bank app", "Scan pakai GoPay, OVO, DANA, ShopeePay, atau aplikasi bank")}
                </div>
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
        <div className="lm-in lg:sticky lg:top-24 h-fit bg-neutral-white rounded-3xl border border-lummy-500 p-6 flex flex-col gap-4" style={{ "--d": "140ms" } as React.CSSProperties}>
          <h2 className="font-semibold text-lg text-neutral-black">{t("Summary", "Rincian")}</h2>
          <div className="flex flex-col gap-2">
            <Row label={qty > 1 ? t(`Tickets (${qty} × ${money(listing.askPrice)})`, `Tiket (${qty} × ${money(listing.askPrice)})`) : t("Ticket price", "Harga tiket")} value={money(subtotal)} />
            {usdc ? (
              <Row label={t("Service fee (none on testnet)", "Biaya layanan (tidak ada selama testnet)")} value={money(0)} />
            ) : (
              <Row label={t("Service fee (5%, min. Rp25,000)", "Biaya layanan (5%, min. Rp25.000)")} value={money(fee)} />
            )}
            {materai > 0 && <Row label={t("e-stamp + e-signature fee", "e-Meterai + biaya TTE")} value={money(materai)} />}
            <div className="border-t border-dashed border-neutral-light-gray-1 my-1" />
            <Row label={t("Total", "Total")} value={money(total)} bold />
          </div>
          {mustConfirmName && (
            <label className="flex items-start gap-2.5 text-xs text-neutral-black cursor-pointer">
              <input
                type="checkbox"
                checked={nameRiskOk}
                onChange={(e) => setNameRiskOk(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-primary-navy cursor-pointer"
              />
              <span>
                {t(
                  "I understand the gate checks that my ID card matches the name on the ticket, so I could be turned away even with a genuine ticket.",
                  "Saya paham petugas gate mengecek KTP harus sama dengan nama di tiket, jadi saya bisa ditolak walaupun tiketnya asli."
                )}
              </span>
            </label>
          )}
          <Button.Primary
            wrapperClass="w-full"
            className="w-full"
            disabled={(mustConfirmName && !nameRiskOk) || (account && !onchain && !payments) || overQris || (usdc && (!account || !payments?.usdc))}
            onClick={pay}
          >
            {t("Pay", "Bayar")} {money(total)}
          </Button.Primary>
          {overQris && (
            <p data-qris-over className="text-xs text-secondary-pink-dark text-center">
              {t(
                `QRIS takes at most ${formatIDR(payments?.max ?? 0)} per payment. Buy fewer tickets at once.`,
                `QRIS maksimal ${formatIDR(payments?.max ?? 0)} per pembayaran. Beli lebih sedikit tiket sekaligus.`
              )}
            </p>
          )}
          <p className="flex items-center gap-1.5 text-xs text-secondary-green-dark justify-center">
            <ShieldCheck className="w-3.5 h-3.5" /> {t("Protected by Lummy escrow", "Dijamin escrow Lummy")}
          </p>
          {usdc ? (
            <p data-usdc-note className="text-[11px] text-neutral-gray text-center -mt-2">
              {!account ? (
                <>
                  {t("Paying in USDC needs an account: ", "Bayar USDC butuh akun: ")}
                  <Link href="/login" className="text-primary-navy font-medium">{t("sign in with email", "masuk dengan email")}</Link>.
                </>
              ) : payments && !payments.usdc ? (
                t("USDC payment is switched off right now.", "Pembayaran USDC sedang dimatikan.")
              ) : (
                <>
                  {t("Testnet: test USDC on Arbitrum Sepolia, not real money. No test USDC yet? ", "Testnet: USDC uji di Arbitrum Sepolia, bukan uang sungguhan. Belum punya? ")}
                  <a href={USDC_FAUCET} target="_blank" rel="noreferrer" className="text-primary-navy font-medium">{t("Circle's faucet", "Faucet Circle")}</a>
                </>
              )}
            </p>
          ) : onchain ? (
            <p className="text-[11px] text-neutral-gray text-center -mt-2">
              {t(
                `Chain mode: a real escrow on Arbitrum Sepolia, ${chainInfo?.priceUsdc ?? "1"} test USDC standing in for the rupiah.`,
                `Mode chain: escrow sungguhan di Arbitrum Sepolia, ${chainInfo?.priceUsdc ?? "1"} USDC testnet mewakili rupiahnya.`
              )}
            </p>
          ) : qris ? (
            <p data-qris-note className="text-[11px] text-neutral-gray text-center -mt-2">
              {payments?.testMode
                ? t(
                    "QRIS in Xendit's test mode: a real app cannot pay the code, and no money moves.",
                    "QRIS mode test Xendit: kodenya tidak bisa dibayar aplikasi sungguhan, dan tidak ada uang yang berpindah."
                  )
                : t("Pay with QRIS from any e-wallet or bank app.", "Bayar dengan QRIS dari e-wallet atau aplikasi bank apa pun.")}
            </p>
          ) : account ? (
            <p data-simulated-payment className="text-[11px] text-neutral-gray text-center -mt-2">
              {t(
                "Simulated payment: no money moves yet. The order and its escrow rules are saved to your account.",
                "Pembayaran simulasi: belum ada uang yang berpindah. Pesanan dan aturan escrow-nya tersimpan di akunmu."
              )}
            </p>
          ) : (
            // A sample account sees the QRIS rail but pays nothing; say so before the tap, not after.
            <p data-sample-payment className="text-[11px] text-neutral-gray text-center -mt-2">
              {t(
                "Sample account: the payment is simulated, so there is no QR code to scan and no money moves.",
                "Akun contoh: pembayarannya simulasi, jadi tidak ada QR yang perlu discan dan tidak ada uang yang berpindah."
              )}
            </p>
          )}
          {/* What happens if it goes wrong, said at the till, and who to ask (user feedback, 16 Oct). */}
          <p className="text-[11px] text-neutral-gray text-center">
            <Link href="/how-it-works#coverage" className="text-primary-navy font-medium">{t("What if something goes wrong?", "Kalau ada masalah, bagaimana?")}</Link>
            {" · "}
            {t("Help:", "Bantuan:")} <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary-navy font-medium">{CONTACT_EMAIL}</a>
          </p>
        </div>
      </div>

      <Modal open={processing} onClose={() => {}}>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 text-lummy-500 animate-spin" />
          <p className="font-semibold text-neutral-black">{t("Processing payment...", "Memproses pembayaran...")}</p>
          <p className="text-sm text-neutral-gray text-center">
            {onchain
              ? t("Locking your money in the escrow contract: listing, payment, handover.", "Mengunci dana di kontrak escrow: listing, pembayaran, serah terima.")
              : qris
              ? t("Holding your seats and creating the QRIS code.", "Menahan kursimu dan membuat kode QRIS.")
              : account
              ? t("Saving your order.", "Menyimpan pesananmu.")
              : t("Securing your money in escrow.", "Mengamankan dana kamu di escrow.")}
          </p>
        </div>
      </Modal>

      {/* Paying in USDC: the wallet signs, the server locks the money. Like QRIS, only its own
          buttons close it, since the seats may be held. */}
      <Modal open={usdcOpen} onClose={() => {}} className="max-w-md">
        {usdcOpen && (
          <UsdcPanel
            listingId={listing.id}
            quantity={qty}
            total={total}
            onPaid={(orderId) => {
              toast.success(t("Paid. Your USDC is locked in the escrow on Arbitrum.", "Pembayaran berhasil. USDC-mu dikunci di escrow di Arbitrum."));
              router.push(`/tickets/${orderId}`);
              router.refresh();
            }}
            onClose={() => {
              setUsdcOpen(false);
              router.refresh();
            }}
          />
        )}
      </Modal>

      {/* Closing it by accident would leave the seats held, so only its own buttons close it. */}
      <Modal open={!!payment} onClose={() => {}} className="max-w-md">
        {payment && (
          <QrisPanel
            initial={payment}
            onPaid={(orderId, testMode) => {
              toast.success(
                testMode
                  ? t("Payment received (test mode). Your order is saved, and its escrow rules are real.", "Pembayaran (mode test) diterima. Pesananmu tersimpan, dan aturan escrow-nya sungguhan.")
                  : t("Payment received. Your money is now in escrow.", "Pembayaran diterima. Dana kamu sekarang di escrow.")
              );
              router.push(`/tickets/${orderId}`);
              router.refresh();
            }}
            onClose={() => {
              setPayment(null);
              router.refresh();
            }}
          />
        )}
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
