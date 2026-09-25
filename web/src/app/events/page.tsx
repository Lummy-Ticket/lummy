"use client";

import type React from "react";
import { Suspense, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Search, MapPin, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { PriceFilter } from "@/components/events/PriceFilter";
import type { EventItem } from "@/lib/mock";
import { useCatalogue } from "@/lib/catalogue";
import { PageContainer } from "@/components/layout/PageContainer";
import { useT, useFormatters, useCategoryLabel } from "@/lib/i18n";

const ALL_CITIES = "All cities";
const STEP = 100_000;

// Derived from what is on sale, never held at module load: the catalogue changes with the
// date and with every new listing.
function catalogueView(onSale: EventItem[]) {
  // Soonest first, the way people plan.
  const events = [...onSale].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  // Round the bounds outward so the handles land on tidy numbers. An event with nothing
  // on sale has no price (0), so it does not drag the lower bound down.
  const priced = events.map((e) => e.fromPrice).filter((p) => p > 0);
  return {
    events,
    categories: ["All", ...Array.from(new Set(events.map((e) => e.category)))],
    cities: [ALL_CITIES, ...Array.from(new Set(events.map((e) => e.city)))],
    PRICE_MIN: priced.length ? Math.floor(Math.min(...priced) / STEP) * STEP : 0,
    PRICE_MAX: priced.length ? Math.ceil(Math.max(...priced) / STEP) * STEP : STEP,
  };
}

function EventsInner() {
  const { events: onSale } = useCatalogue();
  const { events, categories, cities, PRICE_MIN, PRICE_MAX } = useMemo(() => catalogueView(onSale), [onSale]);
  const t = useT();
  const { formatEventDate } = useFormatters();
  const categoryLabel = useCategoryLabel();
  // Deep links from home: ?q= (search) and ?cat= (category).
  const params = useSearchParams();
  const catParam = params.get("cat");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [cat, setCat] = useState(catParam && categories.includes(catParam) ? catParam : "All");
  const [city, setCity] = useState(ALL_CITIES);
  const [price, setPrice] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);

  // Every filter except the category, so each chip can say how many it would show.
  const base = useMemo(() => {
    const q = query.toLowerCase().trim();
    return events.filter((e) => {
      const matchCity = city === ALL_CITIES || e.city === city;
      const matchQ = !q || e.title.toLowerCase().includes(q) || e.city.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q);
      // With the full range selected, events with nothing on sale stay visible too.
      const fullRange = price[0] <= PRICE_MIN && price[1] >= PRICE_MAX;
      const matchPrice = fullRange || (e.fromPrice >= price[0] && e.fromPrice <= price[1]);
      return matchCity && matchQ && matchPrice;
    });
  }, [events, PRICE_MIN, PRICE_MAX, query, city, price]);
  const filtered = cat === "All" ? base : base.filter((e) => e.category === cat);
  const countOf = (c: string) => base.filter((e) => e.category === c).length;

  const filtering = query.trim() !== "" || cat !== "All" || city !== ALL_CITIES || price[0] > PRICE_MIN || price[1] < PRICE_MAX;
  const clearAll = () => {
    setQuery("");
    setCat("All");
    setCity(ALL_CITIES);
    setPrice([PRICE_MIN, PRICE_MAX]);
  };
  const noun = events.length === 1 ? "event" : "events";
  const summary = filtering
    ? t(`${filtered.length} of ${events.length} ${noun}`, `${filtered.length} dari ${events.length} event`)
    : t(`${events.length} ${noun}`, `${events.length} event`);

  return (
    <PageContainer width="wide">
      <div className="mb-6">
        <h1 className="text-3xl md:text-4xl font-bold text-neutral-black">{t("Browse events", "Jelajah event")}</h1>
        <p className="text-neutral-gray mt-2">{t("Every ticket here is checked before it goes on sale.", "Semua tiket di sini dicek sebelum dijual.")}</p>
      </div>

      {/* Toolbar: search takes the free width, city and price sit beside it as equal dropdowns */}
      <div className="grid grid-cols-2 gap-3 md:flex">
        <div className="col-span-2 md:flex-1 h-12 flex items-center gap-2 pl-4 pr-2 rounded-xl border border-lummy-500 bg-neutral-white focus-within:ring-1 focus-within:ring-lummy-500 transition">
          <Search className="w-4 h-4 text-neutral-gray shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search events, artists, or cities...", "Cari event, artis, atau kota...")}
            aria-label={t("Search events", "Cari event")}
            className="h-full w-full min-w-0 outline-none text-neutral-black placeholder:text-neutral-gray bg-transparent text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("Clear search", "Hapus pencarian")}
              className="shrink-0 p-1.5 rounded-lg text-neutral-gray hover:text-neutral-black hover:bg-secondary-blue-light transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <SelectMenu
          value={city}
          options={cities}
          onChange={setCity}
          label={(c) => (c === ALL_CITIES ? t("All cities", "Semua kota") : c)}
          active={city !== ALL_CITIES}
          icon={<MapPin className="w-4 h-4 text-neutral-gray shrink-0" />}
          className="md:w-52"
        />
        <PriceFilter min={PRICE_MIN} max={PRICE_MAX} step={STEP} value={price} onChange={setPrice} className="md:w-56" />
      </div>

      {/* Categories on the left, result count and reset on the right */}
      <div className="flex flex-col gap-3 mt-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 py-1 -my-1 md:m-0 md:p-0 md:flex-wrap md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((c) => {
            const on = cat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                aria-pressed={on}
                className={cn(
                  "shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm border transition cursor-pointer active:scale-95",
                  on
                    ? "bg-primary-navy text-white border-primary-navy"
                    : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1 hover:border-primary-navy"
                )}
              >
                {c === "All" ? t("All", "Semua") : categoryLabel(c)}
                {c !== "All" && (
                  <span className={cn("text-xs rounded-full px-1.5", on ? "bg-white/20" : "bg-secondary-blue-soft text-lummy-500")}>
                    {countOf(c)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-4 text-sm md:justify-end">
          <span className="text-neutral-gray" aria-live="polite">{summary}</span>
          {filtering && (
            <button type="button" onClick={clearAll} className="flex items-center gap-1.5 font-medium text-lummy-500 hover:underline cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" /> {t("Clear filters", "Hapus filter")}
            </button>
          )}
        </div>
      </div>

      {filtered.length > 0 ? (
        // CSS entrance, not data-reveal: the first cards are rendered on the server and on screen
        // at load, so they must not wait for hydration (about 0.45s on a slow phone). Cards a
        // filter brings in later rise the same way, since the animation runs on insertion.
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((e, i) => (
            <Card.Event
              key={e.id}
              className="lm-in"
              style={{ "--i": Math.min(i, 7) } as React.CSSProperties}
              eager={i < 3}
              image={e.image}
              date={formatEventDate(e.dateISO)}
              title={e.title}
              location={`${e.venue}, ${e.city}`}
              category={e.category}
              redirect={`/events/${e.id}`}
              soldOut={e.soldOut}
              fromPrice={e.fromPrice}
              listingCount={e.listingCount}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center text-center py-16 gap-4">
          <Image src="/assets/images/mascot-confused.svg" alt="" width={120} height={120} />
          <p className="text-neutral-gray">{t("Nothing matches. Try clearing a filter or a different keyword.", "Tidak ada yang cocok. Coba hapus filter atau pakai kata kunci lain.")}</p>
          <Button.Secondary onClick={clearAll}>{t("Clear filters", "Hapus filter")}</Button.Secondary>
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
