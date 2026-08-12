"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";

// Search-first hero ala Viagogo: langsung arahin ke katalog /events (deep-link ?q / ?cat).
export function HeroSearch({ quickCats }: { quickCats: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/events?q=${encodeURIComponent(query)}` : "/events");
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
      <form onSubmit={submit} className="flex items-center gap-2 bg-neutral-white rounded-2xl border-2 border-lummy-500 p-2 pl-4 shadow-lummy">
        <Search className="w-5 h-5 text-neutral-gray shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari event, artis, atau venue..."
          aria-label="Cari event"
          className="flex-1 outline-none bg-transparent text-neutral-black placeholder:text-neutral-gray min-w-0"
        />
        <button type="submit" className="shrink-0 bg-primary-navy hover:bg-primary-navy-dark text-white font-fredoka font-medium rounded-xl px-5 py-2.5 text-sm transition cursor-pointer">
          Cari
        </button>
      </form>

      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/events" className="px-4 py-1.5 rounded-full text-sm bg-neutral-white/70 border border-lummy-500 text-lummy-500 hover:bg-neutral-white transition">
          Semua event
        </Link>
        {quickCats.map((c) => (
          <Link
            key={c}
            href={`/events?cat=${encodeURIComponent(c)}`}
            className="px-4 py-1.5 rounded-full text-sm bg-neutral-white/70 border border-lummy-500 text-lummy-500 hover:bg-neutral-white transition"
          >
            {c}
          </Link>
        ))}
      </div>
    </div>
  );
}
