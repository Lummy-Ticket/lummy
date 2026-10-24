"use client";

import type React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Wallet } from "lucide-react";
import { HeroSearch } from "./HeroSearch";
import { useT } from "@/lib/i18n";
import { Notch } from "@/components/ui/notch";
import { CAP_PCT, useUser } from "@/lib/mock";
import { useHydrated } from "@/lib/access";
import { TEST_MODE } from "@/components/layout/TestModeNotice";

// Background of the hero section. The notches reuse it so they read as bites taken out
// of the ticket rather than circles drawn on top of it.
const BG = "bg-secondary-blue-light";
const NOTCH = `w-9 h-9 border-2 border-primary-navy ${BG}`;

// The hero is the brand's own object: a ticket. Main part carries the promise and the
// search; the stub carries the terms, the way a real ticket prints section, row and seat.
export function Hero({ quickCats }: { quickCats: string[] }) {
  const t = useT();
  const user = useUser((s) => s.user);
  // The stored user only after hydration, so the server and the first client render agree.
  const me = useHydrated() ? user : null;
  const terms = [
    { label: t("Your money", "Uangmu"), value: t("Held in escrow", "Ditahan escrow") },
    { label: t("Seller is paid", "Penjual dibayar"), value: t("After the show", "Setelah acara") },
    { label: t("Price cap", "Batas harga"), value: t(`${CAP_PCT}% of face value`, `${CAP_PCT}% harga asli`) },
    { label: t("Every ticket", "Tiap tiket"), value: t("Checked before sale", "Dicek sebelum dijual") },
  ];

  return (
    // Under the test-mode strip the navbar sits 24px lower, so on a laptop the ticket does too,
    // keeping the mascot on its edge clear of the navbar.
    <section className={`${BG} pt-28 ${TEST_MODE ? "lg:pt-[168px]" : "lg:pt-36"} pb-14 lg:pb-20`}>
      <div className="max-w-7xl mx-auto px-5 lg:px-10">
        <div className="relative motion-safe:animate-rise">
          <Image
            src="/assets/brand/maskot-halo-tanpa-bayangan.svg"
            alt=""
            width={240}
            height={205}
            loading="eager"
            className="hidden lg:block absolute -top-[70px] right-[104px] w-36 h-auto pointer-events-none"
          />

          {/* The offset shadow is its own layer, so the bottom notch can bite it too. On a
              phone it only drops straight down: the side notches then have no shadow
              band to run into. */}
          <div aria-hidden className="absolute inset-0 rounded-[32px] bg-primary-navy-dark translate-y-1.5 lg:translate-x-1.5" />

          <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] rounded-[32px] border-2 border-primary-navy bg-neutral-white">
            {/* Main part */}
            <div className="px-5 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-14 flex flex-col gap-6">
              {/* Two set lines, each sliding up out of its own clip */}
              <h1 className="font-fredoka font-semibold leading-[1.05] text-[2.15rem] sm:text-6xl xl:text-7xl tracking-tight">
                <span className="lm-line text-neutral-black"><span>{t("Buy resale tickets", "Beli tiket resale")}</span></span>{" "}
                <span className="lm-line text-primary-navy"><span style={{ "--i": 1 } as React.CSSProperties}>{t("without the fear.", "tanpa takut ketipu.")}</span></span>
              </h1>
              <p className="lm-in text-lg text-neutral-gray max-w-md" style={{ "--d": "260ms" } as React.CSSProperties}>
                {t(
                  "The seller only gets paid after the show. Turned away at the gate with proof? Your money comes back.",
                  "Penjual baru dibayar setelah acara selesai. Ditolak di gate dengan bukti? Uangmu kembali."
                )}
              </p>
              {/* The second rail (tasks/founder-house-usdc.md), said where every visitor starts. */}
              <p data-hero-usdc className="lm-in -mt-3 flex items-start gap-2 text-sm text-neutral-gray max-w-md" style={{ "--d": "300ms" } as React.CSSProperties}>
                <Wallet aria-hidden className="w-4 h-4 text-primary-navy shrink-0 mt-0.5" />
                {t(
                  "Shows abroad: pay test USDC from your own wallet. Two signatures, no gas to pay.",
                  "Acara di luar negeri: bayar USDC uji dari wallet-mu sendiri. Dua tanda tangan, tanpa bayar gas."
                )}
              </p>
              <div className="lm-in" style={{ "--d": "340ms" } as React.CSSProperties}>
                <HeroSearch quickCats={quickCats} />
              </div>
              <Link href="/sell" className="lm-in group inline-flex flex-wrap items-center gap-x-1.5 text-sm text-neutral-gray hover:text-primary-navy transition w-fit" style={{ "--d": "420ms" } as React.CSSProperties}>
                {t("Selling instead?", "Mau jual?")}
                <span className="font-semibold text-primary-navy inline-flex items-center gap-1">
                  {t("List a ticket in a few minutes", "Pasang tiket dalam beberapa menit")}
                  <ArrowRight className="w-4 h-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
              {/* The demo accounts sit on the sign-in page under the email form, which a first visit
                  (a judge, say) had no reason to open. Gone once anyone is signed in. */}
              {!me && (
                <Link href="/login" data-hero-demo className="lm-in -mt-3 group inline-flex flex-wrap items-center gap-x-1.5 text-sm text-neutral-gray hover:text-primary-navy transition w-fit" style={{ "--d": "460ms" } as React.CSSProperties}>
                  {t("Just looking?", "Cuma mau lihat-lihat?")}
                  <span className="font-semibold text-primary-navy inline-flex items-center gap-1">
                    {t("Try it with a demo account, no sign-up", "Coba pakai akun demo, tanpa daftar")}
                    <ArrowRight className="w-4 h-4 transition group-hover:translate-x-1" />
                  </span>
                </Link>
              )}
            </div>

            {/* Perforation: horizontal on a phone, vertical from desktop up */}
            <div aria-hidden className="relative lg:hidden mx-5 sm:mx-10 border-t-2 border-dashed border-neutral-light-gray-1">
              <Notch side="left" className={`${NOTCH} -left-[40px] sm:-left-[60px] -top-[17px]`} />
              <Notch side="right" className={`${NOTCH} -right-[40px] sm:-right-[60px] -top-[17px]`} />
            </div>
            <div aria-hidden className="hidden lg:block absolute top-6 bottom-6 right-[300px] border-l-2 border-dashed border-neutral-light-gray-1" />
            <Notch side="top" className={`${NOTCH} hidden lg:block -top-[20px] right-[283px]`} />
            {/* The bottom bite goes through the ticket and the shadow under it, so it is filled
                by one whole circle: two halves met at the edge and left a hairline seam there.
                Only the outline is cut to the half inside the ticket. */}
            <span aria-hidden className={`hidden lg:block absolute z-10 w-9 h-9 rounded-full ${BG} -bottom-[20px] right-[283px]`} />
            <Notch side="bottom" className="w-9 h-9 border-2 border-primary-navy hidden lg:block -bottom-[20px] right-[283px]" />

            {/* Stub: the terms, printed like section, row and seat */}
            <div className="bg-secondary-cream-light rounded-b-[30px] lg:rounded-bl-none lg:rounded-r-[30px] px-5 py-7 sm:px-10 lg:px-8 lg:py-10 flex flex-col">
              <div className="text-xs font-semibold text-secondary-brown-dark">
                {t("Lummy resale · Terms", "Lummy resale · Ketentuan")}
              </div>
              <dl className="mt-5 grid grid-cols-2 lg:grid-cols-1 gap-x-6 gap-y-4 lg:gap-y-5">
                {terms.map((x, i) => (
                  <div key={x.label} className="lm-in" style={{ "--i": i, "--d": "420ms" } as React.CSSProperties}>
                    <dt className="text-xs font-semibold text-neutral-gray">{x.label}</dt>
                    <dd className="font-semibold text-lg text-neutral-black leading-tight mt-0.5">{x.value}</dd>
                  </div>
                ))}
              </dl>
              {/* Barcode, drawn with stripes rather than an image. Every few seconds a scanner
                  line passes over it: the check every ticket goes through. */}
              <div className="mt-7 lg:mt-auto lg:pt-8">
                <div aria-hidden className="relative h-11 w-full overflow-hidden rounded-sm">
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,#333_0_2px,transparent_2px_4px,#333_4px_5px,transparent_5px_8px,#333_8px_11px,transparent_11px_13px)] opacity-80" />
                  <span className="lm-loop lm-scan absolute inset-0">
                    <span className="absolute -inset-y-1 left-0 w-[3px] rounded-full bg-primary-navy shadow-[0_0_10px_4px_rgba(177,231,255,0.95)]" />
                  </span>
                </div>
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
