"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Search, TrendingUp } from "lucide-react";
import {
  getEvents,
} from "@/lib/mock";
import { useT, useFormatters, useCategoryLabel } from "@/lib/i18n";

const ALL = getEvents();
const POPULAR = ALL.filter((e) => e.featured).slice(0, 5);

// Search-first hero. Focus shows what is trending, typing filters live. Each row
// carries a thumbnail so people can jump straight to an event without a detour.
export function HeroSearch({ quickCats }: { quickCats: string[] }) {
  const t = useT();
  const { formatEventDate } = useFormatters();
  const categoryLabel = useCategoryLabel();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const query = q.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return POPULAR;
    return ALL.filter(
      (e) =>
        e.title.toLowerCase().includes(query) ||
        e.city.toLowerCase().includes(query) ||
        e.venue.toLowerCase().includes(query)
    ).slice(0, 6);
  }, [query]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(q.trim() ? `/events?q=${encodeURIComponent(q.trim())}` : "/events");
  };

  return (
    <div ref={ref} className="w-full max-w-xl mx-auto lg:mx-0 flex flex-col gap-3">
      <div className="relative">
        <form onSubmit={submit} className="flex items-center gap-2 bg-neutral-white rounded-2xl border-2 border-lummy-500 p-2 pl-4 shadow-lummy">
          <Search className="w-5 h-5 text-neutral-gray shrink-0" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={t("Search artist, event or city", "Cari artis, event, atau kota")}
            aria-label={t("Search events", "Cari event")}
            className="flex-1 outline-none bg-transparent text-neutral-black placeholder:text-neutral-gray min-w-0"
          />
          <button type="submit" className="shrink-0 bg-primary-navy hover:bg-primary-navy-dark text-white font-fredoka font-medium rounded-xl px-5 py-2.5 text-sm transition cursor-pointer">
            {t("Search", "Cari")}
          </button>
        </form>

        {open && (suggestions.length > 0 || query) && (
          <div className="absolute top-full left-0 right-0 mt-2 z-40 rounded-2xl border-2 border-lummy-500 bg-neutral-white shadow-lummy-lg overflow-hidden text-left animate-fade-in">
            <div className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-neutral-gray border-b border-neutral-light-gray-1">
              <TrendingUp className="w-3.5 h-3.5 text-lummy-500" /> {query ? t("Search results", "Hasil pencarian") : t("Popular right now", "Lagi banyak dicari")}
            </div>
            {suggestions.length === 0 && (
              <p className="px-4 py-4 text-sm text-neutral-gray">
                {t(`Nothing on sale for "${q.trim()}" yet.`, `Belum ada yang dijual untuk "${q.trim()}".`)}
              </p>
            )}
            {suggestions.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary-blue-light transition"
              >
                <div className="relative w-11 h-11 rounded-lg overflow-hidden border border-neutral-light-gray-1 shrink-0">
                  <Image src={e.image} alt="" fill sizes="44px" className="object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-black truncate">{e.title}</div>
                  <div className="text-xs text-neutral-gray truncate">{e.city} · {formatEventDate(e.dateISO)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center lg:justify-start gap-2">
        <Link href="/events" className="px-3 sm:px-4 py-1.5 rounded-full text-sm bg-neutral-white/70 border border-lummy-500 text-lummy-500 hover:bg-neutral-white transition">
          {t("All events", "Semua event")}
        </Link>
        {quickCats.map((c) => (
          <Link
            key={c}
            href={`/events?cat=${encodeURIComponent(c)}`}
            className="px-3 sm:px-4 py-1.5 rounded-full text-sm bg-neutral-white/70 border border-lummy-500 text-lummy-500 hover:bg-neutral-white transition"
          >
            {categoryLabel(c)}
          </Link>
        ))}
      </div>
    </div>
  );
}
