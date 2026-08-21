"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useLang, useActiveLang, type Lang } from "@/lib/i18n";

const OPTIONS: { id: Lang; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "id", label: "ID" },
];

/**
 * Language switch. English is the default; Indonesian is one tap away for the
 * local audience. Kept as a visible segmented control rather than a dropdown so
 * it reads as a first-class choice.
 */
export function LangToggle({ className }: { className?: string }) {
  const setLang = useLang((s) => s.setLang);
  const lang = useActiveLang();

  // Keep the document language in sync for screen readers and translation tools.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div
      role="group"
      aria-label="Language / Bahasa"
      className={cn("flex items-center gap-0.5 rounded-full border border-lummy-500 bg-neutral-white p-0.5", className)}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => setLang(o.id)}
          aria-pressed={lang === o.id}
          className={cn(
            "px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer",
            lang === o.id ? "bg-primary-navy text-white" : "text-neutral-gray hover:text-primary-navy"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
