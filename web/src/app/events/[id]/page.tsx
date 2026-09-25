"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  MapPin, Calendar, Lock, ArrowLeft, ArrowRight, ScanLine, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotifyCard } from "@/components/events/NotifyCard";
import {
  getTier, isBuyable, isEventOver, CAP_PCT, type Listing, type EventItem,
} from "@/lib/mock";
import { useT, useFormatters, useCategoryLabel } from "@/lib/i18n";
import { useCatalogue } from "@/lib/catalogue";

function ListingRow({ event, listing, qty, cheapest }: { event: EventItem; listing: Listing; qty: number; cheapest?: boolean }) {
  const t = useT();
  const { formatIDR } = useFormatters();
  const tier = getTier(event, listing.tierId);
  const markup = Math.round((listing.askPrice / listing.faceValue - 1) * 100);
  const total = listing.askPrice * qty;
  const dup = listing.ai.barcodeDuplicate;
  const buyable = isBuyable(listing);
  const flagged = !dup && !buyable;
  const highlight = cheapest && buyable;

  return (
    <div className={`relative bg-neutral-white rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${highlight ? "border-primary-navy border-2" : "border-neutral-light-gray-1"} ${buyable ? "" : "bg-secondary-gray-soft/60"}`}>
      {highlight && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-primary-navy px-2.5 py-0.5 text-[11px] font-semibold text-white">{t("Cheapest", "Termurah")}</span>
      )}
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-fredoka font-semibold text-lg text-neutral-black">{tier?.name}</span>
          {dup ? (
            <Badge.Base className="rounded-full bg-secondary-pink-soft text-secondary-pink-dark text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t("Duplicate barcode", "Barcode duplikat")}</Badge.Base>
          ) : flagged ? (
            <Badge.Base className="rounded-full bg-secondary-orange-soft text-secondary-orange-dark text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t("Under review", "Dalam review")}</Badge.Base>
          ) : (
            <Badge.Base className="rounded-full bg-secondary-green-light text-secondary-green-dark text-xs flex items-center gap-1"><ScanLine className="w-3 h-3" /> {t("AI verified", "Terverifikasi AI")}</Badge.Base>
          )}
        </div>
        <span className="text-sm text-neutral-gray">
          {t(`Face value ${formatIDR(listing.faceValue)}`, `Harga asli ${formatIDR(listing.faceValue)}`)}
          <span className={markup > 0 ? "text-neutral-black" : "text-secondary-green-dark"}> ({markup > 0 ? "+" : ""}{markup}%)</span>
        </span>
        <span className="text-xs text-neutral-gray">
          {listing.sellerName}
          {listing.gateKtp ? t(" · ID checked at the gate", " · KTP dicek di gate") : ""}
          {listing.splittable && listing.quantity > qty ? t(` · ${listing.quantity - qty} more in this set`, ` · sisa ${listing.quantity - qty} di set ini`) : ""}
        </span>
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
        <div className="sm:text-right">
          <div className="font-fredoka font-bold text-xl text-primary-navy text-nowrap">{formatIDR(listing.askPrice)}<span className="text-xs text-neutral-gray font-sans font-normal"> {t("each", "/tiket")}</span></div>
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
        <Image src="/assets/images/mascot-confused.svg" alt="" width={120} height={120} />
        <p className="text-neutral-gray">{t("Event not found.", "Event tidak ditemukan.")}</p>
        <Link href="/events"><Button.Secondary>{t("Back to browse", "Balik ke jelajah")}</Button.Secondary></Link>
      </div>
    );
  }
  const buyable = visibleListings.filter(isBuyable);
  const cheapest = buyable.length ? Math.min(...buyable.map((l) => l.askPrice)) : 0;
  const over = isEventOver(event);

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
            <Image src={event.image} alt={event.title} fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" priority />
            <span className="absolute top-3 left-3 bg-neutral-white/95 backdrop-blur-sm text-lummy-500 text-xs font-semibold rounded-full px-3 py-1 shadow-sm">{categoryLabel(event.category)}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-black mt-6 tracking-tight">{event.title}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-neutral-gray">
            <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary-navy" /> {formatEventDate(event.dateISO)}</span>
            <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary-navy" /> {event.venue}, {event.city}</span>
          </div>

          {over ? (
            <div className="mt-10 rounded-2xl bg-secondary-gray-soft p-6 text-center">
              <p className="font-fredoka font-semibold text-neutral-black">{t("This show has ended", "Acara ini sudah selesai")}</p>
              <p className="text-sm text-neutral-gray mt-1">{t("Tickets for it are no longer on sale.", "Tiketnya sudah tidak dijual lagi.")}</p>
              <Link href="/events" className="inline-block mt-4"><Button.Secondary className="text-sm">{t("See what is coming up", "Lihat acara berikutnya")}</Button.Secondary></Link>
            </div>
          ) : (
          <>
          {/* Ticket count, Viagogo style: filters to sets that can satisfy it */}
          <div className="mt-10 mb-5 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-neutral-gray">{t("How many tickets?", "Mau berapa tiket?")}</span>
            <div className="flex items-center gap-1 bg-secondary-gray-soft rounded-full p-1" role="group" aria-label={t("Number of tickets", "Jumlah tiket")}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => setQty(n)}
                  aria-pressed={qty === n}
                  className={`w-9 h-9 rounded-full text-sm transition cursor-pointer ${qty === n ? "bg-primary-navy text-white font-medium" : "text-neutral-gray hover:text-primary-navy"}`}
                >
                  {n}{n === 6 ? "+" : ""}
                </button>
              ))}
            </div>
            {qty > 1 && <span className="text-xs text-neutral-gray">{t("Sets are always seated together", "Satu set pasti duduk bersebelahan")}</span>}
          </div>

          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="font-fredoka font-semibold text-xl text-neutral-black">
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
              visibleListings.map((l) => (
                <ListingRow key={l.id} event={event} listing={l} qty={qty} cheapest={l.askPrice === cheapest} />
              ))
            ) : (
              <div className="text-center py-10 bg-secondary-gray-soft rounded-2xl">
                <p className="text-neutral-gray text-sm">{t(`Nobody is selling ${qty} tickets together for this show yet.`, `Belum ada yang jual ${qty} tiket sekaligus untuk acara ini.`)}</p>
                {qty !== 1 && <button onClick={() => setQty(1)} className="text-primary-navy text-sm font-medium mt-1 cursor-pointer">{t("Show single tickets", "Tampilkan tiket satuan")}</button>}
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 h-fit flex flex-col gap-4">
          <div className="bg-neutral-white rounded-3xl border border-lummy-500 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-2 text-primary-navy font-fredoka font-semibold">
                <Lock className="w-5 h-5" /> {t("Protected by escrow", "Dilindungi escrow")}
              </div>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm text-neutral-gray">
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> {t("The seller is paid after the show, not before", "Penjual dibayar setelah acara, bukan sebelumnya")}</li>
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> {t("Turned away with proof? Your money comes back", "Ditolak dengan bukti? Uangmu kembali")}</li>
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> {t(`Every price is at most ${CAP_PCT}% of face value`, `Semua harga maksimal ${CAP_PCT}% dari harga asli`)}</li>
              </ul>
              <Link href="/how-it-works" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary-navy hover:opacity-80">
                {t("How this works", "Cara kerjanya")} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {/* Price stub: perforation + cream reads as ticket paper */}
            <div className="px-6 py-4 bg-secondary-cream-light border-t-2 border-dashed border-neutral-light-gray-1">
              {event.fromPrice > 0 && !over ? (
                <>
                  <div className="text-xs text-secondary-brown-dark/80">{t("From", "Mulai dari")}</div>
                  <div className="font-fredoka font-bold text-2xl text-neutral-black">{formatIDR(event.fromPrice)}</div>
                  <p className="text-xs text-secondary-brown-dark/70 mt-1">
                    {event.listingCount === 1
                      ? t("1 listing you can buy right now", "1 listing yang bisa dibeli sekarang")
                      : t(`${event.listingCount} listings you can buy right now`, `${event.listingCount} listing yang bisa dibeli sekarang`)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-secondary-brown-dark/80">{t("Nothing on sale right now. Join the waitlist and we will tell you.", "Belum ada yang dijual. Masuk waitlist, nanti kami kabari.")}</p>
              )}
            </div>
          </div>
          <NotifyCard event={event} />
        </aside>
      </div>
    </div>
  );
}
