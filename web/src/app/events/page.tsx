"use client";

import { Suspense, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Search, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SelectMenu } from "@/components/ui/select-menu";
import { getEvents, formatEventDate } from "@/lib/mock";
import { PageContainer } from "@/components/layout/PageContainer";

const events = getEvents();
const categories = ["Semua", ...Array.from(new Set(events.map((e) => e.category)))];
const cities = ["Semua kota", ...Array.from(new Set(events.map((e) => e.city)))];

function EventsInner() {
  // Deep-link dari home: ?q= (search) & ?cat= (kategori).
  const params = useSearchParams();
  const catParam = params.get("cat");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [cat, setCat] = useState(catParam && categories.includes(catParam) ? catParam : "Semua");
  const [city, setCity] = useState("Semua kota");

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        const matchCat = cat === "Semua" || e.category === cat;
        const matchCity = city === "Semua kota" || e.city === city;
        const q = query.toLowerCase().trim();
        const matchQ = !q || e.title.toLowerCase().includes(q) || e.city.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q);
        return matchCat && matchCity && matchQ;
      }),
    [query, cat, city]
  );

  return (
    <PageContainer width="wide">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-neutral-black">Jelajah event</h1>
        <p className="text-neutral-gray mt-2">Tiket resale terverifikasi, dijaga escrow sampai konser selesai.</p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 py-3 px-4 rounded-xl ring-1 ring-lummy-500 focus-within:ring-2 flex-1 max-w-md bg-neutral-white transition">
            <Search className="w-4 h-4 text-neutral-gray shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari event, artis, atau kota..."
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
              {c}
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
              price={e.fromPrice}
              redirect={`/events/${e.id}`}
              soldOut={e.soldOut}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center text-center py-16 gap-4">
          <Image src="/assets/images/mascot-confused.svg" alt="" width={120} height={120} />
          <p className="text-neutral-gray">Gak ada event yang cocok. Coba hapus filter atau kata kunci lain.</p>
        </div>
      )}
    </PageContainer>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="pt-28 pb-16 text-center text-neutral-gray">Memuat...</div>}>
      <EventsInner />
    </Suspense>
  );
}
