"use client";

import { useT } from "@/lib/i18n";

// Branded full-area loader. Used as the App Router `loading.tsx` fallback so
// route transitions show this instead of the previous page lingering.
export default function LoadingScreen() {
    const t = useT();
    return (
        <div className="w-full min-h-[70vh] flex flex-col items-center justify-center gap-6 animate-fade-in">
            <div className="w-14 h-14 rounded-full border-4 border-secondary-blue-light border-t-lummy-500 animate-spin" />
            <span className="text-neutral-gray text-sm xl:text-base animate-pulse">{t("Loading…", "Memuat…")}</span>
        </div>
    );
}
