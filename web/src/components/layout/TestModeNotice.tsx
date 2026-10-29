"use client";

import { CONTACT_EMAIL } from "@/components/legal/LegalPage";
import { useT } from "@/lib/i18n";
import { FEATURES } from "@/lib/features";

/** Feedback goes to the team inbox, with the page it was sent from (tasks 11.7). */
export function feedbackHref(page?: string) {
  const subject = encodeURIComponent("Masukan beta Lummy");
  const body = page ? `&body=${encodeURIComponent(`Halaman: ${page}\n\n`)}` : "";
  return `mailto:${CONTACT_EMAIL}?subject=${subject}${body}`;
}

/**
 * On while the site takes test money or shows sample listings (lib/features.ts). The strip is 24px
 * (h-6), so while it shows the navbar sits at top-6 and whatever docks under the navbar moves down
 * with it (the phone menu, the How it works tabs, the sticky sidebars).
 */
export const TEST_MODE = !FEATURES.payouts || !FEATURES.realListings;

/**
 * The first screen says the money is test money (QA, 24 Oct 2026): a visitor who reads only the
 * top of the page should not take the QRIS code, the USDC or the listings for the real thing. One
 * line, shorter on a phone, so it never pushes the navbar around.
 */
export function TestModeNotice() {
  const t = useT();
  if (!TEST_MODE) return null;
  return (
    <div data-test-mode className="fixed z-50 top-0 inset-x-0 h-6 bg-primary-navy-dark text-white text-[11px] font-medium flex items-center justify-center gap-3 px-4">
      {/* A span, not a p: the global p style would set its own colour and size. */}
      <span className="block truncate">
        <span className="sm:hidden">{t("Beta: test payments, no real money.", "Beta: pembayaran uji, tanpa uang sungguhan.")}</span>
        <span className="hidden sm:inline">
          {t(
            "Beta: QRIS in Xendit's test mode and USDC on testnet, so no real money moves. Some listings are samples.",
            "Beta: QRIS di mode uji Xendit dan USDC di testnet, jadi tidak ada uang sungguhan yang berpindah. Sebagian listing masih contoh."
          )}
        </span>
      </span>
      <a
        data-feedback
        href={feedbackHref()}
        onClick={(e) => { e.currentTarget.href = feedbackHref(window.location.href); }}
        className="shrink-0 underline underline-offset-2 text-white hover:opacity-80"
      >
        {t("Feedback", "Kasih masukan")}
      </a>
    </div>
  );
}
