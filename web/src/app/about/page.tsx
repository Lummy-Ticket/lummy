import Link from "next/link";
import Image from "next/image";
import { Lock, ScanLine, TrendingUp, Eye, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketFeature } from "@/components/ui/ticket-feature";
import { TicketBand } from "@/components/ui/ticket-band";
import { PageContainer } from "@/components/layout/PageContainer";
import { SubId } from "@/components/common/Bilingual";

const pillars = [
  { Icon: Lock, title: "Money held in escrow", body: "Funds sit in a smart contract until the show is over. The seller cannot vanish with them, and the buyer cannot be ghosted." },
  { Icon: ScanLine, title: "AI against fake tickets", body: "Every PDF is checked before it goes live: file-structure forensics, duplicate barcodes, and a forgery score." },
  { Icon: TrendingUp, title: "Prices are capped", body: "Listings max out at 150% of face value. Fair pricing by design, not a free-for-all." },
  { Icon: Eye, title: "Auditable on-chain", body: "Locked, released, or refunded: anyone can verify the state of the money on a block explorer." },
];

const charter = [
  { title: "Safe by construction", sub: "Aman & terjaga", body: "The seller is not paid until the show has passed without a problem. Funds stay in escrow, never in our account." },
  { title: "Total transparency", sub: "Transparansi total", body: "Face value, markup, and fees are visible before you pay. Every transaction can be verified publicly." },
  { title: "Authenticity screened by AI", sub: "Keaslian dijaga AI", body: "Edited tickets and duplicate barcodes are caught before a listing goes live. Anything doubtful goes to manual review." },
  { title: "Refused entry, money back", sub: "Gagal masuk, uang balik", body: "If the ticket fails at the gate and your evidence holds up, you are refunded in full. That is enforced by code, not goodwill." },
];

const journey = [
  { n: 1, title: "Pick and pay", body: "Choose a resale ticket and pay the normal way. No wallet, no crypto vocabulary." },
  { n: 2, title: "Escrow locks the money", body: "Your payment sits in a smart contract instead of our bank account, and anyone can verify it." },
  { n: 3, title: "Handover, documented", body: "You get a print-ready letter of authorisation straight away, plus gated access to the seller ID near the date." },
  { n: 4, title: "Show ends, funds release", body: "Once the event passes without a dispute, the seller is paid. Turned away with proof? You get refunded." },
];

export default function AboutPage() {
  return (
    <PageContainer width="wide">
      {/* Intro */}
      <div className="rounded-3xl border border-lummy-500 bg-hero-gradient p-6 sm:p-10">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
          <div>
            <h1 className="flex flex-col font-bold leading-[1.05] text-4xl md:text-5xl">
              <span className="text-neutral-black">Buy and sell tickets</span>
              <span className="text-primary-navy">without the fear.</span>
            </h1>
            <SubId className="mt-3 text-base">Beli-jual tiket konser tanpa takut ketipu.</SubId>
            <p className="text-neutral-gray mt-4 max-w-xl">
              Lummy Ticket started from a real problem: ticket resale in Indonesia runs on scalpers, wild prices, and
              manual bank transfers to strangers. We stand in the middle, so sellers can price fairly and buyers are
              not gambling their money on a DM.
            </p>
            <p className="text-neutral-gray mt-3 max-w-xl">
              Escrow and AI do the work backstage. Up front it feels like any normal app, with no crypto to learn.
              Your money is guarded by code, not by a promise.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Link href="/events"><Button.Primary className="flex items-center gap-2">Browse events <ArrowRight className="w-4 h-4" /></Button.Primary></Link>
              <Link href="/how-it-works"><Button.Secondary>How it works</Button.Secondary></Link>
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
          <TicketFeature key={p.title} Icon={p.Icon} title={p.title} body={p.body} />
        ))}
      </div>

      {/* Journey */}
      <div className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-black text-center">Protected from first click to final song</h2>
        <SubId className="text-center mt-2">Empat langkah, dana dijaga kode sepanjang jalan.</SubId>
        <div className="grid md:grid-cols-4 gap-5 mt-8">
          {journey.map((s) => (
            <div key={s.n} className="bg-neutral-white rounded-3xl border-2 border-lummy-500 p-6">
              <span className="font-fredoka font-bold text-lg w-10 h-10 rounded-2xl bg-primary-navy text-white grid place-items-center">{s.n}</span>
              <h3 className="font-fredoka font-semibold text-neutral-black mt-4">{s.title}</h3>
              <p className="text-sm text-neutral-gray mt-2">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charter */}
      <div className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-black">What we commit to</h2>
        <SubId className="mt-1">Janji kami.</SubId>
        <div className="grid sm:grid-cols-2 gap-5 mt-6">
          {charter.map((c) => (
            <div key={c.title} className="border-l-2 border-lummy-500 pl-4 py-1">
              <h3 className="font-fredoka font-semibold text-neutral-black">{c.title}</h3>
              <SubId className="text-xs">{c.sub}</SubId>
              <p className="text-sm text-neutral-gray mt-1.5">{c.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <TicketBand className="mt-16">
        <div className="flex flex-col items-center text-center gap-4">
          <h2 className="text-2xl md:text-3xl font-bold">Ready to find your ticket?</h2>
          <p className="text-white/85 max-w-lg">Verified resale tickets, every one of them held in escrow until the show is over.</p>
          <Link href="/events"><Button.Secondary className="flex items-center gap-2">Browse events <ArrowRight className="w-4 h-4" /></Button.Secondary></Link>
        </div>
      </TicketBand>
    </PageContainer>
  );
}
