"use client";

import Link from "next/link";
import Image from "next/image";
import { Lock, ScanLine, TrendingUp, Eye, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketFeature } from "@/components/ui/ticket-feature";
import { TicketBand } from "@/components/ui/ticket-band";
import { PageContainer } from "@/components/layout/PageContainer";
import { useT } from "@/lib/i18n";

const pillars = [
  {
    Icon: Lock,
    en: "Money held in escrow", id: "Dana dikunci escrow",
    bodyEn: "Funds sit in a smart contract until the show is over. The seller cannot vanish with them, and the buyer cannot be ghosted.",
    bodyId: "Dana ditahan smart contract sampai konser selesai. Penjual gak bisa kabur bawa uangnya, pembeli gak bisa dighosting.",
  },
  {
    Icon: ScanLine,
    en: "AI against fake tickets", id: "AI anti tiket palsu",
    bodyEn: "Every PDF is checked before it goes live: file-structure forensics, duplicate barcodes, and a forgery score.",
    bodyId: "Tiap PDF diperiksa sebelum tayang: forensik struktur file, barcode duplikat, dan skor pemalsuan.",
  },
  {
    Icon: TrendingUp,
    en: "Prices are capped", id: "Harga dibatasi",
    bodyEn: "Listings max out at 150% of face value. Fair pricing by design, not a free-for-all.",
    bodyId: "Listing maksimal 150% dari harga asli. Harga wajar sejak desain, bukan pasar liar.",
  },
  {
    Icon: Eye,
    en: "Auditable on-chain", id: "Transparan on-chain",
    bodyEn: "Locked, released, or refunded: anyone can verify the state of the money on a block explorer.",
    bodyId: "Terkunci, cair, atau dikembalikan: siapa pun bisa memverifikasi status dananya di block explorer.",
  },
];

const charter = [
  {
    en: "Safe by construction", id: "Aman sejak rancangan",
    bodyEn: "The seller is not paid until the show has passed without a problem. Funds stay in escrow, never in our account.",
    bodyId: "Penjual belum dibayar sampai konser lewat tanpa masalah. Dana ada di escrow, bukan di rekening kami.",
  },
  {
    en: "Total transparency", id: "Transparansi total",
    bodyEn: "Face value, markup, and fees are visible before you pay. Every transaction can be verified publicly.",
    bodyId: "Harga asli, markup, dan biaya kelihatan sebelum kamu bayar. Semua transaksi bisa diverifikasi publik.",
  },
  {
    en: "Authenticity screened by AI", id: "Keaslian dijaga AI",
    bodyEn: "Edited tickets and duplicate barcodes are caught before a listing goes live. Anything doubtful goes to manual review.",
    bodyId: "Tiket editan dan barcode duplikat ketahan sebelum listing tayang. Yang meragukan masuk review manual.",
  },
  {
    en: "Refused entry, money back", id: "Gagal masuk, uang balik",
    bodyEn: "If the ticket fails at the gate and your evidence holds up, you are refunded in full. That is enforced by code, not goodwill.",
    bodyId: "Kalau tiket gagal di gate dan buktimu kredibel, dana dikembalikan penuh. Dijamin kode, bukan niat baik.",
  },
];

const journey = [
  {
    n: 1, en: "Pick and pay", id: "Pilih & bayar",
    bodyEn: "Choose a resale ticket and pay the normal way. No wallet, no crypto vocabulary.",
    bodyId: "Pilih tiket resale, bayar seperti biasa. Gak ada wallet, gak ada istilah crypto.",
  },
  {
    n: 2, en: "Escrow locks the money", id: "Escrow mengunci dana",
    bodyEn: "Your payment sits in a smart contract instead of our bank account, and anyone can verify it.",
    bodyId: "Pembayaranmu ditahan smart contract, bukan rekening kami, dan siapa pun bisa memverifikasinya.",
  },
  {
    n: 3, en: "Handover, documented", id: "Serah-terima terdokumentasi",
    bodyEn: "You get a print-ready letter of authorisation straight away, plus gated access to the seller ID near the date.",
    bodyId: "Kamu langsung dapat surat kuasa siap-print, plus akses terbatas ke KTP penjual mendekati hari-H.",
  },
  {
    n: 4, en: "Show ends, funds release", id: "Konser selesai, dana cair",
    bodyEn: "Once the event passes without a dispute, the seller is paid. Turned away with proof? You get refunded.",
    bodyId: "Setelah acara lewat tanpa sengketa, penjual dibayar. Ditolak di gate dengan bukti? Dana kamu balik.",
  },
];

export default function AboutPage() {
  const t = useT();
  return (
    <PageContainer width="wide">
      {/* Intro */}
      <div className="rounded-3xl border border-lummy-500 bg-hero-gradient p-6 sm:p-10">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
          <div>
            <h1 className="flex flex-col font-bold leading-[1.05] text-4xl md:text-5xl">
              <span className="text-neutral-black">{t("Buy and sell tickets", "Beli dan jual tiket")}</span>
              <span className="text-primary-navy">{t("without the fear.", "tanpa takut ketipu.")}</span>
            </h1>
            <p className="text-neutral-gray mt-4 max-w-xl">
              {t(
                "Lummy Ticket started from a real problem: ticket resale in Indonesia runs on scalpers, wild prices, and manual bank transfers to strangers. We stand in the middle, so sellers can price fairly and buyers are not gambling their money on a DM.",
                "Lummy Ticket lahir dari masalah nyata: pasar resale tiket di Indonesia penuh calo, harga liar, dan transfer manual ke orang asing. Kami berdiri di tengah, supaya penjual bisa pasang harga wajar dan pembeli gak mempertaruhkan uangnya lewat DM."
              )}
            </p>
            <p className="text-neutral-gray mt-3 max-w-xl">
              {t(
                "Escrow and AI do the work backstage. Up front it feels like any normal app, with no crypto to learn. Your money is guarded by code, not by a promise.",
                "Escrow dan AI kerja di belakang layar. Di depan, rasanya seperti aplikasi biasa, tanpa perlu belajar crypto. Dana kamu dijaga kode, bukan sekadar janji."
              )}
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Link href="/events"><Button.Primary className="flex items-center gap-2">{t("Browse events", "Jelajah event")} <ArrowRight className="w-4 h-4" /></Button.Primary></Link>
              <Link href="/how-it-works"><Button.Secondary>{t("How it works", "Cara kerja")}</Button.Secondary></Link>
            </div>
          </div>
          <div className="hidden lg:flex justify-center">
            <Image src="/assets/images/mascot.png" alt="Lummy" width={300} height={300} className="object-contain drop-shadow-xl" priority />
          </div>
        </div>
      </div>

      {/* Pillars */}
      <div className="grid sm:grid-cols-2 gap-5 mt-14">
        {pillars.map((p) => (
          <TicketFeature key={p.en} Icon={p.Icon} title={t(p.en, p.id)} body={t(p.bodyEn, p.bodyId)} />
        ))}
      </div>

      {/* Journey */}
      <div className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-black text-center">
          {t("Protected from first click to final song", "Aman dari klik pertama sampai lagu terakhir")}
        </h2>
        <p className="text-neutral-gray text-center mt-2">
          {t("Four steps, with your money guarded by code the whole way.", "Empat langkah, dana dijaga kode sepanjang jalan.")}
        </p>
        <div className="grid md:grid-cols-4 gap-5 mt-8">
          {journey.map((s) => (
            <div key={s.n} className="bg-neutral-white rounded-3xl border-2 border-lummy-500 p-6">
              <span className="font-fredoka font-bold text-lg w-10 h-10 rounded-2xl bg-primary-navy text-white grid place-items-center">{s.n}</span>
              <h3 className="font-fredoka font-semibold text-neutral-black mt-4">{t(s.en, s.id)}</h3>
              <p className="text-sm text-neutral-gray mt-2">{t(s.bodyEn, s.bodyId)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charter */}
      <div className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("What we commit to", "Janji kami")}</h2>
        <div className="grid sm:grid-cols-2 gap-5 mt-6">
          {charter.map((c) => (
            <div key={c.en} className="border-l-2 border-lummy-500 pl-4 py-1">
              <h3 className="font-fredoka font-semibold text-neutral-black">{t(c.en, c.id)}</h3>
              <p className="text-sm text-neutral-gray mt-1.5">{t(c.bodyEn, c.bodyId)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <TicketBand className="mt-16">
        <div className="flex flex-col items-center text-center gap-4">
          <h2 className="text-2xl md:text-3xl font-bold">{t("Ready to find your ticket?", "Siap cari tiketmu?")}</h2>
          <p className="text-white/85 max-w-lg">
            {t(
              "Verified resale tickets, every one of them held in escrow until the show is over.",
              "Tiket resale terverifikasi, semuanya dijaga escrow sampai konser selesai."
            )}
          </p>
          <Link href="/events"><Button.Secondary className="flex items-center gap-2">{t("Browse events", "Jelajah event")} <ArrowRight className="w-4 h-4" /></Button.Secondary></Link>
        </div>
      </TicketBand>
    </PageContainer>
  );
}
