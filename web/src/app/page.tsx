import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck, Music, Trophy, Drama } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroSearch } from "@/components/home/HeroSearch";
import { TicketBand } from "@/components/ui/ticket-band";
import { SubId } from "@/components/common/Bilingual";
import { getEvents, getFeaturedEvents, formatEventDate } from "@/lib/mock";

const CATEGORY_TILES = [
  { cat: "Music", label: "Concerts & music", Icon: Music },
  { cat: "Sports", label: "Sports", Icon: Trophy },
  { cat: "Theater", label: "Theatre & comedy", Icon: Drama },
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
        <SubId className="mt-1 text-sm md:text-base">{subtitle}</SubId>
      </div>
      <Link href="/events" className="hidden sm:flex items-center gap-1 text-primary-navy font-medium hover:opacity-80 transition text-nowrap">
        See all <ArrowRight className="w-4 h-4" />
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
      {/* Hero: search-first, asymmetric (copy left, mascot right) */}
      <section className="bg-hero-gradient pt-28 lg:pt-32 pb-16">
        <div className="max-w-7xl mx-auto px-5 lg:px-10 grid lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-6 items-center">
          {/* Left: headline + search */}
          <div className="flex flex-col gap-5 text-center lg:text-left">
            <h1 className="flex flex-col font-bold leading-[1.05] text-4xl sm:text-5xl xl:text-6xl">
              <span className="text-neutral-black">Buy resale tickets</span>
              <span className="text-primary-navy">without the fear.</span>
            </h1>
            <div className="max-w-lg mx-auto lg:mx-0">
              <p className="text-neutral-gray">
                Your money stays locked in escrow until the show is over. AI screens every ticket for forgery, and prices are capped so resale stays fair.
              </p>
              <SubId className="mt-1.5 text-sm">
                Dana ditahan sampai konser selesai, AI jaga dari tiket palsu, harga dibatasi.
              </SubId>
            </div>
            <HeroSearch quickCats={quickCats} />
            <div className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 text-sm text-neutral-gray">
              {["Escrowed until showtime", "AI forgery screening", "Price capped at 150%"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-secondary-green-dark" /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right: mascot only */}
          <div className="hidden lg:flex justify-center items-center">
            <Image src="/assets/images/mascot.png" alt="Lummy" width={360} height={360} className="object-contain drop-shadow-xl" priority />
          </div>
        </div>
      </section>

      {/* Popular */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
        <SectionHead title="Popular events" subtitle="Tiket resale terverifikasi, dijaga escrow." />
        <EventGrid events={featured} />
      </section>

      {/* Trending */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
        <SectionHead title="Trending now" subtitle="Yang lagi banyak dicari belakangan ini." />
        <EventGrid events={more} />
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
        <div className="mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-black">Browse by category</h2>
          <SubId className="mt-1 text-sm md:text-base">Pilih yang kamu cari.</SubId>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CATEGORY_TILES.map((t) => (
            <Link
              key={t.cat}
              href={`/events?cat=${t.cat}`}
              className="group flex items-center gap-4 bg-neutral-white rounded-3xl border-2 border-lummy-500 p-5 transition hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[4px_4px_0px_#245397]"
            >
              <span className="w-14 h-14 rounded-2xl grid place-items-center shrink-0 bg-secondary-blue-soft text-lummy-500">
                <t.Icon className="w-7 h-7" />
              </span>
              <div className="min-w-0">
                <div className="font-fredoka font-semibold text-neutral-black">{t.label}</div>
                <div className="text-sm text-neutral-gray flex items-center gap-1 group-hover:text-primary-navy transition">
                  See events <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Sell CTA */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16 mb-4">
        <TicketBand>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">Got a ticket you cannot use?</h2>
              <p className="text-white/85 mt-1">Sell it on Lummy. AI fills in the details, and the buyer&apos;s money is protected until the show is over.</p>
              <span lang="id" className="block text-white/70 text-sm mt-1">Gak jadi dateng? Jual lagi, jangan sampai hangus.</span>
            </div>
            <Link href="/sell">
              <Button.Secondary className="flex items-center gap-2 text-nowrap">
                Sell a ticket <ArrowRight className="w-4 h-4" />
              </Button.Secondary>
            </Link>
          </div>
        </TicketBand>
      </section>
    </>
  );
}
