"use client";

import { useT } from "@/lib/i18n";
import { FEATURES } from "@/lib/features";

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
    <div data-test-mode className="fixed z-50 top-0 inset-x-0 h-6 bg-primary-navy-dark text-white text-[11px] font-medium flex items-center justify-center px-4">
      <p className="truncate">
        <span className="sm:hidden">{t("Prototype: test payments only, sample listings.", "Prototipe: pembayaran uji, listing contoh.")}</span>
        <span className="hidden sm:inline">
          {t(
            "Prototype: QRIS in Xendit's test mode, USDC on testnet, and the listings are samples. No real money moves.",
            "Prototipe: QRIS di mode test Xendit, USDC di testnet, dan listing-nya contoh. Tidak ada uang sungguhan yang berpindah."
          )}
        </span>
      </p>
    </div>
  );
}
