"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useFormatters, useT } from "@/lib/i18n";
import type { CancelledShow as Show } from "@/lib/supabase/catalogue";

/**
 * A show its organiser cancelled. It stays out of the catalogue and is never listed or sold again,
 * but a link to it, from an order, an email or a search, says what happened and where the money is,
 * rather than "not on Lummy" (UX review 5 Nov 2026, decision 5). Sent by events/[id]/layout.tsx with
 * a noindex.
 */
export function CancelledShow({ show }: { show: Show }) {
  const t = useT();
  const { formatEventDate } = useFormatters();
  const when = formatEventDate(show.dateISO);
  const where = [show.venue, show.city].filter(Boolean).join(", ");
  const on = show.cancelledAt ? formatEventDate(show.cancelledAt) : null;
  return (
    <div data-cancelled-show className="max-w-xl mx-auto px-5 pt-36 pb-24 text-center flex flex-col items-center">
      <Image src="/assets/brand/maskot-bingung.svg" alt="" width={176} height={150} priority />
      <h1 className="mt-6 text-3xl md:text-4xl font-bold text-neutral-black">{t("This show was cancelled", "Acara ini dibatalkan")}</h1>
      <p className="mt-3 font-medium text-neutral-black">{show.title}</p>
      <p className="text-sm text-neutral-gray">{[where, when].filter(Boolean).join(" · ")}</p>
      <p className="mt-4 text-neutral-gray">
        {on
          ? t(`The organiser cancelled it, and Lummy closed its sales on ${on}.`, `Penyelenggara membatalkannya, dan Lummy menutup penjualannya pada ${on}.`)
          : t("The organiser cancelled it, and Lummy closed its sales.", "Penyelenggara membatalkannya, dan Lummy menutup penjualannya.")}{" "}
        {t(
          "Every ticket bought for it on Lummy is refunded automatically, with no penalty for the seller; you can follow yours in My tickets.",
          "Setiap tiket yang dibeli lewat Lummy untuk acara ini dikembalikan otomatis, tanpa penalti untuk penjual; statusnya ada di Tiket saya."
        )}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button.PrimaryLink href="/tickets">{t("My tickets", "Tiket saya")}</Button.PrimaryLink>
        <Button.GhostLink href="/events">{t("Browse events", "Jelajah event")}</Button.GhostLink>
      </div>
    </div>
  );
}
