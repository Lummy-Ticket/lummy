"use client";

import Link from "next/link";
import Image from "next/image";
import { Lock, ScanLine, TrendingUp, Eye, Repeat, ArrowRight, CalendarX, CalendarClock, PackageX, FileWarning, XCircle, Timer, QrCode, FileText, Flag, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketFeature } from "@/components/ui/ticket-feature";
import { useT } from "@/lib/i18n";
import { CAP_PCT, DISPUTE_WINDOW_H } from "@/lib/mock";

// The life of the buyer's money, in the order it happens.
const journey = [
  {
    Icon: QrCode,
    en: "You pay", id: "Kamu bayar",
    bodyEn: "With QRIS, like any other app. The money goes into escrow, not to the seller and not to us.",
    bodyId: "Pakai QRIS, seperti aplikasi lain. Uangnya masuk escrow, bukan ke penjual, bukan juga ke kami.",
  },
  {
    Icon: FileText,
    en: "You get the paperwork", id: "Dokumen langsung terbit",
    bodyEn: "A signed letter of authorisation, ready to print. Near the show, access to the seller's ID for the gate.",
    bodyId: "Surat kuasa bertanda tangan, siap print. Mendekati acara, akses ke KTP penjual untuk di gate.",
  },
  {
    Icon: Flag,
    en: "The show happens", id: "Acaranya berlangsung",
    bodyEn: `A ${DISPUTE_WINDOW_H}-hour window opens. Got in fine? You do nothing.`,
    bodyId: `Masa sengketa ${DISPUTE_WINDOW_H} jam dibuka. Berhasil masuk? Kamu tidak perlu apa-apa.`,
  },
  {
    Icon: Banknote,
    en: "The seller is paid", id: "Penjual dibayar",
    bodyEn: "When the window closes quietly, the escrow pays the seller by itself.",
    bodyId: "Kalau masa sengketa lewat tanpa klaim, escrow membayar penjual dengan sendirinya.",
  },
];

const checks = [
  {
    Icon: ScanLine,
    en: "AI reads every ticket", id: "AI membaca tiap tiket",
    bodyEn: "It fills in the listing and looks for signs the PDF was edited. A high score sends it to a person, it never decides alone.",
    bodyId: "Mengisi data listing dan mencari jejak PDF yang diedit. Skor tinggi dikirim ke manusia, bukan diputus sendiri.",
  },
  {
    Icon: Lock,
    en: "One barcode, one sale", id: "Satu barcode, satu penjualan",
    bodyEn: "A barcode that has been sold on Lummy before is blocked outright. That check is exact, not a guess.",
    bodyId: "Barcode yang pernah dijual di Lummy langsung diblokir. Pengecekannya pasti, bukan tebakan.",
  },
  {
    Icon: TrendingUp,
    en: `Capped at ${CAP_PCT}%`, id: `Maksimal ${CAP_PCT}%`,
    bodyEn: "No listing can ask more than one and a half times face value.",
    bodyId: "Tidak ada listing yang boleh lebih dari satu setengah kali harga asli.",
  },
  {
    Icon: Eye,
    en: "Open to audit", id: "Bisa diaudit",
    bodyEn: "Whether money is held, released or refunded is recorded publicly. You can check it yourself.",
    bodyId: "Status dana (ditahan, cair, dikembalikan) tercatat publik. Kamu bisa cek sendiri.",
  },
];

// Every way a ticket can fail, and what settles it. The policy in full, so a buyer can
// check the promise before they need it.
const coverage = [
  {
    Icon: PackageX,
    en: "The seller never hands it over", id: "Penjual tidak menyerahkan tiket",
    outEn: "Claim before the show. Our record of whether you opened the handover documents decides it, so there is nothing for you to prove.",
    outId: "Klaim sebelum acara. Catatan kami soal apakah kamu pernah membuka dokumen serah-terima yang menentukan, jadi tidak ada yang perlu kamu buktikan.",
  },
  {
    Icon: FileWarning,
    en: "It is not the ticket that was listed", id: "Tiketnya beda dari listing",
    outEn: "Still got in on a lower tier? You get the difference back, not the full price.",
    outId: "Tetap masuk dengan tier lebih rendah? Yang kembali selisihnya, bukan harga penuh.",
  },
  {
    Icon: XCircle,
    en: "You are turned away at the gate", id: "Kamu ditolak di gate",
    outEn: `File within ${DISPUTE_WINDOW_H} hours with a photo taken there. Time, place and the code on screen all have to match, so someone who walked in cannot claim.`,
    outId: `Ajukan dalam ${DISPUTE_WINDOW_H} jam dengan foto yang diambil di sana. Waktu, tempat, dan kode di layar harus cocok, jadi yang berhasil masuk tidak bisa mengklaim.`,
  },
  {
    Icon: CalendarX,
    en: "The organiser cancels", id: "Penyelenggara membatalkan",
    outEn: "Refunded automatically. Nobody files anything and the seller is not penalised.",
    outId: "Dikembalikan otomatis. Tidak ada yang perlu mengajukan dan penjual tidak kena penalti.",
  },
  {
    Icon: CalendarClock,
    en: "The organiser moves the date", id: "Penyelenggara mengundur tanggal",
    outEn: "Your ticket stays valid and the money stays held. If the new date does not work, take the refund.",
    outId: "Tiketmu tetap berlaku dan dananya tetap ditahan. Kalau tanggal barunya tidak cocok, ambil refund.",
  },
  {
    Icon: Repeat,
    en: "You cannot make it", id: "Kamu berhalangan hadir",
    outEn: "Not a refund, because the ticket works. Relist it before the show and get your money back from the next buyer.",
    outId: "Bukan refund, karena tiketnya berfungsi. Jual lagi sebelum acara dan uangmu kembali dari pembeli berikutnya.",
  },
  {
    Icon: Timer,
    en: "Nothing goes wrong", id: "Tidak ada masalah",
    outEn: `You do nothing. ${DISPUTE_WINDOW_H} hours after the show, the seller is paid.`,
    outId: `Kamu tidak perlu apa-apa. ${DISPUTE_WINDOW_H} jam setelah acara, penjual dibayar.`,
  },
];

export default function HowItWorks() {
  const t = useT();
  return (
    <div className="pb-10">
      <section className="relative overflow-hidden bg-hero-gradient pt-28 pb-20">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(#3A6CB41f_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        />
        <div className="relative max-w-3xl mx-auto px-5 text-center flex flex-col items-center">
          <Image src="/assets/images/mascot-powered.svg" alt="" width={104} height={104} priority className="mb-2 drop-shadow-lg motion-safe:animate-rise" />
          <h1 className="motion-safe:animate-rise [animation-delay:60ms] flex flex-col font-bold leading-[1.05] text-4xl md:text-6xl tracking-tight">
            <span className="text-neutral-black">{t("Why resale on Lummy", "Kenapa resale di Lummy")}</span>
            <span className="text-primary-navy">{t("is actually safe", "beneran aman")}</span>
          </h1>
          <p className="motion-safe:animate-rise [animation-delay:120ms] text-lg text-neutral-gray mt-5 max-w-xl">
            {t(
              "It works like any ticket app. The difference is where your money waits, and what gets checked before a ticket goes on sale.",
              "Cara pakainya seperti aplikasi tiket biasa. Bedanya ada di mana uangmu menunggu, dan apa yang dicek sebelum tiket dijual."
            )}
          </p>
        </div>
        <div
          aria-hidden
          className="absolute bottom-0 inset-x-0 h-3 bg-[radial-gradient(circle_at_12px_12px,#ffffff_7px,transparent_7.5px)] [background-size:24px_12px] bg-repeat-x"
        />
      </section>

      {/* The money's journey, left to right on desktop, top to bottom on a phone */}
      <section className="reveal max-w-6xl mx-auto px-5 lg:px-10 mt-16">
        <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">{t("Where your money goes", "Ke mana uangmu pergi")}</h2>
        <ol className="relative mt-8 grid md:grid-cols-4 gap-6 md:gap-5">
          <span aria-hidden className="hidden md:block absolute top-6 left-[12.5%] right-[12.5%] border-t-2 border-dashed border-lummy-500/40" />
          <span aria-hidden className="md:hidden absolute top-6 bottom-6 left-6 border-l-2 border-dashed border-lummy-500/40" />
          {journey.map((s, i) => (
            <li key={s.en} className="relative flex md:flex-col md:items-center md:text-center gap-4 md:gap-3">
              <span className="z-10 w-12 h-12 shrink-0 rounded-full bg-primary-navy text-white grid place-items-center shadow-[3px_3px_0px_#245397]">
                <s.Icon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-navy">{t(`Step ${i + 1}`, `Langkah ${i + 1}`)}</div>
                <h3 className="font-fredoka font-semibold text-lg text-neutral-black mt-0.5">{t(s.en, s.id)}</h3>
                <p className="text-sm text-neutral-gray mt-1 leading-relaxed">{t(s.bodyEn, s.bodyId)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="reveal max-w-6xl mx-auto px-5 lg:px-10 mt-20">
        <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">{t("Checked before it goes on sale", "Dicek sebelum dijual")}</h2>
        <div className="grid sm:grid-cols-2 gap-5 mt-8">
          {checks.map((c) => (
            <TicketFeature key={c.en} Icon={c.Icon} title={t(c.en, c.id)} body={t(c.bodyEn, c.bodyId)} />
          ))}
        </div>
      </section>

      {/* Coverage map: the whole failure surface in one place. */}
      <section id="coverage" className="reveal max-w-6xl mx-auto px-5 lg:px-10 mt-20 scroll-mt-28">
        <div className="max-w-3xl">
        <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">{t("When something goes wrong", "Kalau ada yang tidak beres")}</h2>
        <p className="text-neutral-gray mt-2">
          {t("Each case has one path, and each path names what decides it.", "Tiap kasus punya satu jalur, dan tiap jalur menyebut apa yang menentukannya.")}
        </p>
        <div className="mt-6 flex flex-col divide-y divide-dashed divide-neutral-light-gray-1 border-y border-neutral-light-gray-1">
          {coverage.map((c) => (
            <div key={c.en} className="flex gap-4 py-5">
              <span className="w-9 h-9 rounded-lg bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0">
                <c.Icon className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h3 className="font-fredoka font-semibold text-neutral-black">{t(c.en, c.id)}</h3>
                <p className="text-sm text-neutral-gray mt-1 leading-relaxed">{t(c.outEn, c.outId)}</p>
              </div>
            </div>
          ))}
        </div>
        </div>
      </section>

      <section className="reveal max-w-3xl mx-auto px-5 mt-16 text-center flex flex-col items-center">
        <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">{t("Now go find your ticket", "Sekarang tinggal cari tiketnya")}</h2>
        <Link href="/events" className="mt-6"><Button.Primary className="flex items-center gap-2">{t("Browse events", "Jelajah event")} <ArrowRight className="w-4 h-4" /></Button.Primary></Link>
      </section>
    </div>
  );
}
