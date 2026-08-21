"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  MapPin, Calendar, ShieldCheck, Lock, ArrowLeft, ScanLine, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotifyCard } from "@/components/events/NotifyCard";
import {
  getEventById, getListingsByEvent, getTier, CAP_PCT, type Listing, type EventItem,
} from "@/lib/mock";
import { useT, useFormatters, useCategoryLabel } from "@/lib/i18n";

function ListingRow({ event, listing, qty, cheapest }: { event: EventItem; listing: Listing; qty: number; cheapest?: boolean }) {
  const t = useT();
  const { formatIDR } = useFormatters();
  const tier = getTier(event, listing.tierId);
  const markup = Math.round((listing.askPrice / listing.faceValue - 1) * 100);
  const total = listing.askPrice * qty;
  const dup = listing.ai.barcodeDuplicate;
  const flagged = !dup && (listing.ai.pdfSuspicious || listing.ai.forgeryScore >= 60);
  const buyable = !dup && !flagged;

  return (
    <div className={`bg-neutral-white rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${cheapest && buyable ? "border-lummy-500 ring-1 ring-lummy-500" : "border-neutral-light-gray-1"}`}>
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-fredoka font-semibold text-neutral-black">{tier?.name}</span>
          <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-xs">{t(`${qty} seats together`, `${qty} tiket bersebelahan`)}</Badge.Base>
          {cheapest && buyable && <Badge.Base className="bg-secondary-green-soft text-secondary-green-dark text-xs font-medium">{t("Cheapest", "Termurah")}</Badge.Base>}
          {dup ? (
            <Badge.Base className="bg-secondary-pink-soft text-secondary-pink-dark text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t("Duplicate barcode", "Barcode duplikat")}</Badge.Base>
          ) : flagged ? (
            <Badge.Base className="bg-secondary-orange-soft text-secondary-orange-dark text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t("Under review", "Dalam review")}</Badge.Base>
          ) : (
            <Badge.Base className="bg-secondary-green-soft text-secondary-green-dark text-xs flex items-center gap-1"><ScanLine className="w-3 h-3" /> {t("AI verified", "Terverifikasi AI")}</Badge.Base>
          )}
          {listing.gateKtp && <Badge.Base className="bg-secondary-cream-soft text-secondary-brown-dark text-xs">{t("ID check at gate", "Gate cek KTP")}</Badge.Base>}
        </div>
        <span className="text-xs text-neutral-gray">
          {t("Seller", "Penjual")}: {listing.sellerName} · {t("Face value", "Harga asli")} {formatIDR(listing.faceValue)} {t("each", "per tiket")}
          {listing.splittable && listing.quantity > qty ? t(` · set of ${listing.quantity}, the rest stays available`, ` · set ${listing.quantity}, sisanya tetap tersedia`) : ""}
        </span>
        <span className="text-xs text-secondary-green-dark flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> {t(`Markup ${markup}%, inside the 150% cap`, `Markup ${markup}%, masih dalam batas 150%`)}
        </span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="text-right">
          <div className="font-fredoka font-bold text-lg text-lummy-500 text-nowrap">{formatIDR(listing.askPrice)}<span className="text-xs text-neutral-gray font-normal"> {t("each", "/tiket")}</span></div>
          {qty > 1 && <div className="text-xs text-neutral-gray text-nowrap">{qty} {t("tickets", "tiket")} · {formatIDR(total)}</div>}
        </div>
        {dup ? (
          <Button.Primary className="text-sm" disabled>{t("Duplicate", "Duplikat")}</Button.Primary>
        ) : flagged ? (
          <Button.Primary className="text-sm" disabled>{t("In review", "Direview")}</Button.Primary>
        ) : (
          <Link href={`/checkout?listing=${listing.id}&qty=${qty}`}>
            <Button.Primary className="text-sm">{t("Buy", "Beli")}</Button.Primary>
          </Link>
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
  const event = getEventById(params.id);
  const [sort, setSort] = useState<SortId>("cheap");
  const [qty, setQty] = useState(2);

  if (!event) {
    return (
      <div className="max-w-4xl mx-auto px-5 lg:px-10 pt-28 pb-16 text-center flex flex-col items-center gap-4">
        <Image src="/assets/images/mascot-confused.svg" alt="" width={120} height={120} />
        <p className="text-neutral-gray">{t("Event not found.", "Event tidak ditemukan.")}</p>
        <Link href="/events"><Button.Secondary>{t("Back to browse", "Balik ke jelajah")}</Button.Secondary></Link>
      </div>
    );
  }

  const listings = getListingsByEvent(event.id);
  // Viagogo-style filter: show sets that can satisfy qty (>=N); non-splittable only at exactly N.
  const visibleListings = useMemo(() => {
    const arr = listings.filter((l) => l.quantity >= qty && (l.splittable || l.quantity === qty));
    if (sort === "cheap") arr.sort((a, b) => a.askPrice - b.askPrice); // per ticket
    return arr;
  }, [listings, sort, qty]);
  const buyable = visibleListings.filter((l) => !l.ai.barcodeDuplicate && !(l.ai.pdfSuspicious || l.ai.forgeryScore >= 60));
  const cheapest = buyable.length ? Math.min(...buyable.map((l) => l.askPrice)) : 0;

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
            <Image src={event.image} alt={event.title} fill className="object-cover" priority />
            <span className="absolute top-3 left-3 bg-neutral-white/95 backdrop-blur-sm text-lummy-500 text-xs font-semibold rounded-full px-3 py-1 shadow-sm">{categoryLabel(event.category)}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-black mt-6">{event.title}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-neutral-gray">
            <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary-navy" /> {formatEventDate(event.dateISO)}</span>
            <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary-navy" /> {event.venue}, {event.city}</span>
          </div>

          {/* Ticket count, Viagogo style: filters to sets that can satisfy it */}
          <div className="mt-10 mb-4 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-neutral-gray">{t("How many tickets?", "Mau berapa tiket?")}</span>
            <div className="flex items-center gap-1 bg-secondary-gray-soft rounded-full p-1">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => setQty(n)}
                  className={`w-9 h-9 rounded-full text-sm transition cursor-pointer ${qty === n ? "bg-primary-navy text-white font-medium" : "text-neutral-gray hover:text-primary-navy"}`}
                >
                  {n}{n === 6 ? "+" : ""}
                </button>
              ))}
            </div>
            <span className="text-xs text-secondary-green-dark flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {t("Guaranteed to be seated together", "Dijamin duduk bersebelahan")}</span>
          </div>

          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 className="font-fredoka font-semibold text-xl text-neutral-black">
              {t("Resale tickets available", "Tiket resale tersedia")} <span className="text-neutral-gray font-normal text-base">({visibleListings.length})</span>
            </h3>
            {visibleListings.length > 1 && (
              <div className="flex items-center gap-1 bg-secondary-gray-soft rounded-full p-1">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSort(s.id)}
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
          <div className="flex flex-col gap-3">
            {visibleListings.length > 0 ? (
              visibleListings.map((l) => (
                <ListingRow key={l.id} event={event} listing={l} qty={qty} cheapest={l.askPrice === cheapest} />
              ))
            ) : (
              <div className="text-center py-10 bg-secondary-gray-soft rounded-2xl">
                <p className="text-neutral-gray text-sm">{t(`Nobody is selling ${qty} tickets together for this event.`, `Belum ada yang jual ${qty} tiket sekaligus untuk event ini.`)}</p>
                <button onClick={() => setQty(1)} className="text-primary-navy text-sm font-medium mt-1 cursor-pointer">{t("Try a single ticket", "Coba cari 1 tiket")}</button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 h-fit flex flex-col gap-4">
          <div className="bg-neutral-white rounded-3xl border border-lummy-500 overflow-hidden">
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-lummy-500 font-fredoka font-semibold">
                <Lock className="w-5 h-5" /> {t("Escrow protected", "Dilindungi escrow")}
              </div>
              <ul className="flex flex-col gap-3 text-sm text-neutral-gray">
                <li className="flex gap-2"><ShieldCheck className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> {t("Funds stay locked until the show is over. Refused at the gate with proof means your money back.", "Dana terkunci sampai konser selesai. Ditolak di gate dengan bukti berarti uangmu kembali.")}</li>
                <li className="flex gap-2"><ScanLine className="w-4 h-4 text-secondary-pink-dark shrink-0 mt-0.5" /> {t("Every ticket is AI screened: PDF forensics and duplicate barcodes.", "Tiap tiket dicek AI: forensik PDF dan barcode duplikat.")}</li>
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" /> {t(`Prices are capped at ${CAP_PCT}% of face value.`, `Harga dibatasi maksimal ${CAP_PCT}% dari harga asli.`)}</li>
              </ul>
            </div>
            {/* Price stub: perforation + cream reads as ticket paper */}
            <div className="px-6 py-4 bg-secondary-cream-light border-t-2 border-dashed border-neutral-light-gray-1">
              <div className="text-xs text-secondary-brown-dark/80">{t("Starting from", "Harga mulai dari")}</div>
              <div className="font-fredoka font-bold text-2xl text-neutral-black">{formatIDR(event.fromPrice)}</div>
              <p className="text-xs text-secondary-brown-dark/70 mt-1">{t("Pick a listing to buy. Payment goes straight into escrow.", "Pilih listing untuk beli. Pembayaran langsung masuk escrow.")}</p>
            </div>
          </div>
          <NotifyCard event={event} />
        </aside>
      </div>
    </div>
  );
}
