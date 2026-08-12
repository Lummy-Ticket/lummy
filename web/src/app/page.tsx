import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck, Lock, Music, Trophy, Drama } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroSearch } from "@/components/home/HeroSearch";
import { HeroBlobs } from "@/components/home/HeroBlobs";
import { getEvents, getFeaturedEvents, formatEventDate, formatIDR } from "@/lib/mock";

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
      {/* Hero: search-first, tapi asimetris + dekorasi ala Lummy biar gak template */}
      <section className="relative overflow-hidden bg-hero-gradient pt-28 lg:pt-32 pb-16">
        <HeroBlobs />
        <div className="relative z-10 max-w-7xl mx-auto px-5 lg:px-10 grid lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-6 items-center">
          {/* Kiri: headline + search */}
          <div className="flex flex-col gap-5 text-center lg:text-left">
            <span className="mx-auto lg:mx-0 w-fit bg-secondary-blue-soft text-lummy-500 text-sm font-medium rounded-full px-3 py-1">
              Escrow + AI, tanpa ribet crypto
            </span>
            <h1 className="flex flex-col font-bold leading-[1.05] text-4xl sm:text-5xl xl:text-6xl">
              <span className="text-neutral-black">Beli tiket konser</span>
              <span className="text-primary-navy">tanpa takut ketipu.</span>
            </h1>
            <p className="text-neutral-gray max-w-lg mx-auto lg:mx-0">
              Uang kamu ditahan dulu, baru cair ke penjual setelah konser aman. AI jaga dari tiket palsu. Kerasa seperti aplikasi biasa.
            </p>
            <HeroSearch quickCats={quickCats} />
            <div className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 text-sm text-neutral-gray">
              {["Uang aman sampai konser", "AI anti-palsu", "Harga wajar (maks 150%)"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-secondary-green-dark" /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Kanan: mascot + sticker "Dana terkunci" (overlap + hard shadow) */}
          <div className="relative hidden lg:flex justify-center items-center">
            <Image src="/assets/images/mascot.png" alt="OperTix" width={340} height={340} className="object-contain drop-shadow-xl" priority />
            <div className="absolute bottom-6 -left-2 w-60 bg-neutral-white rounded-2xl border-2 border-lummy-500 shadow-[4px_4px_0px_#245397] p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-neutral-gray flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-lummy-500" /> Dana kamu</span>
                <span className="bg-secondary-blue-soft text-lummy-500 text-[10px] font-semibold rounded px-1.5 py-0.5">TERKUNCI</span>
              </div>
              <div className="font-fredoka font-bold text-xl text-neutral-black">{formatIDR(2_800_000)}</div>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-secondary-green-dark">
                <ShieldCheck className="w-3.5 h-3.5" /> Cair ke penjual pas konser aman
              </div>
            </div>
          </div>
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
