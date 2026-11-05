"use client";

// What a visitor sees when one page fails: it takes the page's place inside the layout, so the bar,
// the footer and the signed-in account stay, and Try again re-renders just this page. A failure of
// the root layout itself goes to global-error.tsx instead. Before this file, any page error took the
// whole layout down with it (UX review 5 Nov 2026, O2). The error is reported the way global-error
// reports it: through reportError(), which Sentry takes when the build has it.
import Image from "next/image";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

// Written out rather than imported from the legal pages, as in global-error.tsx.
const CONTACT_EMAIL = "team@lummy.id";

export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    if (typeof reportError === "function") reportError(error);
  }, [error]);
  return (
    <div className="max-w-xl mx-auto px-5 pt-36 pb-24 text-center flex flex-col items-center min-h-[80svh]">
      <Image src="/assets/brand/maskot-bingung.svg" alt="" width={176} height={150} priority />
      <h1 className="mt-6 text-3xl md:text-4xl font-bold text-neutral-black">{t("Something went wrong", "Terjadi kesalahan")}</h1>
      <p className="mt-2 text-neutral-gray">
        {t(
          `This page could not load. Try again, or go back home; if it keeps happening, tell us at ${CONTACT_EMAIL}.`,
          `Halaman ini gagal dimuat. Coba lagi, atau kembali ke beranda; kalau terus terjadi, kabari kami di ${CONTACT_EMAIL}.`,
        )}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button.Primary onClick={() => retry()}>{t("Try again", "Coba lagi")}</Button.Primary>
        <Button.GhostLink href="/">{t("Go home", "Ke beranda")}</Button.GhostLink>
      </div>
    </div>
  );
}
