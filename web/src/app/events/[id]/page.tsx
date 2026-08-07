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
  getEventById, getListingsByEvent, getTier, formatIDR, formatEventDate, CAP_PCT, type Listing, type EventItem,
} from "@/lib/mock";

function TrustBadges({ ai }: { ai: Listing["ai"] }) {
  if (ai.barcodeDuplicate)
    return <Badge.Base className="bg-secondary-pink-soft text-secondary-pink-dark text-xs flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" /> Barcode duplikat</Badge.Base>;
  if (ai.forgeryScore >= 60 || ai.pdfSuspicious)
    return <Badge.Base className="bg-secondary-orange-soft text-secondary-orange-dark text-xs flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" /> Perlu review (skor {ai.forgeryScore})</Badge.Base>;
  return <Badge.Base className="bg-secondary-green-soft text-secondary-green-dark text-xs flex items-center gap-1 w-fit"><ScanLine className="w-3 h-3" /> Terverifikasi AI</Badge.Base>;
}

function ListingRow({ event, listing, cheapest }: { event: EventItem; listing: Listing; cheapest?: boolean }) {
  const tier = getTier(event, listing.tierId);
  const cap = listing.faceValue * (CAP_PCT / 100);
  const markup = Math.round((listing.askPrice / listing.faceValue - 1) * 100);
  const withinCap = listing.askPrice <= cap;

  return (
    <div className={`bg-neutral-white rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${cheapest ? "border-lummy-500 ring-1 ring-lummy-500" : "border-neutral-light-gray-1"}`}>
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-fredoka font-semibold text-neutral-black">{tier?.name}</span>
          {cheapest && <Badge.Base className="bg-secondary-green-soft text-secondary-green-dark text-xs font-medium">Termurah</Badge.Base>}
          <TrustBadges ai={listing.ai} />
          {listing.gateKtp && <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-xs">Gate cek KTP</Badge.Base>}
        </div>
        <span className="text-xs text-neutral-gray">Penjual: {listing.sellerName} · Harga asli {formatIDR(listing.faceValue)}</span>
        <span className={`text-xs flex items-center gap-1 ${withinCap ? "text-secondary-green-dark" : "text-secondary-pink-dark"}`}>
          <CheckCircle2 className="w-3 h-3" /> Markup {markup}% · batas cap {formatIDR(cap)}
        </span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="font-fredoka font-bold text-lg text-lummy-500 text-nowrap">{formatIDR(listing.askPrice)}</span>
        {listing.ai.barcodeDuplicate ? (
          <Button.Primary className="text-sm" disabled>Barcode duplikat</Button.Primary>
        ) : (
          <Link href={`/checkout?listing=${listing.id}`}>
            <Button.Primary className="text-sm">Beli</Button.Primary>
          </Link>
        )}
      </div>
    </div>
  );
}

const SORTS = [
  { id: "cheap", label: "Termurah" },
  { id: "new", label: "Terbaru" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const event = getEventById(params.id);
  const [sort, setSort] = useState<SortId>("cheap");

  if (!event) {
    return (
      <div className="max-w-4xl mx-auto px-5 lg:px-10 pt-28 pb-16 text-center flex flex-col items-center gap-4">
        <Image src="/assets/images/mascot-confused.svg" alt="" width={120} height={120} />
        <p className="text-neutral-gray">Event gak ketemu.</p>
        <Link href="/events"><Button.Secondary>Balik ke jelajah</Button.Secondary></Link>
      </div>
    );
  }

  const listings = getListingsByEvent(event.id);
  const sortedListings = useMemo(() => {
    const arr = [...listings];
    // Termurah dulu = default ala Viagogo (langsung nangkep harga terbaik).
    if (sort === "cheap") arr.sort((a, b) => a.askPrice - b.askPrice);
    return arr;
  }, [listings, sort]);
  const cheapest = listings.length ? Math.min(...listings.map((l) => l.askPrice)) : 0;

  return (
    <div className="pt-28 pb-16">
      {/* Cover */}
      <div className="max-w-6xl mx-auto px-5 lg:px-10">
        <Link href="/events" className="inline-flex items-center gap-1 text-neutral-gray hover:text-primary-navy transition text-sm mb-4">
          <ArrowLeft className="w-4 h-4" /> Jelajah
        </Link>
        <div className="relative w-full aspect-[21/9] rounded-3xl overflow-hidden border border-lummy-500">
          <Image src={event.image} alt={event.title} fill className="object-cover" priority />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 lg:px-10 mt-6 grid lg:grid-cols-[1.6fr_1fr] gap-8">
        {/* Main */}
        <div>
          <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-sm w-fit">{event.category}</Badge.Base>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-black mt-3">{event.title}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-neutral-gray">
            <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary-navy" /> {formatEventDate(event.dateISO)}</span>
            <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary-navy" /> {event.venue}, {event.city}</span>
          </div>

          <div className="flex items-center justify-between mt-10 mb-4 gap-3 flex-wrap">
            <h3 className="font-fredoka font-semibold text-xl text-neutral-black">
              Tiket resale tersedia <span className="text-neutral-gray font-normal text-base">({listings.length})</span>
            </h3>
            {listings.length > 1 && (
              <div className="flex items-center gap-1 bg-secondary-gray-soft rounded-full p-1">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSort(s.id)}
                    className={`px-3 py-1.5 rounded-full text-sm transition cursor-pointer ${
                      sort === s.id ? "bg-neutral-white text-primary-navy font-medium shadow-sm" : "text-neutral-gray"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {sortedListings.length > 0 ? (
              sortedListings.map((l) => (
                <ListingRow key={l.id} event={event} listing={l} cheapest={l.askPrice === cheapest} />
              ))
            ) : (
              <p className="text-neutral-gray text-sm">Belum ada listing. Jadi yang pertama jual di sini.</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 h-fit flex flex-col gap-4">
          <div className="bg-neutral-white rounded-3xl border border-lummy-500 shadow-lummy p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-lummy-500 font-fredoka font-semibold">
              <Lock className="w-5 h-5" /> Dilindungi escrow
            </div>
            <ul className="flex flex-col gap-3 text-sm text-neutral-gray">
              <li className="flex gap-2"><ShieldCheck className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> Dana ditahan sampai konser selesai. Gagal masuk = uang balik.</li>
              <li className="flex gap-2"><ScanLine className="w-4 h-4 text-secondary-pink-dark shrink-0 mt-0.5" /> Tiap tiket dicek AI: forensik PDF + barcode duplikat.</li>
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" /> Harga dibatasi maksimal {CAP_PCT}% dari harga asli.</li>
            </ul>
          </div>
          <div className="bg-secondary-cream-light rounded-3xl border border-neutral-light-gray-1 p-6">
            <div className="text-xs text-neutral-gray mb-1">Harga mulai dari</div>
            <div className="font-fredoka font-bold text-2xl text-neutral-black">{formatIDR(event.fromPrice)}</div>
            <p className="text-xs text-neutral-gray mt-2">Pilih listing di sebelah untuk beli. Dana langsung masuk escrow.</p>
          </div>
          <NotifyCard event={event} />
        </aside>
      </div>
    </div>
  );
}
