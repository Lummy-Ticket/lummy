"use client";

import { ServerLang } from "@/lib/i18n";
import type { Lang } from "@/lib/lang";

/** The language the server rendered in, which the first client render must match (lib/i18n.ts). */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <ServerLang.Provider value={lang}>{children}</ServerLang.Provider>;
}
