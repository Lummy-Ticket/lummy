"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Lang = "en" | "id";

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
}

// English is the default. Indonesian is the alternate the audience can switch to.
export const useLang = create<LangState>()(
  persist(
    (set, get) => ({
      lang: "en",
      setLang: (lang) => set({ lang }),
      toggle: () => set({ lang: get().lang === "en" ? "id" : "en" }),
    }),
    { name: "lummy:lang" }
  )
);

/**
 * Current language, hydration-safe.
 *
 * React calls the server snapshot while hydrating, so the first client render
 * matches the HTML that was sent (always English) and only then swaps to the
 * stored choice. That avoids a hydration mismatch without an effect.
 */
export function useActiveLang(): Lang {
  return useSyncExternalStore(
    useLang.subscribe,
    () => useLang.getState().lang,
    () => "en" as Lang
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
      // Rupiah either way; only the digit grouping follows the language.
      formatIDR: (n: number) => `IDR ${n.toLocaleString(lang === "id" ? "id-ID" : "en-US")}`,
      formatCountdown: (ms: number) => {
        const [h, m, sec] = lang === "id" ? ["j", "m", "d"] : ["h", "m", "s"];
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
