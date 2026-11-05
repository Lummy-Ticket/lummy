"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export default function NotFound() {
  const t = useT();
  return (
    <div className="max-w-xl mx-auto px-5 pt-36 pb-24 text-center flex flex-col items-center">
      <Image src="/assets/brand/maskot-bingung.svg" alt="" width={176} height={150} priority />
      <h1 className="mt-6 text-3xl md:text-4xl font-bold text-neutral-black">{t("This page is not on the list", "Halaman ini tidak ada")}</h1>
      <p className="mt-2 text-neutral-gray">
        {t("The link may be old, or the show may have ended.", "Mungkin link-nya sudah lama, atau acaranya sudah lewat.")}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button.PrimaryLink href="/events">{t("Browse events", "Jelajah event")}</Button.PrimaryLink>
        <Button.GhostLink href="/">{t("Go home", "Ke beranda")}</Button.GhostLink>
      </div>
    </div>
  );
}
