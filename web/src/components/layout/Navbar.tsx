"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useUser, isDemoMode, type Role } from "@/lib/mock";

type NavLink = { label: string; href: string };
const GUEST_LINKS: NavLink[] = [
  { label: "Beranda", href: "/" },
  { label: "Jelajah", href: "/events" },
  { label: "Cara Kerja", href: "/how-it-works" },
];
const ROLE_LINKS: Record<Role, NavLink[]> = {
  BUYER: [
    { label: "Beranda", href: "/" },
    { label: "Jelajah", href: "/events" },
    { label: "Tiket Saya", href: "/tickets" },
    { label: "Cara Kerja", href: "/how-it-works" },
  ],
  SELLER: [
    { label: "Jelajah", href: "/events" },
    { label: "Jual Tiket", href: "/sell" },
    { label: "Dashboard", href: "/seller" },
    { label: "Cara Kerja", href: "/how-it-works" },
  ],
  ADMIN: [
    { label: "Jelajah", href: "/events" },
    { label: "Approval", href: "/admin" },
    { label: "Cara Kerja", href: "/how-it-works" },
  ],
};

const ROLE_LABEL: Record<Role, string> = { BUYER: "Pembeli", SELLER: "Penjual", ADMIN: "Admin" };

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function Navbar() {
  const pathname = usePathname();
  const user = useUser((s) => s.user);
  const switchPersona = useUser((s) => s.switchPersona);
  const logout = useUser((s) => s.logout);

  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = mounted && user ? ROLE_LINKS[user.role] : GUEST_LINKS;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed z-40 top-0 w-full h-20 flex justify-center px-5 lg:px-10 border transition-colors duration-300",
        scrolled ? "bg-neutral-white border-neutral-light-gray-1" : "bg-transparent border-transparent"
      )}
    >
      <div className="max-w-6xl w-full flex items-center justify-between">
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
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Role switcher (demo) */}
          {mounted && user && isDemoMode() && (
            <div className="relative hidden sm:block" onMouseLeave={() => setRoleOpen(false)}>
              <button
                onClick={() => setRoleOpen((o) => !o)}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl border-2 border-lummy-500 bg-neutral-white text-lummy-500 text-sm font-medium hover:bg-pastel-yellow transition cursor-pointer"
              >
                {ROLE_LABEL[user.role]} <ChevronDown className="w-4 h-4" />
              </button>
              {roleOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 rounded-2xl border border-lummy-500 bg-neutral-white shadow-lummy-lg overflow-hidden z-50">
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => { switchPersona(r); setRoleOpen(false); }}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-sm hover:bg-secondary-blue-light transition cursor-pointer",
                        user.role === r ? "text-lummy-500 font-semibold" : "text-neutral-gray"
                      )}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Avatar / sign in */}
          {mounted && user ? (
            <div className="relative hidden lg:block" onMouseLeave={() => setUserOpen(false)}>
              <button onClick={() => setUserOpen((o) => !o)} className="flex items-center gap-2 cursor-pointer">
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
                    <UserIcon className="w-4 h-4" /> Profil
                  </Link>
                  <button
                    onClick={() => { logout(); setUserOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-secondary-pink-dark hover:bg-secondary-pink-light cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" /> Keluar
                  </button>
                </div>
              )}
            </div>
          ) : mounted ? (
            <Button.Primary className="hidden lg:flex items-center gap-2 text-sm" onClick={() => useUser.getState().login("BUYER")}>
              <UserIcon className="w-4 h-4" /> Masuk
            </Button.Primary>
          ) : null}

          {/* Mobile menu */}
          <div className="lg:hidden relative">
            <button onClick={() => setMobileOpen((o) => !o)} aria-label="Menu" className="p-1 text-lummy-500 cursor-pointer">
              <Menu className="w-6 h-6" />
            </button>
            {mobileOpen && (
              <div className="absolute right-0 top-11 w-52 rounded-2xl border border-lummy-500 bg-neutral-white p-2 shadow-lummy-lg z-50 flex flex-col gap-1">
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
                    {l.label}
                  </Link>
                ))}
                {mounted && user && (
                  <div className="border-t border-dashed border-neutral-light-gray-1 mt-1 pt-1">
                    <div className="px-3 py-1 text-xs text-neutral-gray">Persona (demo)</div>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => { switchPersona(r); setMobileOpen(false); }}
                        className={cn("w-full text-left px-3 py-2 rounded-lg text-sm", user.role === r ? "text-lummy-500 font-semibold" : "text-neutral-gray hover:bg-secondary-blue-light")}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    ))}
                    <Link href="/profile" onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-neutral-gray hover:bg-secondary-blue-light mt-1 border-t border-dashed border-neutral-light-gray-1 pt-2">Profil</Link>
                    <button onClick={() => { logout(); setMobileOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-sm text-secondary-pink-dark hover:bg-secondary-pink-light cursor-pointer">Keluar</button>
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
