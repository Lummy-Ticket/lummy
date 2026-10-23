"use client";

import type React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, IdCard, MessagesSquare, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketBand } from "@/components/ui/ticket-band";
import { PageContainer } from "@/components/layout/PageContainer";
import { useT } from "@/lib/i18n";

// What resale looks like in Indonesia today. Qualitative on purpose: no numbers we
// cannot source.
const problems = [
  {
    Icon: IdCard,
    en: "Tickets carry a name", id: "Tiket atas nama",
    bodyEn: "Big shows check ID at the gate, so passing a ticket on means a letter of authorisation and the seller's ID card. People make these by hand and get them wrong.",
    bodyId: "Konser besar cek KTP di gate, jadi mengoper tiket butuh surat kuasa dan KTP penjual. Orang membuatnya manual dan sering salah.",
  },
  {
    Icon: MessagesSquare,
    en: "Resale lives in DMs", id: "Resale terjadi di DM",
    bodyEn: "On X, in WhatsApp groups and comment sections. The buyer transfers first and hopes the seller does not disappear.",
    bodyId: "Di X, grup WhatsApp, dan kolom komentar. Pembeli transfer duluan dan berharap penjualnya tidak menghilang.",
  },
  {
    Icon: Copy,
    en: "One file, many buyers", id: "Satu file, banyak pembeli",
    bodyEn: "A ticket PDF can be sent to several people. Only the first one through the gate gets in.",
    bodyId: "PDF tiket bisa dikirim ke beberapa orang. Hanya yang pertama lewat gate yang bisa masuk.",
  },
];

const principles = [
  {
    en: "The seller is paid last", id: "Penjual dibayar paling akhir",
    bodyEn: "Money waits in escrow until the show is over. Cheating stops paying when the payout comes after the gate.",
    bodyId: "Uang menunggu di escrow sampai acara selesai. Menipu jadi tidak menguntungkan kalau pembayaran datang setelah gate.",
  },
  {
    en: "No crypto to learn in Indonesia", id: "Tanpa belajar kripto di Indonesia",
    bodyEn: "Sign in with email and pay with QRIS in rupiah; the ledger underneath is ours to run. For a show abroad, pay test USDC from your own wallet: two signatures, no gas to pay.",
    bodyId: "Masuk pakai email dan bayar QRIS dalam rupiah; buku besar di belakangnya urusan kami. Untuk acara di luar negeri, bayar USDC uji dari wallet-mu sendiri: dua tanda tangan, tanpa bayar gas.",
  },
  {
    en: "Fair prices by design", id: "Harga wajar sejak awal",
    bodyEn: "Face value, markup and fees are shown before you pay, and resale is capped at 150%.",
    bodyId: "Harga asli, markup, dan biaya terlihat sebelum bayar, dan harga resale maksimal 150%.",
  },
  {
    en: "Honest about limits", id: "Jujur soal batasan",
    bodyEn: "Without the organiser on board we cannot promise you get in. What we promise is your money back when you are turned away with proof.",
    bodyId: "Tanpa kerja sama penyelenggara, kami tidak bisa menjamin kamu masuk. Yang kami janjikan: uang kembali kalau kamu ditolak dengan bukti.",
  },
];

export default function AboutPage() {
  const t = useT();
  return (
    <PageContainer width="wide">
      {/* Intro */}
      <div className="relative overflow-hidden rounded-3xl border border-lummy-500 bg-hero-gradient p-6 sm:p-10">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
          <div>
            <h1 className="font-fredoka font-semibold leading-[1.05] text-4xl md:text-5xl tracking-tight">
              <span className="lm-line text-neutral-black"><span>{t("Resale, minus the", "Resale, tanpa")}</span></span>
              <span className="lm-line text-primary-navy"><span style={{ "--i": 1 } as React.CSSProperties}>{t("leap of faith.", "untung-untungan.")}</span></span>
            </h1>
            <p className="lm-in text-lg text-neutral-gray mt-4 max-w-xl" style={{ "--d": "240ms" } as React.CSSProperties}>
              {t(
                "Lummy Ticket is a resale marketplace for concert tickets in Indonesia. We sit between buyer and seller and hold the money until the show is over, so neither side has to trust a stranger.",
                "Lummy Ticket adalah marketplace resale tiket konser di Indonesia. Kami berdiri di antara pembeli dan penjual dan menahan uangnya sampai acara selesai, jadi tidak ada yang harus percaya pada orang asing."
              )}
            </p>
            <div className="lm-in flex flex-wrap gap-3 mt-6" style={{ "--d": "320ms" } as React.CSSProperties}>
              <Link href="/events"><Button.Primary className="flex items-center gap-2">{t("Browse events", "Jelajah event")} <ArrowRight className="w-4 h-4" /></Button.Primary></Link>
              <Link href="/how-it-works"><Button.Secondary>{t("How it works", "Cara kerja")}</Button.Secondary></Link>
            </div>
          </div>
          <div className="hidden lg:flex justify-center">
            <Image src="/assets/brand/maskot-halo-tanpa-bayangan.svg" alt="Lummy" width={240} height={205} className="w-[340px] h-auto object-contain motion-safe:animate-float" priority />
          </div>
        </div>
      </div>

      {/* The problem */}
      <section className="mt-16">
        <h2 data-reveal className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Where we started", "Dari mana kami mulai")}</h2>
        <div data-reveal="stagger" className="grid md:grid-cols-3 gap-5 mt-6">
          {problems.map((p) => (
            <div key={p.en} className="rounded-3xl bg-secondary-gray-soft p-6">
              <span className="w-10 h-10 rounded-xl bg-neutral-white text-primary-navy grid place-items-center border border-neutral-light-gray-1">
                <p.Icon className="w-5 h-5" />
              </span>
              <h3 className="font-semibold text-lg text-neutral-black mt-4">{t(p.en, p.id)}</h3>
              <p className="text-sm text-neutral-gray mt-1.5 leading-relaxed">{t(p.bodyEn, p.bodyId)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Principles */}
      <section className="mt-16">
        <h2 data-reveal className="text-2xl md:text-3xl font-bold text-neutral-black">{t("How we run it", "Prinsip kami")}</h2>
        <div data-reveal="stagger" className="grid sm:grid-cols-2 gap-x-10 gap-y-6 mt-6">
          {principles.map((c, i) => (
            <div key={c.en} className="flex gap-4">
              <span className="font-bold text-2xl text-primary-navy/30 leading-none w-8 shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-semibold text-neutral-black">{t(c.en, c.id)}</h3>
                <p className="text-sm text-neutral-gray mt-1.5 leading-relaxed">{t(c.bodyEn, c.bodyId)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div data-reveal className="mt-16">
        <TicketBand>
          <div className="flex flex-col items-center text-center gap-4">
            <h2 className="text-2xl md:text-3xl font-bold">{t("Ready to find your ticket?", "Siap cari tiketmu?")}</h2>
            <Link href="/events"><Button.Secondary className="flex items-center gap-2">{t("Browse events", "Jelajah event")} <ArrowRight className="w-4 h-4" /></Button.Secondary></Link>
          </div>
        </TicketBand>
      </div>
    </PageContainer>
  );
}
