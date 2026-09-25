"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronRight, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Hero } from "@/components/home/Hero";
import { TicketBand } from "@/components/ui/ticket-band";
import { useT, useFormatters, useActiveLang, EVENT_TZ } from "@/lib/i18n";
import type { EventItem } from "@/lib/mock";
import { useCatalogue } from "@/lib/catalogue";

function SectionHead({ title, href }: { title: string; href?: string }) {
  const t = useT();
  return (
    <div data-reveal className="flex items-end justify-between mb-6 gap-3">
      <h2 className="text-2xl md:text-3xl font-bold text-neutral-black">{title}</h2>
      {href && (
        <Link href={href} className="group flex items-center gap-1 text-sm font-medium text-primary-navy text-nowrap">
          <span className="lm-underline">{t("See all", "Lihat semua")}</span> <ArrowRight className="w-4 h-4 transition group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

// A gig guide rather than a second grid of cards: date first, the way people scan listings.
function ComingUp({ events }: { events: EventItem[] }) {
  const t = useT();
  const lang = useActiveLang();
  const { formatIDR } = useFormatters();
  const locale = lang === "id" ? "id-ID" : "en-GB";
  return (
    <ul data-reveal="stagger" className="rounded-3xl border border-primary-navy bg-neutral-white divide-y divide-dashed divide-neutral-light-gray-1 overflow-hidden">
      {events.map((e) => {
        const d = new Date(e.dateISO);
        return (
          <li key={e.id}>
            <Link href={`/events/${e.id}`} className="group flex items-center gap-4 px-4 sm:px-5 py-3.5 hover:bg-secondary-blue-light active:bg-secondary-blue-soft transition-colors">
              <div className="w-12 shrink-0 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-navy">{d.toLocaleDateString(locale, { month: "short", timeZone: EVENT_TZ })}</div>
                <div className="font-fredoka font-bold text-2xl text-neutral-black leading-none mt-0.5">{d.toLocaleDateString(locale, { day: "2-digit", timeZone: EVENT_TZ })}</div>
              </div>
              <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-lummy-500 shrink-0 hidden sm:block">
                <Image src={e.image} alt="" fill sizes="56px" className="object-cover transition-transform duration-500 group-hover:scale-110" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-fredoka font-semibold text-neutral-black truncate">{e.title}</div>
                <div className="text-sm text-neutral-gray truncate">{e.venue}, {e.city}</div>
              </div>
              {e.fromPrice > 0 && (
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-[11px] text-neutral-gray leading-none">{t("From", "Mulai")}</div>
                  <div className="font-fredoka font-bold text-primary-navy mt-1">{formatIDR(e.fromPrice)}</div>
                </div>
              )}
              <ChevronRight className="w-5 h-5 text-neutral-gray shrink-0 transition group-hover:translate-x-1 group-hover:text-primary-navy" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// How resale works today versus here. Each row is a real failure of buying through a DM.
const COMPARE = [
  {
    dmEn: "You transfer to a stranger's bank account", dmId: "Transfer ke rekening orang asing",
    luEn: "Your money waits in escrow until the show is over", luId: "Uangmu ditahan escrow sampai acara selesai",
  },
  {
    dmEn: "The same PDF can be sold to five people", dmId: "PDF yang sama bisa dijual ke lima orang",
    luEn: "Duplicate barcodes are blocked before they go on sale", luId: "Barcode duplikat diblokir sebelum dijual",
  },
  {
    dmEn: "The price is whatever they ask", dmId: "Harganya terserah penjual",
    luEn: "Resale is capped at 150% of face value", luId: "Harga resale maksimal 150% dari harga asli",
  },
  {
    dmEn: "Turned away at the gate? The money is gone", dmId: "Ditolak di gate? Uangnya hilang",
    luEn: "Turned away with proof? You get it back", luId: "Ditolak dengan bukti? Uangmu kembali",
  },
];

export default function HomePage() {
  const t = useT();
  const { formatEventDate } = useFormatters();
  const { events: all } = useCatalogue();
  const featured = all.filter((e) => e.featured).slice(0, 3);
  const upcoming = all
    .filter((e) => !featured.includes(e))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const quickCats = Array.from(new Set(all.map((e) => e.category)));

  return (
    <>
      <Hero quickCats={quickCats} />

      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
        <SectionHead title={t("Popular right now", "Lagi banyak dicari")} href="/events" />
        {/* A swipeable row on phones, a grid from tablet up */}
        <div data-reveal="stagger" className="flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-5 px-5 pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-5 sm:mx-0 sm:px-0 sm:overflow-visible">
          {featured.map((e, i) => (
            <Card.Event
              key={e.id}
              className="w-[82%] snap-start sm:w-full"
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
      </section>

      {upcoming.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-16">
          <SectionHead title={t("Coming up", "Segera digelar")} />
          <ComingUp events={upcoming} />
        </section>
      )}

      <section className="max-w-7xl mx-auto px-5 lg:px-10 mt-20">
        <div data-reveal className="max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Why not just buy from a DM?", "Kenapa gak beli lewat DM aja?")}</h2>
          <p className="text-neutral-gray mt-2">
            {t("Most resale in Indonesia still happens in chats and comment sections. Here is what changes.", "Kebanyakan resale di Indonesia masih lewat chat dan kolom komentar. Ini bedanya.")}
          </p>
        </div>
        <div data-reveal="stagger" className="mt-8 grid md:grid-cols-2 gap-4">
          <div className="rounded-3xl bg-secondary-gray-soft p-6">
            <div className="font-fredoka font-semibold text-neutral-gray mb-4">{t("Buying from a DM", "Beli lewat DM")}</div>
            <ul className="flex flex-col gap-3.5">
              {COMPARE.map((c) => (
                <li key={c.dmEn} className="flex gap-3 text-neutral-gray">
                  <span className="w-5 h-5 rounded-full bg-neutral-light-gray-1/70 grid place-items-center shrink-0 mt-0.5"><X className="w-3 h-3" /></span>
                  {t(c.dmEn, c.dmId)}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border-2 border-primary-navy bg-neutral-white p-6 shadow-[4px_4px_0px_#245397]">
            <div className="font-fredoka font-semibold text-primary-navy mb-4">{t("Buying on Lummy", "Beli di Lummy")}</div>
            <ul className="flex flex-col gap-3.5">
              {COMPARE.map((c) => (
                <li key={c.luEn} className="flex gap-3 text-neutral-black">
                  <span className="w-5 h-5 rounded-full bg-primary-navy text-white grid place-items-center shrink-0 mt-0.5"><Check className="w-3 h-3" /></span>
                  {t(c.luEn, c.luId)}
                </li>
              ))}
            </ul>
            <Link href="/how-it-works" className="group mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary-navy">
              <span className="lm-underline">{t("How the protection works", "Cara perlindungannya bekerja")}</span> <ArrowRight className="w-4 h-4 transition group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      <section data-reveal className="max-w-7xl mx-auto px-5 lg:px-10 mt-20 mb-4">
        <TicketBand>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">{t("Got a ticket you can't use?", "Punya tiket yang gak kepakai?")}</h2>
              <p className="text-white/85 mt-1">
                {t("Upload the PDF, AI fills in the details, and you get paid after the show.", "Upload PDF-nya, AI isi datanya, dan kamu dibayar setelah acara.")}
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
