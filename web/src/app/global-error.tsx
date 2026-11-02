"use client";

// What a visitor sees when a page fails so badly that the root layout goes with it. It replaces the
// layout, so it brings its own <html>, <body> and styles, and none of the header, footer or
// providers; the way home is a plain link, a full page load, not the router that just failed. The
// error goes to the browser's own error handlers through reportError(), where Sentry, when the build
// has it (docs/config/06-monitoring.md), takes it like any uncaught error; without Sentry the
// browser only logs it, and this file loads no Sentry code either way.
import "./globals.css";
import Image from "next/image";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useActiveLang, useT } from "@/lib/i18n";

// Written out rather than imported from the legal pages, whose code would then load with every page.
const CONTACT_EMAIL = "team@lummy.id";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();
  const lang = useActiveLang();
  useEffect(() => {
    if (typeof reportError === "function") reportError(error);
  }, [error]);
  return (
    <html lang={lang}>
      <body className="antialiased min-h-screen flex flex-col">
        <title>{t("Something went wrong | Lummy", "Terjadi kesalahan | Lummy")}</title>
        <main className="max-w-xl mx-auto px-5 pt-36 pb-24 text-center flex flex-col items-center">
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
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load on purpose, not the router that just failed */}
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-2xl border-2 border-neutral-light-gray-1 bg-neutral-white px-5 py-3.5 font-semibold text-neutral-gray transition hover:border-primary-navy hover:text-primary-navy -translate-y-0.5"
            >
              {t("Go home", "Ke beranda")}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
