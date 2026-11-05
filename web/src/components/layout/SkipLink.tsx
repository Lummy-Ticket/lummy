"use client";

import { useT } from "@/lib/i18n";

/**
 * The first stop for Tab on every page: past the beta strip, the bar, the search and its suggestions
 * straight to the page itself (14 stops on How it works before, UX review 5 Nov 2026). Hidden until
 * it has focus, then it shows above the bar.
 */
export function SkipLink() {
  const t = useT();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-xl focus:bg-neutral-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-primary-navy focus:shadow-lummy-lg"
    >
      {t("Skip to content", "Langsung ke isi")}
    </a>
  );
}
