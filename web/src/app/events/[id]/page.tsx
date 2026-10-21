"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  MapPin, Calendar, Lock, ArrowLeft, ArrowRight, ScanLine, AlertTriangle, CheckCircle2, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotifyCard } from "@/components/events/NotifyCard";
import { TransferPolicyNote } from "@/components/common/TransferPolicyNote";
import {
  getTier, isBuyable, clearedByStaff, isEventOver, resaleAllowed, CAP_PCT, SELLER_PENALTY_PCT, type Listing, type EventItem,
} from "@/lib/mock";
import { useT, useFormatters, useCategoryLabel } from "@/lib/i18n";
import { useCatalogue } from "@/lib/catalogue";
import { FEATURES } from "@/lib/features";

function ListingRow({ event, listing, qty, cheapest, index }: { event: EventItem; listing: Listing; qty: number; cheapest?: boolean; index: number }) {
  const t = useT();
  const { formatIDR } = useFormatters();
  const tier = getTier(event, listing.tierId);
  const markup = Math.round((listing.askPrice / listing.faceValue - 1) * 100);
  const total = listing.askPrice * qty;
  const dup = listing.ai.barcodeDuplicate;
  const buyable = isBuyable(listing);
  const flagged = !dup && !buyable;
  const highlight = cheapest && buyable;
  const [aboutSeller, setAboutSeller] = useState(false);

  return (
    // CSS entrance, not data-reveal: the rows are rendered on the server and on screen at load,
    // so they must not wait for hydration to show (it cost ~0.4s on a slow phone).
    <div data-listing={listing.id} style={{ "--i": index, "--d": "220ms" } as React.CSSProperties} className={`lm-in relative bg-neutral-white rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition duration-300 ${highlight ? "border-primary-navy border-2" : "border-neutral-light-gray-1"} ${buyable ? "hover:border-primary-navy hover:shadow-[3px_3px_0_#0D3B9A] hover:-translate-y-0.5" : ""} ${buyable ? "" : "bg-secondary-gray-soft/60"}`}>
      {highlight && (
        <span className="absolute -top-2.5 left-4 rounded-full border border-neutral-light-gray-1 bg-neutral-white px-2.5 py-0.5 text-[11px] font-semibold text-neutral-gray">{t("Cheapest", "Termurah")}</span>
      )}
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-lg text-neutral-black">{tier?.name}</span>
          {/* Brand guideline 1.0: colour only where it asks for attention. Every ticket on sale has
              been checked, so "Checked" is gray like "Cheapest"; review and duplicates keep theirs. */}
          {dup ? (
            <Badge.Base className="rounded-full bg-secondary-pink-soft text-secondary-pink-dark text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t("Duplicate barcode", "Barcode duplikat")}</Badge.Base>
          ) : flagged ? (
            <Badge.Base className="rounded-full bg-secondary-orange-soft text-secondary-orange-dark text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t("Under review", "Dalam review")}</Badge.Base>
          ) : clearedByStaff(listing) ? (
            // The checks flagged it and a person cleared it: say that, not just "Checked".
            <Badge.Base className="rounded-full border border-neutral-light-gray-1 bg-neutral-white text-neutral-gray text-xs flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> {t("Checked by the Lummy team", "Dicek tim Lummy")}</Badge.Base>
          ) : (
            <Badge.Base className="rounded-full border border-neutral-light-gray-1 bg-neutral-white text-neutral-gray text-xs flex items-center gap-1"><ScanLine className="w-3 h-3" /> {t("Checked", "Sudah dicek")}</Badge.Base>
          )}
        </div>
        {/* Only what the ticket prints: no seat printed is not proof of standing, so nothing is guessed. */}
        {listing.seat && (
          <span data-listing-seat className="text-sm text-neutral-black break-words">
            {t("On the ticket", "Posisi di tiket")}: {listing.seat}
          </span>
        )}
        <span className="text-sm text-neutral-gray">
          {t(`Face value ${formatIDR(listing.faceValue)}`, `Harga asli ${formatIDR(listing.faceValue)}`)}
          <span className={markup > 0 ? "text-neutral-black" : "text-secondary-green-dark"}> ({markup > 0 ? "+" : ""}{markup}%)</span>
        </span>
        <span className="text-xs text-neutral-gray">
          {/* 16 Oct feedback: buyers tap the seller's name for a record. There is none to show yet,
              so the name answers what the record would be for: why this seller need not be trusted. */}
          <button
            type="button"
            data-seller-info
            aria-expanded={aboutSeller}
            onClick={() => setAboutSeller((v) => !v)}
            className="underline decoration-dotted underline-offset-2 hover:text-primary-navy transition cursor-pointer"
          >
            {listing.sellerName}
          </button>
          {/* Until sellers can stage an ID card (FEATURES.sellerIdCard), no listing has one, so a mark
              per listing would only tell the sample listings apart; the name rule is in the sidebar. */}
          {FEATURES.sellerIdCard && listing.gateKtp ? t(" · ID checked at the gate", " · KTP dicek di gate") : ""}
          {/* Where the gate checks names, a listing without the seller's ID card is the risky one. */}
          {FEATURES.sellerIdCard && !listing.gateKtp && (event.transferPolicy === "letter" || event.transferPolicy === "id_match") && (
            <span className="text-secondary-orange-dark">{t(" · seller's ID card not staged", " · KTP penjual belum disiapkan")}</span>
          )}
          {listing.splittable && listing.quantity > qty ? t(` · ${listing.quantity - qty} more in this set`, ` · sisa ${listing.quantity - qty} di set ini`) : ""}
        </span>
        {aboutSeller && (
          <p data-seller-note className="text-xs text-neutral-gray bg-secondary-gray-soft rounded-xl p-3 max-w-md leading-relaxed">
            {t(
              `Lummy does not show seller records yet, and you do not have to trust the seller: your money is held in escrow until the show is over, and if you are turned away with proof, it comes back. A seller whose ticket fails loses the sale and pays a ${SELLER_PENALTY_PCT}% penalty.`,
              `Lummy belum menampilkan riwayat penjual, dan kamu tidak perlu memercayai penjualnya: uangmu ditahan escrow sampai acara selesai, dan kalau ditolak di gate dengan bukti, uangmu kembali. Penjual yang tiketnya gagal kehilangan penjualannya dan kena penalti ${SELLER_PENALTY_PCT}%.`
            )}{" "}
            <Link href="/how-it-works#coverage" className="text-primary-navy font-medium">{t("When something goes wrong", "Kalau ada masalah")}</Link>
          </p>
        )}
        {/* 16 Oct feedback: a cheaper ticket "in review" left the buyer asking until when. No time
            is promised to a buyer, since a person may also reject it. */}
        {flagged && (
          <span data-review-why className="text-xs text-secondary-orange-dark">
            {t("Can be bought once the Lummy team has checked the file, if it passes", "Bisa dibeli setelah tim Lummy mengecek file-nya, kalau lolos")}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
        <div className="sm:text-right">
          <div className="tabular-nums font-bold text-xl text-primary-navy text-nowrap">{formatIDR(listing.askPrice)}<span className="text-xs text-neutral-gray font-sans font-normal"> {t("each", "/tiket")}</span></div>
          {qty > 1 && <div className="text-xs text-neutral-gray text-nowrap">{t(`${qty} tickets · ${formatIDR(total)}`, `${qty} tiket · ${formatIDR(total)}`)}</div>}
        </div>
        {buyable ? (
          <Link href={`/checkout?listing=${listing.id}&qty=${qty}`}>
            <Button.Primary className="text-sm">{t("Buy", "Beli")}</Button.Primary>
          </Link>
        ) : (
          <Button.Primary className="text-sm" disabled>{dup ? t("Blocked", "Diblokir") : t("In review", "Direview")}</Button.Primary>
        )}
      </div>
    </div>
  );
}

const SORTS = [
  { id: "cheap", en: "Cheapest", id_: "Termurah" },
  { id: "new", en: "Newest", id_: "Terbaru" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

export default function EventDetailPage() {
  const t = useT();
  const { formatIDR, formatEventDate } = useFormatters();
  const categoryLabel = useCategoryLabel();
  const params = useParams<{ id: string }>();
  const catalogue = useCatalogue();
  const event = catalogue.eventById(params.id);
  const [sort, setSort] = useState<SortId>("cheap");
  const [qty, setQty] = useState(2);

  // Hooks run before any early return, so the order stays identical on every
  // render even when the event id does not resolve.
  const listings = useMemo(() => (event ? catalogue.listingsByEvent(event.id) : []), [event, catalogue]);
  // Viagogo-style filter: show sets that can satisfy qty (>=N); non-splittable only at exactly N.
  const visibleListings = useMemo(() => {
    const arr = listings.filter((l) => l.quantity >= qty && (l.splittable || l.quantity === qty));
    if (sort === "cheap") arr.sort((a, b) => a.askPrice - b.askPrice); // per ticket
    return arr;
  }, [listings, sort, qty]);

  if (!event) {
    return (
      <div className="max-w-4xl mx-auto px-5 lg:px-10 pt-28 pb-16 text-center flex flex-col items-center gap-4">
        <Image src="/assets/brand/maskot-bingung.svg" alt="" width={152} height={130} />
        <p className="text-neutral-gray">{t("Event not found.", "Event tidak ditemukan.")}</p>
        <Link href="/events"><Button.Secondary>{t("Back to browse", "Balik ke jelajah")}</Button.Secondary></Link>
      </div>
    );
  }
  const buyable = visibleListings.filter(isBuyable);
  const cheapest = buyable.length ? Math.min(...buyable.map((l) => l.askPrice)) : 0;
  // Buyable listings the ticket count hides, so the list adds up to the sidebar's count.
  const otherQuantities = listings.filter(isBuyable).length - buyable.length;
  const over = isEventOver(event);
  const closed = !resaleAllowed(event.transferPolicy);

  return (
    <div className="pt-28 pb-16">
      {/* Back link */}
      <div className="max-w-7xl mx-auto px-5 lg:px-10">
        <Link href="/events" className="inline-flex items-center gap-1 text-neutral-gray hover:text-primary-navy transition text-sm">
          <ArrowLeft className="w-4 h-4" /> {t("Browse", "Jelajah")}
        </Link>
      </div>

      <div className="max-w-7xl mx-auto px-5 lg:px-10 mt-4 grid lg:grid-cols-[1.6fr_1fr] gap-8">
        {/* Main */}
        <div>
          {/* 16:9 photo; the category rides on the image so it never crowds the title */}
          <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-lummy-500">
            <Image src={event.image} alt={event.title} fill sizes="(min-width: 1024px) 60vw, 100vw" className="lm-settle object-cover" priority />
            <span className="absolute top-3 left-3 bg-neutral-white/95 backdrop-blur-sm text-lummy-500 text-xs font-semibold rounded-full px-3 py-1 shadow-sm">{categoryLabel(event.category)}</span>
          </div>
          <h1 className="lm-in text-3xl md:text-4xl font-bold text-neutral-black mt-6 tracking-tight" style={{ "--d": "120ms" } as React.CSSProperties}>{event.title}</h1>
          <div className="lm-in flex flex-wrap gap-x-6 gap-y-2 mt-4 text-neutral-gray" style={{ "--d": "180ms" } as React.CSSProperties}>
            <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary-navy" /> {formatEventDate(event.dateISO)}</span>
            <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary-navy" /> {event.venue}, {event.city}</span>
          </div>
          {event.postponed && !over && (
            <p data-event-postponed className="mt-3 inline-flex items-center gap-2 rounded-full bg-secondary-gold-soft px-3 py-1 text-xs font-medium text-secondary-brown-dark">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {t("Postponed by the organiser. The date above is the new one.", "Diundur penyelenggara. Tanggal di atas adalah jadwal barunya.")}
            </p>
          )}

          {over ? (
            <div className="mt-10 rounded-2xl bg-secondary-gray-soft p-6 text-center">
              <p className="font-semibold text-neutral-black">{t("This show has ended", "Acara ini sudah selesai")}</p>
              <p className="text-sm text-neutral-gray mt-1">{t("Tickets for it are no longer on sale.", "Tiketnya sudah tidak dijual lagi.")}</p>
              <Link href="/events" className="inline-block mt-4"><Button.Secondary className="text-sm">{t("See what is coming up", "Lihat acara berikutnya")}</Button.Secondary></Link>
            </div>
          ) : closed ? (
            <div className="mt-10 rounded-2xl bg-secondary-pink-soft p-6 text-center">
              <p className="font-semibold text-neutral-black">{t("Resale is not allowed for this show", "Tiket acara ini tidak boleh dijual ulang")}</p>
              <p className="text-sm text-neutral-gray mt-1">{t("The organiser forbids it, so Lummy does not open listings here.", "Penyelenggara melarangnya, jadi Lummy tidak membuka listing di sini.")}</p>
            </div>
          ) : (
          <>
          {/* Ticket count, Viagogo style: filters to sets that can satisfy it. Up to 8, the most one
              listing holds (api/listings): a set that cannot be split shows only at its own count, so
              a 7 or 8 behind a "6+" was never seen, and "6+" bought exactly 6. */}
          <div className="mt-10 mb-5 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-neutral-gray">{t("How many tickets?", "Mau berapa tiket?")}</span>
            <div className="flex items-center gap-0.5 sm:gap-1 bg-secondary-gray-soft rounded-full p-1" role="group" aria-label={t("Number of tickets", "Jumlah tiket")}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  onClick={() => setQty(n)}
                  aria-pressed={qty === n}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full text-sm transition cursor-pointer active:scale-90 ${qty === n ? "bg-primary-navy text-white font-medium" : "text-neutral-gray hover:text-primary-navy"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            {/* Not "always seated together": a standing ticket has no seat, and Lummy only knows the
                tickets come from one listing and sit as printed. */}
            {qty > 1 && <span className="text-xs text-neutral-gray">{t("Tickets bought together come from one listing, placed as printed", "Tiket yang dibeli sekaligus dari satu listing, posisinya sesuai yang tercetak")}</span>}
            {qty === 8 && <span className="text-xs text-neutral-gray">{t("Need more than 8? Buy from more than one listing.", "Butuh lebih dari 8? Beli dari beberapa listing.")}</span>}
          </div>

          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="font-semibold text-xl text-neutral-black">
              {t("Tickets for sale", "Tiket yang dijual")} <span className="text-neutral-gray font-normal text-base">({visibleListings.length})</span>
            </h2>
            {visibleListings.length > 1 && (
              <div className="flex items-center gap-1 bg-secondary-gray-soft rounded-full p-1">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSort(s.id)}
                    aria-pressed={sort === s.id}
                    className={`px-3 py-1.5 rounded-full text-sm transition cursor-pointer ${
                      sort === s.id ? "bg-neutral-white text-primary-navy font-medium shadow-sm" : "text-neutral-gray"
                    }`}
                  >
                    {t(s.en, s.id_)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            {visibleListings.length > 0 ? (
              visibleListings.map((l, i) => (
                <ListingRow key={l.id} event={event} listing={l} qty={qty} cheapest={l.askPrice === cheapest} index={i} />
              ))
            ) : (
              <div className="text-center py-10 bg-secondary-gray-soft rounded-2xl">
                <p className="text-neutral-gray text-sm">{t(`Nobody is selling ${qty} tickets together for this show yet.`, `Belum ada yang jual ${qty} tiket sekaligus untuk acara ini.`)}</p>
                {qty !== 1 && <button onClick={() => setQty(1)} className="text-primary-navy text-sm font-medium mt-1 cursor-pointer">{t("Show single tickets", "Tampilkan tiket satuan")}</button>}
              </div>
            )}
          </div>
          {visibleListings.length > 0 && otherQuantities > 0 && (
            <p data-other-quantities className="mt-4 text-xs text-neutral-gray">
              {otherQuantities === 1
                ? t(
                    `1 more listing is for a different number of tickets. Change "How many tickets?" above to see it.`,
                    `Ada 1 listing lain untuk jumlah tiket berbeda. Ubah "Mau berapa tiket?" di atas untuk melihatnya.`
                  )
                : t(
                    `${otherQuantities} more listings are for a different number of tickets. Change "How many tickets?" above to see them.`,
                    `Ada ${otherQuantities} listing lain untuk jumlah tiket berbeda. Ubah "Mau berapa tiket?" di atas untuk melihatnya.`
                  )}
            </p>
          )}
          </>
          )}
        </div>

        {/* Sidebar */}
        <aside className="lm-in lg:sticky lg:top-24 h-fit flex flex-col gap-4" style={{ "--d": "160ms" } as React.CSSProperties}>
          <div className="bg-neutral-white rounded-3xl border border-lummy-500 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-2 text-primary-navy font-semibold">
                <Lock className="w-5 h-5" /> {t("Protected by escrow", "Dilindungi escrow")}
              </div>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm text-neutral-gray">
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> {t("The seller is paid after the show, not before", "Penjual dibayar setelah acara, bukan sebelumnya")}</li>
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> {t("Turned away with proof? Your money comes back", "Ditolak dengan bukti? Uangmu kembali")}</li>
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> {t(`Every price is at most ${CAP_PCT}% of face value`, `Semua harga maksimal ${CAP_PCT}% dari harga asli`)}</li>
              </ul>
              <Link href="/how-it-works" className="group mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary-navy">
                <span className="lm-underline">{t("How this works", "Cara kerjanya")}</span> <ArrowRight className="w-3.5 h-3.5 transition group-hover:translate-x-0.5" />
              </Link>
            </div>
            {/* Price stub: perforation + cream reads as ticket paper */}
            <div className="px-6 py-4 bg-secondary-cream-light border-t-2 border-dashed border-neutral-light-gray-1">
              {event.fromPrice > 0 && !over ? (
                <>
                  <div className="text-xs text-secondary-brown-dark">{t("From", "Mulai dari")}</div>
                  <div className="tabular-nums font-bold text-2xl text-neutral-black">{formatIDR(event.fromPrice)}</div>
                  <p className="text-xs text-secondary-brown-dark mt-1">
                    {event.listingCount === 1
                      ? t("1 listing you can buy right now", "1 listing yang bisa dibeli sekarang")
                      : t(`${event.listingCount} listings you can buy right now`, `${event.listingCount} listing yang bisa dibeli sekarang`)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-secondary-brown-dark">
                  {closed
                    ? t("Resale is closed by the organiser.", "Resale ditutup oleh penyelenggara.")
                    : t("Nothing on sale right now. Join the waitlist and we will tell you.", "Belum ada yang dijual. Masuk waitlist, nanti kami kabari.")}
                </p>
              )}
            </div>
          </div>
          {!over && <TransferPolicyNote policy={event.transferPolicy} audience="buyer" />}
          {!closed && <NotifyCard event={event} />}
        </aside>
      </div>
    </div>
  );
}
