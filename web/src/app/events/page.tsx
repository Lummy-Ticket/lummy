"use client";

import { Suspense, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Search, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SelectMenu } from "@/components/ui/select-menu";
import { DualRangeSlider } from "@/components/ui/dual-range-slider";
import {
  getEvents,
} from "@/lib/mock";
import { PageContainer } from "@/components/layout/PageContainer";
import { useT, useFormatters, useCategoryLabel } from "@/lib/i18n";

const events = getEvents();
const categories = ["All", ...Array.from(new Set(events.map((e) => e.category)))];
const cities = ["All cities", ...Array.from(new Set(events.map((e) => e.city)))];

// Round the bounds outward so the handles land on tidy numbers.
const STEP = 100_000;
const PRICE_MIN = Math.floor(Math.min(...events.map((e) => e.fromPrice)) / STEP) * STEP;
const PRICE_MAX = Math.ceil(Math.max(...events.map((e) => e.fromPrice)) / STEP) * STEP;

function EventsInner() {
  const t = useT();
  const { formatEventDate, formatIDR } = useFormatters();
  const categoryLabel = useCategoryLabel();
  // Deep links from home: ?q= (search) and ?cat= (category).
  const params = useSearchParams();
  const catParam = params.get("cat");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [cat, setCat] = useState(catParam && categories.includes(catParam) ? catParam : "All");
  const [city, setCity] = useState("All cities");
  const [price, setPrice] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        const matchCat = cat === "All" || e.category === cat;
        const matchCity = city === "All cities" || e.city === city;
        const q = query.toLowerCase().trim();
        const matchQ = !q || e.title.toLowerCase().includes(q) || e.city.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q);
        const matchPrice = e.fromPrice >= price[0] && e.fromPrice <= price[1];
        return matchCat && matchCity && matchQ && matchPrice;
      }),
    [query, cat, city, price]
  );

  return (
    <PageContainer width="wide">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-neutral-black">{t("Browse events", "Jelajah event")}</h1>
        <p className="text-neutral-gray mt-2">{t("Verified resale tickets, held in escrow until the show is over.", "Tiket resale terverifikasi, dijaga escrow sampai konser selesai.")}</p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 py-3 px-4 rounded-xl ring-1 ring-lummy-500 focus-within:ring-2 flex-1 max-w-md bg-neutral-white transition">
            <Search className="w-4 h-4 text-neutral-gray shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search events, artists, or cities...", "Cari event, artis, atau kota...")}
              className="outline-none w-full text-neutral-black placeholder:text-neutral-gray bg-transparent text-sm"
            />
          </div>
          <SelectMenu
            value={city}
            options={cities}
            onChange={setCity}
            icon={<MapPin className="w-4 h-4 text-neutral-gray shrink-0" />}
            className="sm:w-52"
          />
        </div>
        <div className="max-w-md">
          <div className="flex items-center justify-between text-xs text-neutral-gray mb-2">
            <span>{t("Price from", "Harga mulai")}</span>
            <span className="font-medium text-neutral-black">
              {formatIDR(price[0])} - {formatIDR(price[1])}
            </span>
          </div>
          <DualRangeSlider
            min={PRICE_MIN}
            max={PRICE_MAX}
            step={STEP}
            valueMin={price[0]}
            valueMax={price[1]}
            onChange={(lo, hi) => setPrice([lo, hi])}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "px-4 py-2 rounded-full text-sm border transition cursor-pointer",
                cat === c
                  ? "bg-primary-navy text-white border-primary-navy"
                  : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1 hover:border-primary-navy"
              )}
            >
              {c === "All" ? t("All", "Semua") : categoryLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((e) => (
            <Card.Event
              key={e.id}
              image={e.image}
              date={formatEventDate(e.dateISO)}
              title={e.title}
              location={`${e.venue}, ${e.city}`}
              category={e.category}
                  redirect={`/events/${e.id}`}
              soldOut={e.soldOut}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center text-center py-16 gap-4">
          <Image src="/assets/images/mascot-confused.svg" alt="" width={120} height={120} />
          <p className="text-neutral-gray">{t("Nothing matches. Try clearing a filter or a different keyword.", "Tidak ada yang cocok. Coba hapus filter atau pakai kata kunci lain.")}</p>
        </div>
      )}
    </PageContainer>
  );
}

export default function EventsPage() {
  const t = useT();
  return (
    <Suspense fallback={<div className="pt-28 pb-16 text-center text-neutral-gray">{t("Loading...", "Memuat...")}</div>}>
      <EventsInner />
    </Suspense>
  );
}
