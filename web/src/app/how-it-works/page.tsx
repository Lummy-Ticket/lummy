"use client";

import Link from "next/link";
import Image from "next/image";
import { Lock, ScanLine, TrendingUp, Eye, RotateCcw, Repeat, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Step = { Icon: typeof Lock; en: string; id: string; bodyEn: string; bodyId: string };

const sections: Step[] = [
  {
    Icon: Lock,
    en: "Money sits in escrow",
    id: "Dana dikunci escrow",
    bodyEn: "When you pay, the money goes into a smart contract, not into our account and not to the seller. It only reaches the seller once the show is over and the handover is done.",
    bodyId: "Waktu kamu bayar, uangnya masuk ke smart contract, bukan ke rekening kami atau langsung ke penjual. Dana baru sampai ke penjual setelah konser selesai dan serah-terima beres.",
  },
  {
    Icon: ScanLine,
    en: "AI screens every ticket",
    id: "AI cek keaslian tiket",
    bodyEn: "Each ticket PDF gets layered checks: file-structure forensics that catch edited documents, barcode decoding against a duplicate registry, and a forgery score. These are review signals, not a replacement for a human.",
    bodyId: "Tiap PDF tiket diperiksa berlapis: forensik struktur file untuk menangkap dokumen editan, barcode di-decode dan dicek duplikat, plus skor pemalsuan. Semuanya sinyal buat review, bukan pengganti manusia.",
  },
  {
    Icon: TrendingUp,
    en: "Prices are capped",
    id: "Harga dibatasi",
    bodyEn: "Listings max out at 150% of face value. That keeps Lummy a fair resale market instead of a scalper's playground.",
    bodyId: "Listing maksimal 150% dari harga asli. Ini bikin Lummy jadi pasar resale yang wajar, bukan lahan calo.",
  },
  {
    Icon: Eye,
    en: "Anyone can audit it",
    id: "Transparan, bisa dicek sendiri",
    bodyEn: "The state of your money (locked, released, refunded) is publicly verifiable on a block explorer. Do not take our word for it, read the contract.",
    bodyId: "Status dana kamu (terkunci, cair, dikembalikan) bisa diverifikasi publik di block explorer. Jangan percaya kami, cek sendiri.",
  },
  {
    Icon: RotateCcw,
    en: "Turned away? File a dispute",
    id: "Gagal masuk? Ajukan sengketa",
    bodyEn: "Refused at the gate? File within 48 hours with evidence recorded there, such as a photo of the rejecting scanner. An arbiter decides, not an automatic switch, so someone who actually walked in cannot claim otherwise. The promise is your money back, not a guaranteed seat.",
    bodyId: "Ditolak di gate? Ajukan sengketa maksimal 48 jam setelah acara dengan bukti yang direkam di sana, misalnya foto layar scanner yang menolak. Diputus arbiter, bukan otomatis, jadi yang beneran masuk gak bisa ngaku gagal. Garansinya uang balik, bukan dijamin masuk.",
  },
  {
    Icon: Repeat,
    en: "Cannot make it? Relist it",
    id: "Gak bisa dateng? Jual lagi",
    bodyEn: "Changing plans is not a refund reason: the ticket is valid, you simply did not use it. What you can do is relist it before the event and recover the value through the market instead.",
    bodyId: "Berubah rencana bukan alasan refund: tiketnya valid, kamu saja yang gak memakainya. Yang bisa kamu lakukan adalah jual lagi sebelum acara dan balikin nilainya lewat pasar.",
  },
];

const NODE =
  "z-10 w-12 h-12 rounded-full bg-primary-navy text-white font-fredoka font-bold text-lg grid place-items-center shadow-[3px_3px_0px_#245397]";

function StepCard({ s }: { s: Step }) {
  const t = useT();
  return (
    <div className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-5">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="w-9 h-9 rounded-lg bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0">
          <s.Icon className="w-5 h-5" />
        </span>
        <h3 className="font-fredoka font-semibold text-lg text-neutral-black leading-tight">{t(s.en, s.id)}</h3>
      </div>
      <p className="text-neutral-gray text-sm leading-relaxed">{t(s.bodyEn, s.bodyId)}</p>
    </div>
  );
}

export default function HowItWorks() {
  const t = useT();
  return (
    <div className="pb-10">
      <section className="bg-hero-gradient pt-28 pb-16">
        <div className="max-w-3xl mx-auto px-5 text-center flex flex-col items-center">
          <Image src="/assets/images/mascot-powered.svg" alt="" width={110} height={110} className="mb-3 drop-shadow-lg" />
          <h1 className="flex flex-col font-bold leading-[1.05] text-4xl md:text-5xl mt-2">
            <span className="text-neutral-black">{t("Why resale on Lummy", "Kenapa resale di Lummy")}</span>
            <span className="text-primary-navy">{t("is actually safe", "beneran aman")}</span>
          </h1>
          <p className="text-lg text-neutral-gray mt-4">
            {t(
              "Blockchain and AI do the work backstage. You just buy a ticket like anywhere else.",
              "Blockchain dan AI kerja di belakang layar. Kamu cukup beli tiket seperti biasa."
            )}
          </p>
        </div>
      </section>

      {/* Zigzag stepper. Desktop: fixed-height bands keep the numbers evenly spaced and
          tight; each card is centred on its own node, and left/right columns cannot
          collide. The spine is inset so it starts and ends exactly on a node.
          Mobile: one column, node beside card. */}
      <section className="border-y border-neutral-light-gray-1 py-16 lg:py-20">
        <div className="max-w-4xl mx-auto px-5">
          <h2 className="text-center font-bold text-2xl md:text-3xl text-neutral-black leading-tight">
            {t("Six layers protecting your money", "Enam lapisan yang jaga uangmu")}
          </h2>
          <p className="text-center text-neutral-gray mt-2 mb-12">
            {t("Running from your first click until the show has passed.", "Nyala dari klik pertama sampai konser lewat.")}
          </p>

          {/* Desktop. Invariant: same-side cards sit two bands apart (2 x h-28 = 224px
              between centres), so each card must stay under ~200px tall or neighbours on
              the same side start to touch. Current worst case leaves 35px of clearance,
              so keep the step bodies to roughly four lines. */}
          <div className="relative hidden md:block">
            <div className="absolute top-14 bottom-14 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-lummy-500/50" aria-hidden />
            {sections.map((s, i) => {
              const left = i % 2 === 0;
              return (
                <div key={s.en} className="relative h-28">
                  <span className={cn("absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2", NODE)}>{i + 1}</span>
                  <span
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 w-8 border-t-2 border-dashed border-lummy-500/50",
                      left ? "right-1/2 mr-6" : "left-1/2 ml-6"
                    )}
                    aria-hidden
                  />
                  <div className={cn("absolute top-1/2 -translate-y-1/2 w-[calc(50%-3.5rem)]", left ? "left-0" : "right-0")}>
                    <StepCard s={s} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile */}
          <div className="relative md:hidden">
            <div className="absolute top-6 bottom-6 left-6 border-l-2 border-dashed border-lummy-500/50" aria-hidden />
            <div className="flex flex-col gap-5">
              {sections.map((s, i) => (
                <div key={s.en} className="relative flex gap-4">
                  <span className={cn("shrink-0", NODE)}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <StepCard s={s} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-5 mt-16 text-center flex flex-col items-center">
        <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">{t("Now go find your ticket", "Sekarang tinggal cari tiketnya")}</h2>
        <p className="text-neutral-gray mt-2 mb-6">
          {t("Verified resale tickets, every one of them held in escrow.", "Tiket resale terverifikasi, semuanya dijaga escrow.")}
        </p>
        <Link href="/events"><Button.Primary className="flex items-center gap-2">{t("Browse events", "Jelajah event")} <ArrowRight className="w-4 h-4" /></Button.Primary></Link>
      </section>
    </div>
  );
}
