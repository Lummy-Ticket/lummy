import Link from "next/link";
import { ArrowRight, ShieldCheck, Music, Trophy, Drama } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroSearch } from "@/components/home/HeroSearch";
import { getEvents, getFeaturedEvents, formatEventDate } from "@/lib/mock";

const CATEGORY_TILES = [
  { cat: "Music", label: "Konser & Musik", Icon: Music, cls: "bg-secondary-pink-soft text-secondary-pink-dark" },
  { cat: "Sports", label: "Olahraga", Icon: Trophy, cls: "bg-secondary-orange-soft text-secondary-orange-dark" },
  { cat: "Theater", label: "Teater & Komedi", Icon: Drama, cls: "bg-secondary-green-soft text-secondary-green-dark" },
];

function EventGrid({ events }: { events: ReturnType<typeof getEvents> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {events.map((e) => (
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
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-end justify-between mb-6 gap-3">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-black">{title}</h2>
        <p className="text-neutral-gray mt-1 text-sm md:text-base">{subtitle}</p>
      </div>
      <Link href="/events" className="hidden sm:flex items-center gap-1 text-primary-navy font-medium hover:opacity-80 transition text-nowrap">
        Lihat semua <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

export default function Home() {
  const featured = getFeaturedEvents();
  const all = getEvents();
  const more = all.filter((e) => !e.featured);
  const quickCats = Array.from(new Set(all.map((e) => e.category)));

  return (
    <>
      {/* Hero: search-first */}
      <section className="bg-hero-gradient pt-32 pb-16">
        <div className="max-w-7xl mx-auto px-5 lg:px-10 flex flex-col items-center text-center gap-5">
          <h1 className="text-3xl md:text-5xl font-bold text-neutral-black leading-tight max-w-3xl">
            Tiket konser resale, <span className="text-primary-navy">aman lewat escrow.</span>
          </h1>
          <p className="text-neutral-gray max-w-xl">
            Dana kamu dikunci sampai konser selesai, AI jaga dari tiket palsu. Kerasa seperti aplikasi biasa.
          </p>
          <HeroSearch quickCats={quickCats} />
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-1 text-sm text-neutral-gray">
            {["Dana di-escrow", "AI anti-palsu", "Harga dibatasi 150%", "Bisa dicek on-chain"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-secondary-green-dark" /> {t}
              </span>
            ))}
          </div>
          <Link href="/how-it-works" className="text-primary-navy text-sm font-medium hover:opacity-80 transition">
            Lihat cara kerjanya →
          </Link>
        </div>
      </section>

      {/* Event populer */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
        <SectionHead title="Event populer" subtitle="Tiket resale terverifikasi, dijaga escrow." />
        <EventGrid events={featured} />
      </section>

      {/* Lagi ramai */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
        <SectionHead title="Lagi ramai" subtitle="Yang lagi banyak dicari belakangan ini." />
        <EventGrid events={more} />
      </section>

      {/* Kategori */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-black mb-6">Jelajah per kategori</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CATEGORY_TILES.map((t) => (
            <Link
              key={t.cat}
              href={`/events?cat=${t.cat}`}
              className="group flex items-center gap-4 bg-neutral-white rounded-3xl border border-neutral-light-gray-1 hover:border-lummy-500 shadow-lummy p-5 transition"
            >
              <span className={`w-14 h-14 rounded-2xl grid place-items-center shrink-0 ${t.cls}`}>
                <t.Icon className="w-7 h-7" />
              </span>
              <div className="min-w-0">
                <div className="font-fredoka font-semibold text-neutral-black">{t.label}</div>
                <div className="text-sm text-neutral-gray flex items-center gap-1 group-hover:text-primary-navy transition">
                  Lihat event <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Jual CTA */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16 mb-4">
        <div className="rounded-3xl bg-lummy-gradient text-white px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">Punya tiket nganggur?</h2>
            <p className="text-white/85 mt-1">Jual di OperTix. AI isi datanya otomatis, dana aman sampai konser lewat.</p>
          </div>
          <Link href="/sell">
            <Button.Secondary className="flex items-center gap-2 text-nowrap">
              Jual tiket <ArrowRight className="w-4 h-4" />
            </Button.Secondary>
          </Link>
        </div>
      </section>
    </>
  );
}
