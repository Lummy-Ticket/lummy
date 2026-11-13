"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CONTACT_EMAIL } from "@/components/legal/LegalPage";
import { useT } from "@/lib/i18n";
import { FEATURES } from "@/lib/features";
import { useUser } from "@/lib/mock";
import { useNearOptions } from "@/lib/payments/client";

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
  // /near shows the team's own payments in real USDC, so there the strip says whose money is real.
  const path = usePathname();
  const near = path?.startsWith("/near") ?? false;
  // A proof page shows one escrow on the chain it names, and on Arbitrum One that is real USDC:
  // "no real money moves" above it was wrong (10 Nov 2026).
  const proof = path?.startsWith("/proof") ?? false;
  // The list at /proof has no "Technical details" section; a single order's page does.
  const proofList = path === "/proof";
  // A team account pays real USDC on shows abroad (lib/near/team), so "no real money moves" is wrong for
  // it (T4, 10 Nov 2026). Asked only for a signed-in account; everyone else keeps the test-mode line.
  const account = useUser((s) => !!s.user?.account);
  const team = useNearOptions(account && !near)?.team === true;
  if (!TEST_MODE) return null;
  return (
    <div data-test-mode className="fixed z-50 top-0 inset-x-0 h-6 bg-primary-navy-dark text-white text-[11px] font-medium flex items-center justify-center gap-3 px-4">
      {/* A span, not a p: the global p style would set its own colour and size. */}
      <span className="block truncate">
        {/* Fits a 360px phone beside the link: the old line was 238px in a 238px space and lost its end */}
        <span className="sm:hidden">
          {proofList
            ? t("Beta. Read from the Arbitrum One escrow.", "Beta. Dibaca dari escrow di Arbitrum One.")
            : proof
            ? t("Beta. Read from the chain named below.", "Beta. Dibaca dari chain yang tertera.")
            : near
            ? t("Beta: real money for the team only.", "Beta: uang asli khusus tim.")
            : team
              ? t("Beta, team: real USDC on shows abroad.", "Beta, tim: USDC asli di acara luar negeri.")
              : t("Beta: test payments, no real money.", "Beta: pembayaran uji, bukan uang asli.")}
        </span>
        <span className="hidden sm:inline">
          {proofList
            ? t(
                "Beta. Read from the escrow contract on Arbitrum One, not from our database. Real USDC, the team's own orders.",
                "Beta. Dibaca dari kontrak escrow di Arbitrum One, bukan dari database kami. USDC sungguhan, pesanan tim sendiri."
              )
            : proof
            ? t(
                "Beta. This page reads one record from the chain named under Technical details. Only an escrow on Arbitrum One holds real USDC.",
                "Beta. Halaman ini membaca satu catatan dari chain yang tertera di Detail teknis. Hanya escrow di Arbitrum One yang memegang USDC sungguhan."
              )
            : team && !near
            ? t(
                "Beta, Lummy team account: shows abroad take real USDC through NEAR Intents. QRIS stays in Xendit's test mode, and everyone else pays test USDC.",
                "Beta, akun tim Lummy: acara luar negeri dibayar USDC sungguhan lewat NEAR Intents. QRIS tetap di mode uji Xendit, dan selain tim membayar dengan USDC uji."
              )
            : near
            ? t(
                "Beta: everyone else pays in test mode. The real payments on this page are the Lummy team's own, on Arbitrum One.",
                "Beta: selain tim, semua pembayaran masih uji. Pembayaran sungguhan di halaman ini milik tim Lummy sendiri, di Arbitrum One."
              )
            : (
              <>
                {t("Beta: QRIS in test mode and USDC on testnet for the public. The team's real USDC: ", "Beta: QRIS mode uji dan USDC di testnet untuk umum. USDC asli tim: ")}
                <Link href="/near" className="underline underline-offset-2">/near</Link>
              </>
            )}
        </span>
      </span>
      <a
        data-feedback
        href={feedbackHref()}
        onClick={(e) => { e.currentTarget.href = feedbackHref(window.location.href); }}
        className="shrink-0 self-stretch inline-flex items-center underline underline-offset-2 text-white hover:opacity-80"
      >
        {t("Feedback", "Kasih masukan")}
      </a>
    </div>
  );
}
