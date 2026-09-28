"use client";

import { FlaskConical } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * Marks a part of a page that still runs on sample data for someone signed in with a real
 * account, so nothing sample passes for their own record.
 */
export function SampleBadge({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <span
      data-sample-badge
      title={t("This part still runs on sample data and is not saved to your account yet.", "Bagian ini masih memakai data contoh dan belum tersimpan ke akunmu.")}
      className={`inline-flex items-center gap-1 rounded-full bg-secondary-gold-soft text-secondary-brown-dark text-[11px] font-medium font-sans px-2 py-0.5 ${className}`}
    >
      <FlaskConical className="w-3 h-3" /> {t("Sample data", "Data contoh")}
    </span>
  );
}
