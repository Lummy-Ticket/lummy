"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/**
 * A show that is not on Lummy, or no longer: a wrong or old link, or a show the organiser cancelled,
 * which leaves the catalogue. Sent by events/[id]/layout.tsx with a noindex; the status stays 200
 * while the root loading.tsx streams the shell first.
 */
export default function ShowNotFound() {
  const t = useT();
  return (
    <div className="max-w-xl mx-auto px-5 pt-36 pb-24 text-center flex flex-col items-center">
      <Image src="/assets/brand/maskot-bingung.svg" alt="" width={176} height={150} priority />
      <h1 className="mt-6 text-3xl md:text-4xl font-bold text-neutral-black">{t("This show is not on Lummy", "Acara ini tidak ada di Lummy")}</h1>
      <p className="mt-2 text-neutral-gray">
        {t(
          "The link may be wrong or old, or the organiser cancelled the show. A ticket bought for a cancelled show is refunded automatically; you can follow it in My tickets.",
          "Mungkin link-nya salah atau sudah lama, atau acaranya dibatalkan penyelenggara. Tiket yang sudah dibeli untuk acara yang batal dikembalikan otomatis; statusnya ada di Tiket saya."
        )}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {/* The same shapes as the site-wide not-found page, each drawn as one link */}
        <Button.PrimaryLink href="/events">{t("Browse events", "Jelajah event")}</Button.PrimaryLink>
        <Button.GhostLink href="/tickets">{t("My tickets", "Tiket saya")}</Button.GhostLink>
      </div>
    </div>
  );
}
