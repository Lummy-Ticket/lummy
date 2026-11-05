"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Currency } from "@/lib/mock/types";
import { USDC_UNIT } from "@/lib/mock/util";
import { LANG_COOKIE, pickLang, type Lang } from "@/lib/lang";

export type { Lang };

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
}

/**
 * A first visit follows the browser: Indonesian when it is the browser's first language, English
 * otherwise (lib/lang.ts, pickLang). The language cookie, when there is one, wins, as it does on the
 * server, and a choice made with the switch is stored and written to it.
 */
function firstLang(): Lang {
  if (typeof window === "undefined") return "en";
  const cookie = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=(en|id)`))?.[1];
  return pickLang(cookie, navigator.languages?.[0] ?? navigator.language ?? "");
}

/** What the server renders with on the next request, a year at a time. */
function writeLangCookie(lang: Lang) {
  if (typeof document === "undefined") return;
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export const useLang = create<LangState>()(
  persist(
    (set, get) => ({
      lang: firstLang(),
      setLang: (lang) => set({ lang }),
      toggle: () => set({ lang: get().lang === "en" ? "id" : "en" }),
    }),
    {
      name: "lummy:lang",
      // A choice stored before the cookie existed reaches the server from the next page on.
      onRehydrateStorage: () => (state) => {
        if (state) writeLangCookie(state.lang);
      },
    }
  )
);
if (typeof window !== "undefined") useLang.subscribe((s) => writeLangCookie(s.lang));

/** The language the server rendered this page in (components/layout/LangProvider.tsx). */
export const ServerLang = createContext<Lang>("en");

/**
 * Current language, hydration-safe.
 *
 * React calls the server snapshot while hydrating, so the first client render
 * matches the HTML that was sent. The server rendered in the language the cookie
 * or the browser asked for (app/layout.tsx), so after hydration the stored choice
 * is the same language and nothing swaps; it only differs for a choice stored
 * before the cookie existed, and then only once.
 */
export function useActiveLang(): Lang {
  const server = useContext(ServerLang);
  return useSyncExternalStore(
    useLang.subscribe,
    () => useLang.getState().lang,
    () => server
  );
}

/** Keeps <html lang> in step with the switch, so screen readers pronounce the right language. */
export function useDocumentLang() {
  const lang = useActiveLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
}

/**
 * Inline translator: t("English copy", "Salinan Indonesia").
 *
 * Copy stays next to the markup it belongs to, so a missing translation shows
 * up in review instead of hiding behind a key in a dictionary file.
 */
export function useT() {
  const lang = useActiveLang();
  return useCallback((en: string, id: string) => (lang === "id" ? id : en), [lang]);
}

/** Shows happen in Indonesia, so their dates read in Jakarta time wherever the visitor is. */
export const EVENT_TZ = "Asia/Jakarta";

/**
 * Formatters bound to the active language, so dates and amounts follow the
 * switch as well as the words do. Every component that renders one of these
 * already subscribes to the language, so they re-render together.
 */
export function useFormatters() {
  const lang = useActiveLang();
  return useMemo(() => {
    const locale = lang === "id" ? "id-ID" : "en-GB";
    return {
      formatEventDate: (iso: string) =>
        new Date(iso).toLocaleDateString(locale, {
          weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: EVENT_TZ,
        }),
      formatDateTime: (iso: string) =>
        new Date(iso).toLocaleString(locale, {
          day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        }),
      // Rupiah either way, written Rp1.250.000 as the brand guideline 1.0 asks (IDR 1.250.000
      // before 19 Oct 2026); only the digit grouping follows the language.
      formatIDR: (n: number) => `Rp${n.toLocaleString(lang === "id" ? "id-ID" : "en-US")}`,
      /** An amount in the show's own money: rupiah, or micro-USDC written as USDC with cents. */
      formatMoney: (n: number, currency?: Currency) =>
        currency === "USDC"
          ? `${(n / USDC_UNIT).toLocaleString(lang === "id" ? "id-ID" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
          : `Rp${n.toLocaleString(lang === "id" ? "id-ID" : "en-US")}`,
      // Units spelled so they cannot be misread: "41j 51m 41d" read as 41 days, since "d" is
      // detik only to someone who already knows (QA, 24 Oct).
      formatCountdown: (ms: number) => {
        const [h, m, sec] = lang === "id" ? [" jam", " mnt", " dtk"] : ["h", "m", "s"];
        if (!Number.isFinite(ms) || ms <= 0) return `00${h} 00${m} 00${sec}`;
        const total = Math.floor(ms / 1000);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${pad(Math.floor(total / 3600))}${h} ${pad(Math.floor((total % 3600) / 60))}${m} ${pad(total % 60)}${sec}`;
      },
    };
  }, [lang]);
}

/**
 * Category names are stored in English because they double as filter values and
 * deep-link params. Only the label a person reads is translated.
 */
const CATEGORY_ID: Record<string, string> = {
  Music: "Musik",
  Sports: "Olahraga",
  Theater: "Teater",
  Arts: "Seni",
  Technology: "Teknologi",
  Education: "Edukasi",
  Food: "Kuliner",
  Movies: "Film",
};

export function useCategoryLabel() {
  const t = useT();
  return useCallback((c: string) => t(c, CATEGORY_ID[c] ?? c), [t]);
}
