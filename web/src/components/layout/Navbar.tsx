"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Menu, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useUser, isDemoMode, type Role } from "@/lib/mock";
import { useT } from "@/lib/i18n";
import { LangToggle } from "./LangToggle";

type NavLink = { en: string; id: string; href: string };
const HOME: NavLink = { en: "Home", id: "Beranda", href: "/" };
const BROWSE: NavLink = { en: "Browse", id: "Jelajah", href: "/events" };
const HOW: NavLink = { en: "How it works", id: "Cara kerja", href: "/how-it-works" };
const ABOUT: NavLink = { en: "About", id: "Tentang", href: "/about" };

const TICKETS: NavLink = { en: "My tickets", id: "Tiket saya", href: "/tickets" };
const SELL: NavLink = { en: "Sell", id: "Jual", href: "/sell" };
const DASHBOARD: NavLink = { en: "Dashboard", id: "Dasbor", href: "/seller" };

const GUEST_LINKS: NavLink[] = [HOME, BROWSE, HOW, ABOUT];

// One account buys and sells, so both entries stay reachable in either view.
// Switching persona changes where you land and what leads, not what you may do.
// Admin is staff, so it carries neither.
const ROLE_LINKS: Record<Role, NavLink[]> = {
  BUYER: [HOME, BROWSE, TICKETS, SELL, HOW],
  SELLER: [BROWSE, DASHBOARD, SELL, TICKETS, HOW],
  ADMIN: [BROWSE, { en: "Console", id: "Konsol", href: "/admin" }, HOW],
};

const ROLE_LABEL: Record<Role, { en: string; id: string }> = {
  BUYER: { en: "Buyer", id: "Pembeli" },
  SELLER: { en: "Seller", id: "Penjual" },
  ADMIN: { en: "Admin", id: "Admin" },
};
const ROLE_HOME: Record<Role, string> = { BUYER: "/", SELLER: "/seller", ADMIN: "/admin" };

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function Navbar() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser((s) => s.user);
  const switchPersona = useUser((s) => s.switchPersona);
  const logout = useUser((s) => s.logout);

  // Switching persona jumps to that role's home, so nobody is left on a page they cannot use.
  const goPersona = (r: Role) => {
    switchPersona(r);
    router.push(ROLE_HOME[r]);
  };

  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const roleRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

  const links = mounted && user ? ROLE_LINKS[user.role] : GUEST_LINKS;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Close on outside click rather than hover, so the menu survives the trip to it.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (roleRef.current && !roleRef.current.contains(t)) setRoleOpen(false);
      if (userRef.current && !userRef.current.contains(t)) setUserOpen(false);
      if (mobileRef.current && !mobileRef.current.contains(t)) setMobileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setRoleOpen(false); setUserOpen(false); setMobileOpen(false); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Auth pages get a minimal navbar: logo only, no avatar or persona switch.
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return (
      <nav className="fixed z-40 top-0 w-full h-20 flex justify-center px-5 lg:px-10 bg-neutral-white border-b border-neutral-light-gray-1">
        <div className="max-w-7xl w-full flex items-center justify-between">
          <Logo />
          <LangToggle />
        </div>
      </nav>
    );
  }

  return (
    <nav
      className={cn(
        "fixed z-40 top-0 w-full h-20 flex justify-center px-5 lg:px-10 border transition-colors duration-300",
        scrolled ? "bg-neutral-white border-neutral-light-gray-1" : "bg-transparent border-transparent"
      )}
    >
      <div className="max-w-7xl w-full flex items-center justify-between">
        <Logo />

        <div className="hidden lg:flex gap-8">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "text-base border-b-2 border-dashed border-transparent hover:border-primary-navy transition",
                pathname === l.href ? "text-neutral-black font-semibold border-primary-navy" : "text-neutral-gray"
              )}
            >
              {t(l.en, l.id)}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <LangToggle className="hidden sm:flex" />

          {/* Role switcher (demo) */}
          {mounted && user && isDemoMode() && (
            <div ref={roleRef} className="relative hidden sm:block">
              <button
                onClick={() => setRoleOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={roleOpen}
                aria-label={t("Switch persona (demo)", "Ganti persona (demo)")}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl border-2 border-lummy-500 bg-neutral-white text-lummy-500 text-sm font-medium hover:bg-pastel-yellow transition cursor-pointer"
              >
                {t(ROLE_LABEL[user.role].en, ROLE_LABEL[user.role].id)} <ChevronDown className="w-4 h-4" />
              </button>
              {roleOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 rounded-2xl border border-lummy-500 bg-neutral-white shadow-lummy-lg overflow-hidden z-50">
                  <div className="px-4 pt-2 pb-1.5 text-[10px] uppercase tracking-wide text-neutral-gray">
                    {t("Demo personas", "Persona demo")}
                  </div>
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => { goPersona(r); setRoleOpen(false); }}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-sm hover:bg-secondary-blue-light transition cursor-pointer",
                        user.role === r ? "text-lummy-500 font-semibold" : "text-neutral-gray"
                      )}
                    >
                      {t(ROLE_LABEL[r].en, ROLE_LABEL[r].id)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Avatar / sign in */}
          {mounted && user ? (
            <div ref={userRef} className="relative hidden lg:block">
              <button onClick={() => setUserOpen((o) => !o)} aria-haspopup="menu" aria-expanded={userOpen} aria-label={t("Account menu", "Menu akun")} className="flex items-center gap-2 cursor-pointer">
                <span className="w-10 h-10 rounded-full bg-secondary-blue-light text-lummy-500 font-semibold grid place-items-center border border-lummy-500">
                  {initials(user.name)}
                </span>
                <ChevronDown className="w-4 h-4 text-lummy-500" />
              </button>
              {userOpen && (
                <div className="absolute right-0 top-12 w-64 rounded-2xl border border-lummy-500 bg-neutral-white py-3 shadow-lummy-lg z-50">
                  <div className="px-4 pb-3 border-b border-dashed border-neutral-light-gray-1">
                    <div className="font-semibold text-neutral-black text-sm">{user.name}</div>
                    <div className="text-neutral-gray text-xs truncate">{user.email}</div>
                  </div>
                  <Link href="/profile" onClick={() => setUserOpen(false)} className="mt-2 w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-gray hover:bg-secondary-blue-light cursor-pointer">
                    <UserIcon className="w-4 h-4" /> {t("Profile", "Profil")}
                  </Link>
                  <button
                    onClick={() => { logout(); setUserOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-secondary-pink-dark hover:bg-secondary-pink-light cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" /> {t("Sign out", "Keluar")}
                  </button>
                </div>
              )}
            </div>
          ) : mounted ? (
            <Button.Primary className="hidden lg:flex items-center gap-2 text-sm" onClick={() => useUser.getState().login("BUYER")}>
              <UserIcon className="w-4 h-4" /> {t("Sign in", "Masuk")}
            </Button.Primary>
          ) : null}

          {/* Mobile menu */}
          <div ref={mobileRef} className="lg:hidden relative">
            <button onClick={() => setMobileOpen((o) => !o)} aria-label={t("Menu", "Menu")} aria-haspopup="menu" aria-expanded={mobileOpen} className="p-1 text-lummy-500 cursor-pointer">
              <Menu className="w-6 h-6" />
            </button>
            {mobileOpen && (
              <div className="absolute right-0 top-11 w-52 rounded-2xl border border-lummy-500 bg-neutral-white p-2 shadow-lummy-lg z-50 flex flex-col gap-1">
                <div className="sm:hidden px-1 pb-1 border-b border-dashed border-neutral-light-gray-1 mb-1">
                  <LangToggle className="w-fit" />
                </div>
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm",
                      pathname === l.href ? "bg-secondary-blue-soft text-neutral-black font-semibold" : "text-neutral-gray hover:bg-secondary-blue-light"
                    )}
                  >
                    {t(l.en, l.id)}
                  </Link>
                ))}
                {mounted && user && (
                  <div className="border-t border-dashed border-neutral-light-gray-1 mt-1 pt-1">
                    <div className="px-3 py-1 text-xs text-neutral-gray">{t("Persona (demo)", "Persona (demo)")}</div>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => { goPersona(r); setMobileOpen(false); }}
                        className={cn("w-full text-left px-3 py-2 rounded-lg text-sm", user.role === r ? "text-lummy-500 font-semibold" : "text-neutral-gray hover:bg-secondary-blue-light")}
                      >
                        {t(ROLE_LABEL[r].en, ROLE_LABEL[r].id)}
                      </button>
                    ))}
                    <Link href="/profile" onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-neutral-gray hover:bg-secondary-blue-light mt-1 border-t border-dashed border-neutral-light-gray-1 pt-2">{t("Profile", "Profil")}</Link>
                    <button onClick={() => { logout(); setMobileOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-sm text-secondary-pink-dark hover:bg-secondary-pink-light cursor-pointer">{t("Sign out", "Keluar")}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
