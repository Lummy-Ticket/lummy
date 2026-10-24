"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Search, TrendingUp } from "lucide-react";
import { useEventSuggestions } from "@/lib/useEventSuggestions";
import { useT, useFormatters, useCategoryLabel } from "@/lib/i18n";

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
  const { query, suggestions } = useEventSuggestions(q);

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(q.trim() ? `/events?q=${encodeURIComponent(q.trim())}` : "/events");
  };

  return (
    <div ref={ref} data-hero-search className="w-full max-w-2xl flex flex-col gap-3">
      <div className="relative">
        <form onSubmit={submit} className="flex items-center gap-2 bg-neutral-white rounded-2xl border-2 border-lummy-500 p-2 pl-4 shadow-lummy transition-shadow duration-300 focus-within:shadow-[0_0_0_4px_rgba(177,231,255,0.7)]">
          <Search className="w-5 h-5 text-neutral-gray shrink-0" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={t("Artist, event or city", "Artis, event, atau kota")}
            aria-label={t("Search events", "Cari event")}
            className="flex-1 outline-none bg-transparent text-neutral-black placeholder:text-neutral-gray min-w-0"
          />
          <button type="submit" className="shrink-0 bg-primary-navy hover:bg-primary-navy-dark active:scale-95 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition cursor-pointer">
            {t("Search", "Cari")}
          </button>
        </form>

        {open && (suggestions.length > 0 || query) && (
          <div className="absolute top-full left-0 right-0 mt-2 z-40 rounded-2xl border-2 border-lummy-500 bg-neutral-white shadow-lummy-lg overflow-hidden text-left lm-pop">
            <div className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-neutral-gray border-b border-neutral-light-gray-1">
              <TrendingUp className="w-3.5 h-3.5 text-lummy-500" /> {query ? t("Search results", "Hasil pencarian") : t("Popular right now", "Lagi banyak dicari")}
            </div>
            {suggestions.length === 0 && (
              <div className="px-4 py-4 text-sm">
                <p className="text-sm text-neutral-gray">
                  {t(`Nothing on sale for "${q.trim()}" yet.`, `Belum ada yang dijual untuk "${q.trim()}".`)}
                </p>
                <Link href="/events" onClick={() => setOpen(false)} className="mt-1 inline-block font-medium text-primary-navy hover:underline">
                  {t("See all events", "Lihat semua event")}
                </Link>
              </div>
            )}
            {suggestions.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                onClick={() => setOpen(false)}
                className="group flex items-center gap-3 px-3 py-2.5 hover:bg-secondary-blue-light transition-colors"
              >
                <div className="relative w-11 h-11 rounded-lg overflow-hidden border border-neutral-light-gray-1 shrink-0">
                  <Image src={e.image} alt="" fill sizes="44px" className="object-cover transition-transform duration-500 group-hover:scale-110" />
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

      <div className="flex flex-wrap gap-2">
        <Link href="/events" className="hidden sm:inline-block px-4 py-1.5 rounded-full text-sm bg-neutral-white/70 border border-lummy-500 text-lummy-500 hover:bg-neutral-white hover:-translate-y-0.5 active:translate-y-0 transition">
          {t("All events", "Semua event")}
        </Link>
        {quickCats.map((c) => (
          <Link
            key={c}
            href={`/events?cat=${encodeURIComponent(c)}`}
            className="px-3 sm:px-4 py-1.5 rounded-full text-sm bg-neutral-white/70 border border-lummy-500 text-lummy-500 hover:bg-neutral-white hover:-translate-y-0.5 active:translate-y-0 transition"
          >
            {categoryLabel(c)}
          </Link>
        ))}
      </div>
    </div>
  );
}
