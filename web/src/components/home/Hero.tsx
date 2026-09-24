"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { HeroSearch } from "./HeroSearch";
import { useT } from "@/lib/i18n";
import { CAP_PCT } from "@/lib/mock";

// Background of the hero section. The notches reuse it so they read as bites taken out
// of the ticket rather than circles drawn on top of it.
const BG = "bg-secondary-blue-light";

/** Half a circle cut into the ticket's edge, with the ticket's own outline. */
function Notch({ className, side }: { className: string; side: "top" | "bottom" | "left" | "right" }) {
  const clip = {
    top: "[clip-path:inset(50%_0_0_0)]",
    bottom: "[clip-path:inset(0_0_50%_0)]",
    left: "[clip-path:inset(0_0_0_50%)]",
    right: "[clip-path:inset(0_50%_0_0)]",
  }[side];
  return <span aria-hidden className={`absolute z-10 w-9 h-9 rounded-full border-2 border-primary-navy ${BG} ${clip} ${className}`} />;
}

// The hero is the brand's own object: a ticket. Main part carries the promise and the
// search; the stub carries the terms, the way a real ticket prints section, row and seat.
export function Hero({ quickCats }: { quickCats: string[] }) {
  const t = useT();
  const terms = [
    { label: t("Your money", "Uangmu"), value: t("Held in escrow", "Ditahan escrow") },
    { label: t("Seller is paid", "Penjual dibayar"), value: t("After the show", "Setelah acara") },
    { label: t("Price cap", "Batas harga"), value: t(`${CAP_PCT}% of face value`, `${CAP_PCT}% harga asli`) },
    { label: t("Every ticket", "Tiap tiket"), value: t("Checked by AI", "Dicek AI") },
  ];

  return (
    <section className={`${BG} pt-28 lg:pt-36 pb-14 lg:pb-20`}>
      <div className="max-w-7xl mx-auto px-5 lg:px-10">
        <div className="relative motion-safe:animate-rise">
          <Image
            src="/assets/images/mascot.png"
            alt=""
            width={418}
            height={401}
            loading="eager"
            className="hidden lg:block absolute -top-[62px] right-[118px] w-28 h-auto pointer-events-none"
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] rounded-[32px] border-2 border-primary-navy bg-neutral-white shadow-[6px_6px_0px_#245397]">
            {/* Main part */}
            <div className="px-5 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-14 flex flex-col gap-6">
              {/* Two set lines from tablet up; on a phone the words wrap where they fit */}
              <h1 className="font-bold leading-[1.05] text-[2.15rem] sm:text-6xl xl:text-7xl tracking-tight">
                <span className="text-neutral-black sm:block">{t("Buy resale tickets", "Beli tiket resale")}</span>{" "}
                <span className="text-primary-navy sm:block">{t("without the fear.", "tanpa takut ketipu.")}</span>
              </h1>
              <p className="text-lg text-neutral-gray max-w-md">
                {t(
                  "The seller only gets paid after the show. Turned away at the gate with proof? Your money comes back.",
                  "Penjual baru dibayar setelah acara selesai. Ditolak di gate dengan bukti? Uangmu kembali."
                )}
              </p>
              <HeroSearch quickCats={quickCats} />
              <Link href="/sell" className="group inline-flex flex-wrap items-center gap-x-1.5 text-sm text-neutral-gray hover:text-primary-navy transition w-fit">
                {t("Selling instead?", "Mau jual?")}
                <span className="font-semibold text-primary-navy inline-flex items-center gap-1">
                  {t("List a ticket in a few minutes", "Pasang tiket dalam beberapa menit")}
                  <ArrowRight className="w-4 h-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </div>

            {/* Perforation: horizontal on a phone, vertical from desktop up */}
            <div aria-hidden className="relative lg:hidden mx-5 sm:mx-10 border-t-2 border-dashed border-neutral-light-gray-1">
              <Notch side="left" className="-left-[39px] sm:-left-[59px] -top-[17px]" />
              <Notch side="right" className="-right-[39px] sm:-right-[59px] -top-[17px]" />
            </div>
            <div aria-hidden className="hidden lg:block absolute top-6 bottom-6 right-[300px] border-l-2 border-dashed border-neutral-light-gray-1" />
            <Notch side="top" className="hidden lg:block -top-[19px] right-[282px]" />
            <Notch side="bottom" className="hidden lg:block -bottom-[19px] right-[282px]" />

            {/* Stub: the terms, printed like section, row and seat */}
            <div className="bg-secondary-cream-light rounded-b-[30px] lg:rounded-bl-none lg:rounded-r-[30px] px-5 py-7 sm:px-10 lg:px-8 lg:py-10 flex flex-col">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary-brown-dark/70">
                {t("Lummy resale · Terms", "Lummy resale · Ketentuan")}
              </div>
              <dl className="mt-5 grid grid-cols-2 lg:grid-cols-1 gap-x-6 gap-y-4 lg:gap-y-5">
                {terms.map((x) => (
                  <div key={x.label}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-gray">{x.label}</dt>
                    <dd className="font-fredoka font-semibold text-lg text-neutral-black leading-tight mt-0.5">{x.value}</dd>
                  </div>
                ))}
              </dl>
              {/* Barcode, drawn with stripes rather than an image */}
              <div className="mt-7 lg:mt-auto lg:pt-8">
                <div
                  aria-hidden
                  className="h-11 w-full rounded-sm bg-[repeating-linear-gradient(90deg,#333_0_2px,transparent_2px_4px,#333_4px_5px,transparent_5px_8px,#333_8px_11px,transparent_11px_13px)] opacity-80"
                />
                <div className="mt-2 flex justify-between font-mono text-[10px] tracking-widest text-neutral-gray">
                  <span>LMY-0001</span>
                  <span>lummy.id</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
