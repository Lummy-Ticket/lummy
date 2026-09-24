"use client";

import Link from "next/link";
import Image from "next/image";
import { Check, Lock, Clock, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEED_LISTINGS, CAP_PCT, getEventById, getTier } from "@/lib/mock";
import { useT, useFormatters } from "@/lib/i18n";

// The hero shows the product instead of describing it: one real listing from the
// catalogue, and where the buyer's money sits while they wait for the show.
const LISTING = SEED_LISTINGS.find((l) => l.id === "ls-6")!;
const EVENT = getEventById(LISTING.eventId)!;
const TIER = getTier(EVENT, LISTING.tierId)!;
const MARKUP = Math.round((LISTING.askPrice / LISTING.faceValue - 1) * 100);

function Step({ state, Icon, label, sub }: { state: "done" | "now" | "next"; Icon: typeof Lock; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-1.5 min-w-0">
      <span
        className={cn(
          "relative w-9 h-9 rounded-full grid place-items-center border-2",
          state === "done" && "bg-primary-navy border-primary-navy text-white",
          state === "now" && "bg-primary-sky border-primary-navy text-primary-navy-dark",
          state === "next" && "bg-neutral-white border-dashed border-neutral-light-gray-1 text-neutral-gray"
        )}
      >
        {state === "now" && <span aria-hidden className="absolute inset-0 rounded-full border-2 border-primary-navy motion-safe:animate-ping opacity-40" />}
        <Icon className="w-4 h-4" />
      </span>
      <span className={cn("text-xs font-semibold leading-tight", state === "next" ? "text-neutral-gray" : "text-neutral-black")}>{label}</span>
      <span className="text-[11px] text-neutral-gray leading-tight">{sub}</span>
    </div>
  );
}

export function HeroTicket() {
  const t = useT();
  const { formatIDR, formatEventDate } = useFormatters();

  return (
    <div className="relative mx-auto w-full max-w-[400px] lg:max-w-[420px] motion-safe:animate-rise [animation-delay:120ms]">
      <div className="relative motion-safe:animate-float">
        <Link
          href={`/events/${EVENT.id}`}
          aria-label={t(`${EVENT.title}, ${TIER.name}, see listings`, `${EVENT.title}, ${TIER.name}, lihat listing`)}
          className="group relative block -rotate-2 bg-neutral-white rounded-3xl border-2 border-primary-navy shadow-[6px_6px_0px_#245397] transition-transform duration-300 hover:rotate-0"
        >
          <div className="p-3 pb-0">
            <div className="relative aspect-[16/9] rounded-2xl overflow-hidden border border-lummy-500">
              <Image src={EVENT.image} alt="" fill sizes="420px" className="object-cover" priority />
            </div>
            <div className="px-2 pt-3 pb-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-navy">
                {formatEventDate(EVENT.dateISO)} · {EVENT.venue}
              </div>
              <div className="font-fredoka font-semibold text-lg text-neutral-black leading-snug mt-0.5 truncate">{EVENT.title}</div>
              <div className="flex items-end justify-between gap-3 mt-2">
                <div className="min-w-0">
                  <div className="text-sm text-neutral-black">
                    {TIER.name} · {t(`${LISTING.quantity} seats together`, `${LISTING.quantity} kursi bersebelahan`)}
                  </div>
                  <div className="text-[11px] text-neutral-gray mt-0.5">
                    {t(`+${MARKUP}% over face value, cap ${CAP_PCT}%`, `+${MARKUP}% dari harga asli, maks ${CAP_PCT}%`)}
                  </div>
                </div>
                <span className="font-fredoka font-bold text-xl text-primary-navy leading-none text-nowrap">{formatIDR(LISTING.askPrice)}</span>
              </div>
            </div>
          </div>

          {/* Perforation: notches bite into the ticket from both sides */}
          <div className="relative h-0 border-t-2 border-dashed border-neutral-light-gray-1 mx-5" aria-hidden>
            <span className="absolute -left-[34px] -top-[13px] w-6 h-6 rounded-full bg-[#e3f1fd] border-2 border-primary-navy [clip-path:inset(0_0_0_50%)]" />
            <span className="absolute -right-[34px] -top-[13px] w-6 h-6 rounded-full bg-[#e3f1fd] border-2 border-primary-navy [clip-path:inset(0_50%_0_0)]" />
          </div>

          {/* Stub: where the buyer's money is right now */}
          <div className="px-5 pt-4 pb-5">
            <div className="text-[11px] font-medium text-neutral-gray mb-3">{t("Where your money is", "Posisi uangmu")}</div>
            <div className="relative grid grid-cols-3 gap-2">
              <span aria-hidden className="absolute top-[18px] left-[16.66%] right-[50%] border-t-2 border-primary-navy" />
              <span aria-hidden className="absolute top-[18px] left-[50%] right-[16.66%] border-t-2 border-dashed border-neutral-light-gray-1" />
              <div className="relative"><Step state="done" Icon={Check} label={t("Paid", "Dibayar")} sub="QRIS" /></div>
              <div className="relative"><Step state="now" Icon={Lock} label={t("In escrow", "Di escrow")} sub={t("until the show ends", "sampai acara selesai")} /></div>
              <div className="relative"><Step state="next" Icon={Clock} label={t("To the seller", "Ke penjual")} sub={t("after the show", "setelah acara")} /></div>
            </div>
          </div>
        </Link>
      </div>

      {/* The mascot leans on the ticket's corner */}
      <Image
        src="/assets/images/mascot.png"
        alt=""
        width={128}
        height={123}
        loading="eager"
        className="hidden lg:block absolute -left-24 -bottom-8 z-20 -rotate-6 drop-shadow-md pointer-events-none"
      />

      {/* What was checked before this listing went live */}
      <div className="absolute -left-3 sm:-left-12 -top-5 z-20 motion-safe:animate-rise [animation-delay:450ms]">
        <div className="flex items-center gap-2 rounded-2xl border-2 border-primary-navy bg-neutral-white px-3 py-2 shadow-[3px_3px_0px_#245397] -rotate-3">
          <span className="w-7 h-7 rounded-lg bg-secondary-green-light text-secondary-green-dark grid place-items-center shrink-0">
            <ScanLine className="w-4 h-4" />
          </span>
          <div className="leading-tight">
            <div className="text-xs font-semibold text-neutral-black">{t("AI check passed", "Lolos cek AI")}</div>
            <div className="text-[11px] text-neutral-gray">{t(`Forgery score ${LISTING.ai.forgeryScore}/100`, `Skor pemalsuan ${LISTING.ai.forgeryScore}/100`)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
