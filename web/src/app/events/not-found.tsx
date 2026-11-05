"use client";

import Link from "next/link";
import Image from "next/image";
import { useT } from "@/lib/i18n";

/**
 * A show that is not on Lummy, or no longer: a wrong or old link, or a show the organiser cancelled,
 * which leaves the catalogue. Sent with HTTP 404 (events/[id]/layout.tsx).
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
        {/* Plain links, not buttons inside links (UX review 5 Nov 2026) */}
        <Link
          href="/events"
          className="inline-flex items-center justify-center rounded-2xl border-2 border-lummy-500 bg-primary-sky px-6 py-3.5 font-semibold text-primary-navy-dark shadow-[4px_4px_0_#0D3B9A] transition hover:bg-primary-navy hover:text-neutral-white"
        >
          {t("Browse events", "Jelajah event")}
        </Link>
        <Link
          href="/tickets"
          className="inline-flex items-center justify-center rounded-2xl border-2 border-neutral-light-gray-1 bg-neutral-white px-5 py-3.5 font-semibold text-neutral-gray transition hover:border-primary-navy hover:text-primary-navy"
        >
          {t("My tickets", "Tiket saya")}
        </Link>
      </div>
    </div>
  );
}
