"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FlaskConical, LogOut } from "lucide-react";
import { useUser, type Role, type User } from "@/lib/mock";
import { useHydrated } from "@/lib/access";
import { useT } from "@/lib/i18n";
import { isDemoEmail } from "@/lib/supabase/demo";

const ROLE: Record<Role, { en: string; id: string }> = {
  BUYER: { en: "Buyer", id: "Pembeli" },
  SELLER: { en: "Seller", id: "Penjual" },
  ADMIN: { en: "Admin", id: "Admin" },
};

/** A sample persona kept in this browser, a shared demo account in the database, or neither. */
export const demoKind = (user: User | null): "sample" | "account" | null =>
  !user ? null : !user.account ? "sample" : isDemoEmail(user.email) ? "account" : null;

/** Whether the demo bar is on screen, for whatever else sits at the foot of the window. */
export function useDemoBar() {
  const mounted = useHydrated();
  const user = useUser((s) => s.user);
  return mounted && !!demoKind(user);
}

/**
 * Every page says when this browser is in a demo account, and as which role. The persona someone
 * picks stays stored (lummy:user) until they leave it, so a visit days later opens in it: without
 * this bar, someone who once picked Admin came back to the console and took it for a real session.
 * Sticky at the foot of the page rather than fixed: it stays in view while scrolling, and at the
 * end of the page it sits under the footer instead of over it.
 */
export function DemoBar() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useHydrated();
  const user = useUser((s) => s.user);
  const logout = useUser((s) => s.logout);
  const kind = mounted ? demoKind(user) : null;
  if (!kind || !user) return null;

  const role = ROLE[user.role];
  // Signing in comes back to this page, as it does from the navbar.
  const loginHref = pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`;

  return (
    <aside
      data-demo-bar={kind}
      data-demo-role={user.role}
      aria-label={t("Demo account", "Akun demo")}
      className="sticky bottom-0 z-30 border-t-2 border-neutral-black bg-secondary-yellow-dark text-neutral-black"
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-10 py-2.5 flex items-center gap-3">
        <FlaskConical aria-hidden className="hidden sm:block w-5 h-5 shrink-0" />
        <p className="flex-1 min-w-0 text-sm leading-snug">
          <strong className="font-semibold">{t(`Demo account: ${role.en}.`, `Akun demo: ${role.id}.`)}</strong>{" "}
          <span className="hidden md:inline">
            {kind === "sample"
              ? t("Sample orders and simulated payments, kept in this browser.", "Pesanan contoh dan pembayaran simulasi, tersimpan di browser ini.")
              : t("A shared account for presenters; payments here are tests.", "Akun bersama untuk presenter; pembayaran di sini cuma uji coba.")}
          </span>{" "}
          {!pathname.startsWith("/login") && (
            // Ends the demo first: the login page sends an open account straight on.
            <Link href={loginHref} onClick={() => logout()} className="block sm:inline font-semibold underline underline-offset-2">
              {t("Sign in with your email", "Masuk dengan email-mu")}
            </Link>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            logout();
            router.push("/");
          }}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border-2 border-neutral-black bg-neutral-white text-sm font-semibold hover:bg-secondary-cream-light transition cursor-pointer"
        >
          <LogOut aria-hidden className="w-4 h-4" /> {t("Leave demo", "Keluar demo")}
        </button>
      </div>
    </aside>
  );
}
