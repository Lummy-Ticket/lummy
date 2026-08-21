"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck, Music, Trophy, Drama } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroSearch } from "@/components/home/HeroSearch";
import { TicketBand } from "@/components/ui/ticket-band";
import { useT, useFormatters } from "@/lib/i18n";
import {
  getEvents, getFeaturedEvents,
} from "@/lib/mock";

const CATEGORY_TILES = [
  { cat: "Music", en: "Concerts & music", id: "Konser & musik", Icon: Music },
  { cat: "Sports", en: "Sports", id: "Olahraga", Icon: Trophy },
  { cat: "Theater", en: "Theatre & comedy", id: "Teater & komedi", Icon: Drama },
];

function EventGrid({ events }: { events: ReturnType<typeof getEvents> }) {
  const { formatEventDate } = useFormatters();
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
  const t = useT();
  return (
    <div className="flex items-end justify-between mb-6 gap-3">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-black">{title}</h2>
        <p className="text-neutral-gray mt-1 text-sm md:text-base">{subtitle}</p>
      </div>
      <Link href="/events" className="hidden sm:flex items-center gap-1 text-primary-navy font-medium hover:opacity-80 transition text-nowrap">
        {t("See all", "Lihat semua")} <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

export default function Home() {
  const t = useT();
  const featured = getFeaturedEvents();
  const all = getEvents();
  const more = all.filter((e) => !e.featured);
  const quickCats = Array.from(new Set(all.map((e) => e.category)));

  return (
    <>
      {/* Hero: search-first, asymmetric (copy left, mascot right) */}
      <section className="bg-hero-gradient pt-28 lg:pt-32 pb-16">
        <div className="max-w-7xl mx-auto px-5 lg:px-10 grid lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-6 items-center">
          <div className="flex flex-col gap-5 text-center lg:text-left">
            <h1 className="flex flex-col font-bold leading-[1.05] text-4xl sm:text-5xl xl:text-6xl">
              <span className="text-neutral-black">{t("Buy resale tickets", "Beli tiket resale")}</span>
              <span className="text-primary-navy">{t("without the fear.", "tanpa takut ketipu.")}</span>
            </h1>
            <p className="text-neutral-gray max-w-lg mx-auto lg:mx-0">
              {t(
                "Your money stays locked in escrow until the show is over. AI screens every ticket for forgery, and prices are capped so resale stays fair.",
                "Uangmu dikunci di escrow sampai konser selesai. AI memeriksa tiap tiket dari pemalsuan, dan harga dibatasi supaya resale tetap wajar."
              )}
            </p>
            <HeroSearch quickCats={quickCats} />
            <div className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 text-sm text-neutral-gray">
              {[
                t("Escrowed until showtime", "Dana aman sampai konser"),
                t("AI forgery screening", "AI anti tiket palsu"),
                t("Price capped at 150%", "Harga dibatasi 150%"),
              ].map((label) => (
                <span key={label} className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-secondary-green-dark" /> {label}
                </span>
              ))}
            </div>
          </div>

          <div className="hidden lg:flex justify-center items-center">
            <Image src="/assets/images/mascot.png" alt="Lummy" width={360} height={360} className="object-contain drop-shadow-xl" priority />
          </div>
        </div>
      </section>

      {/* Popular */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
        <SectionHead
          title={t("Popular events", "Event populer")}
          subtitle={t("Verified resale tickets, all held in escrow.", "Tiket resale terverifikasi, semuanya dijaga escrow.")}
        />
        <EventGrid events={featured} />
      </section>

      {/* Trending */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
        <SectionHead
          title={t("Trending now", "Lagi ramai")}
          subtitle={t("What people have been hunting for lately.", "Yang lagi banyak dicari belakangan ini.")}
        />
        <EventGrid events={more} />
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
        <div className="mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Browse by category", "Jelajah per kategori")}</h2>
          <p className="text-neutral-gray mt-1 text-sm md:text-base">{t("Pick what you are after.", "Pilih yang kamu cari.")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CATEGORY_TILES.map((tile) => (
            <Link
              key={tile.cat}
              href={`/events?cat=${tile.cat}`}
              className="group flex items-center gap-4 bg-neutral-white rounded-3xl border-2 border-lummy-500 p-5 transition hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[4px_4px_0px_#245397]"
            >
              <span className="w-14 h-14 rounded-2xl grid place-items-center shrink-0 bg-secondary-blue-soft text-lummy-500">
                <tile.Icon className="w-7 h-7" />
              </span>
              <div className="min-w-0">
                <div className="font-fredoka font-semibold text-neutral-black">{t(tile.en, tile.id)}</div>
                <div className="text-sm text-neutral-gray flex items-center gap-1 group-hover:text-primary-navy transition">
                  {t("See events", "Lihat event")} <ArrowRight className="w-3.5 h-3.5" />
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
              <h2 className="text-2xl md:text-3xl font-bold">{t("Got a ticket you cannot use?", "Punya tiket yang gak kepakai?")}</h2>
              <p className="text-white/85 mt-1">
                {t(
                  "Sell it on Lummy. AI fills in the details, and the buyer's money is protected until the show is over.",
                  "Jual di Lummy. AI mengisi datanya otomatis, dan dana pembeli dijaga sampai konser selesai."
                )}
              </p>
            </div>
            <Link href="/sell">
              <Button.Secondary className="flex items-center gap-2 text-nowrap">
                {t("Sell a ticket", "Jual tiket")} <ArrowRight className="w-4 h-4" />
              </Button.Secondary>
            </Link>
          </div>
        </TicketBand>
      </section>
    </>
  );
}
