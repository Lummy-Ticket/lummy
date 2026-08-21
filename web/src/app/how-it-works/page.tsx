import Link from "next/link";
import Image from "next/image";
import { Lock, ScanLine, TrendingUp, Eye, RotateCcw, Repeat, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubId } from "@/components/common/Bilingual";
import { cn } from "@/lib/utils";

const sections = [
  {
    Icon: Lock,
    title: "Money sits in escrow",
    sub: "Dana dikunci escrow",
    body: "When you pay, the money goes into a smart contract, not into our account and not to the seller. It only reaches the seller once the show is over and the handover is done.",
  },
  {
    Icon: ScanLine,
    title: "AI screens every ticket",
    sub: "AI cek keaslian tiket",
    body: "Each ticket PDF gets layered checks: file-structure forensics that catch edited documents, barcode decoding against a duplicate registry, and a forgery score. These are review signals, not a replacement for a human.",
  },
  {
    Icon: TrendingUp,
    title: "Prices are capped",
    sub: "Harga dibatasi",
    body: "Listings max out at 150% of face value. That keeps Lummy a fair resale market instead of a scalper's playground.",
  },
  {
    Icon: Eye,
    title: "Anyone can audit it",
    sub: "Transparan, bisa dicek sendiri",
    body: "The state of your money (locked, released, refunded) is publicly verifiable on a block explorer. Do not take our word for it, read the contract.",
  },
  {
    Icon: RotateCcw,
    title: "Turned away? File a dispute",
    sub: "Gagal masuk? Ajukan sengketa",
    body: "Refused at the gate? File within 48 hours with evidence recorded there, such as a photo of the rejecting scanner. An arbiter decides, not an automatic switch, so someone who actually walked in cannot claim otherwise. The promise is your money back, not a guaranteed seat.",
  },
  {
    Icon: Repeat,
    title: "Cannot make it? Relist it",
    sub: "Gak bisa dateng? Jual lagi",
    body: "Changing plans is not a refund reason: the ticket is valid, you simply did not use it. What you can do is relist it before the event and recover the value through the market instead.",
  },
];

const NODE =
  "z-10 w-12 h-12 rounded-full bg-primary-navy text-white font-fredoka font-bold text-lg grid place-items-center shadow-[3px_3px_0px_#245397]";

function StepCard({ s }: { s: (typeof sections)[number] }) {
  return (
    <div className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-5">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="w-9 h-9 rounded-lg bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0">
          <s.Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-fredoka font-semibold text-lg text-neutral-black leading-tight">{s.title}</h3>
          <SubId className="text-xs">{s.sub}</SubId>
        </div>
      </div>
      <p className="text-neutral-gray text-sm leading-relaxed">{s.body}</p>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <div className="pb-10">
      <section className="bg-hero-gradient pt-28 pb-16">
        <div className="max-w-3xl mx-auto px-5 text-center flex flex-col items-center">
          <Image src="/assets/images/mascot-powered.svg" alt="" width={110} height={110} className="mb-3 drop-shadow-lg" />
          <h1 className="flex flex-col font-bold leading-[1.05] text-4xl md:text-5xl mt-2">
            <span className="text-neutral-black">Why resale on Lummy</span>
            <span className="text-primary-navy">is actually safe</span>
          </h1>
          <p className="text-lg text-neutral-gray mt-4">Blockchain and AI do the work backstage. You just buy a ticket like anywhere else.</p>
          <SubId className="mt-1.5">Blockchain + AI kerja di belakang layar, kamu cukup beli seperti biasa.</SubId>
        </div>
      </section>

      {/* Zigzag stepper. Desktop: fixed-height bands keep the numbers evenly spaced and
          tight; each card is centred on its own node, and left/right columns cannot
          collide. The spine is inset so it starts and ends exactly on a node.
          Mobile: one column, node beside card. */}
      <section className="border-y border-neutral-light-gray-1 py-16 lg:py-20">
        <div className="max-w-4xl mx-auto px-5">
          <h2 className="text-center font-bold text-2xl md:text-3xl text-neutral-black leading-tight">Six layers protecting your money</h2>
          <SubId className="text-center mt-2 mb-12">Nyala dari klik pertama sampai konser lewat.</SubId>

          {/* Desktop. Invariant: same-side cards sit two bands apart (2 x h-28 = 224px
              between centres), so each card must stay under ~200px tall or neighbours on
              the same side start to touch. Current worst case leaves 35px of clearance,
              so keep the step bodies to roughly four lines. */}
          <div className="relative hidden md:block">
            <div className="absolute top-14 bottom-14 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-lummy-500/50" aria-hidden />
            {sections.map((s, i) => {
              const left = i % 2 === 0;
              return (
                <div key={s.title} className="relative h-28">
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
                <div key={s.title} className="relative flex gap-4">
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
        <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">Now go find your ticket</h2>
        <SubId className="mt-2 mb-6">Tiket resale terverifikasi, semuanya dijaga escrow.</SubId>
        <Link href="/events"><Button.Primary className="flex items-center gap-2">Browse events <ArrowRight className="w-4 h-4" /></Button.Primary></Link>
      </section>
    </div>
  );
}
