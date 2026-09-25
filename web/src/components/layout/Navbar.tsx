"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown, LayoutDashboard, LogOut, Menu, Plus, Search, ShieldCheck, Ticket, User as UserIcon, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useUser, isDemoMode, type Role } from "@/lib/mock";
import { useHydrated, ROLE_HOME } from "@/lib/access";
import { useDocumentLang, useFormatters, useT } from "@/lib/i18n";
import { useEventSuggestions } from "@/lib/useEventSuggestions";
import { LangToggle } from "./LangToggle";

// The layout follows resale marketplaces people already know (Tixel, viagogo, StubHub):
// finding a show on the left, a standing way to sell, and your own things (tickets,
// dashboard, account) together on the right. One account menu holds the rest, including
// the buyer/seller view, so there is a single dropdown instead of two side by side.

type NavItem = { en: string; id: string; href: string; Icon?: LucideIcon };

const MAIN: NavItem[] = [
  { en: "Browse", id: "Jelajah", href: "/events" },
  { en: "How it works", id: "Cara kerja", href: "/how-it-works" },
];
const ABOUT: NavItem = { en: "About", id: "Tentang", href: "/about" };
const SELL: NavItem = { en: "Sell a ticket", id: "Jual tiket", href: "/sell", Icon: Plus };

const TICKETS: NavItem = { en: "My tickets", id: "Tiket saya", href: "/tickets", Icon: Ticket };
const DASHBOARD: NavItem = { en: "Seller dashboard", id: "Dasbor penjual", href: "/seller", Icon: LayoutDashboard };
const PROFILE: NavItem = { en: "Profile", id: "Profil", href: "/profile", Icon: UserIcon };
const CONSOLE: NavItem = { en: "Admin console", id: "Konsol admin", href: "/admin", Icon: ShieldCheck };

// The one place each view keeps coming back to, kept in the bar.
const HUB: Record<Role, NavItem> = {
  BUYER: TICKETS,
  SELLER: { ...DASHBOARD, en: "Dashboard", id: "Dasbor" },
  ADMIN: { ...CONSOLE, en: "Console", id: "Konsol" },
};

const ROLE_LABEL: Record<Role, { en: string; id: string }> = {
  BUYER: { en: "Buyer", id: "Pembeli" },
  SELLER: { en: "Seller", id: "Penjual" },
  ADMIN: { en: "Admin", id: "Admin" },
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** Close on a click outside `ref` or on Escape. Outside click rather than hover, so a menu survives the trip to it. */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

/** A text link whose underline draws in on hover and stays drawn on the current page. */
function BarLink({ item, active }: { item: NavItem; active: boolean }) {
  const t = useT();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative inline-flex items-center gap-1.5 py-1.5 text-[15px] transition-colors",
        active ? "text-neutral-black font-semibold" : "text-neutral-gray hover:text-neutral-black"
      )}
    >
      {item.Icon && <item.Icon className="w-4 h-4" />}
      {t(item.en, item.id)}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-primary-navy origin-left transition-transform duration-300",
          active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
        )}
      />
    </Link>
  );
}

/**
 * Segmented control for the account's view. The highlight slides between options rather
 * than jumping, so the switch reads as one control changing state.
 */
function ViewSwitch({ current, options, onPick }: { current: Role; options: Role[]; onPick: (r: Role) => void }) {
  const t = useT();
  const at = Math.max(0, options.indexOf(current));
  return (
    <div
      role="group"
      aria-label={t("View as", "Lihat sebagai")}
      className="relative grid rounded-xl bg-secondary-blue-light p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-lg bg-neutral-white border border-lummy-500 shadow-sm transition-transform duration-300 ease-spring"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${at * 100}%)` }}
      />
      {options.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={current === r}
          onClick={() => current !== r && onPick(r)}
          className={cn(
            "relative z-10 py-1.5 text-sm rounded-lg transition-colors cursor-pointer",
            current === r ? "text-primary-navy font-semibold" : "text-neutral-gray hover:text-neutral-black"
          )}
        >
          {t(ROLE_LABEL[r].en, ROLE_LABEL[r].id)}
        </button>
      ))}
    </div>
  );
}

/** Compact search for pages without their own. Same suggestions as the hero search. */
function NavSearch({ className, onDone }: { className?: string; onDone?: () => void }) {
  const t = useT();
  const { formatEventDate } = useFormatters();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const { query, suggestions } = useEventSuggestions(q, 5);
  useDismiss(ref, open, () => setOpen(false));

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    onDone?.();
    router.push(href);
  };

  return (
    <form
      ref={ref}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(q.trim() ? `/events?q=${encodeURIComponent(q.trim())}` : "/events");
      }}
      className={cn("relative", className)}
    >
      <label className="flex items-center gap-2 h-10 rounded-full border border-neutral-light-gray-1 bg-neutral-white/90 pl-3.5 pr-2 transition focus-within:border-primary-navy focus-within:shadow-[0_0_0_3px_rgba(177,231,255,0.8)] hover:border-lummy-500">
        <Search className="w-4 h-4 text-neutral-gray shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={t("Search artist, event or city", "Cari artis, event, atau kota")}
          aria-label={t("Search events", "Cari event")}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-neutral-black placeholder:text-neutral-gray"
        />
      </label>
      {open && (suggestions.length > 0 || query) && (
        <div className="lm-pop absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-lummy-500 bg-neutral-white shadow-lummy-lg overflow-hidden py-1.5">
          {suggestions.length === 0 && (
            <p className="px-4 py-3 text-sm text-neutral-gray">{t(`Nothing on sale for "${q.trim()}" yet.`, `Belum ada yang dijual untuk "${q.trim()}".`)}</p>
          )}
          {suggestions.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => go(`/events/${e.id}`)}
              className="group w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary-blue-light transition-colors cursor-pointer"
            >
              <span className="relative w-9 h-9 rounded-lg overflow-hidden border border-neutral-light-gray-1 shrink-0">
                <Image src={e.image} alt="" fill sizes="36px" className="object-cover transition-transform duration-500 group-hover:scale-110" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-neutral-black truncate">{e.title}</span>
                <span className="block text-xs text-neutral-gray truncate">{e.city} · {formatEventDate(e.dateISO)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

export function Navbar() {
  const t = useT();
  useDocumentLang();
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser((s) => s.user);
  const switchPersona = useUser((s) => s.switchPersona);
  const logout = useUser((s) => s.logout);
  const mounted = useHydrated();

  const [scrolled, setScrolled] = useState(false);
  // On home the hero has its own search; the bar only offers one once that has scrolled away.
  const [heroSearchGone, setHeroSearchGone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => setMenuOpen(false);
  useDismiss(menuRef, menuOpen, closeMenu);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      const hero = document.querySelector("[data-hero-search]");
      setHeroSearchGone(!hero || hero.getBoundingClientRect().bottom < 72);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // The sheet covers the page, so the page behind it should not scroll.
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  // Read the persisted user only after hydration, so the server and first client render agree
  const me = mounted ? user : null;
  const role: Role = me?.role ?? "BUYER";
  // Sample personas swap person; a real account only swaps view, and admin only for staff.
  const views: Role[] = me?.account && !me.staff ? ["BUYER", "SELLER"] : ["BUYER", "SELLER", "ADMIN"];
  const showViews = !!me && isDemoMode();
  const accountLinks = [TICKETS, DASHBOARD, PROFILE, ...(role === "ADMIN" ? [CONSOLE] : [])];
  const showSearch = pathname !== "/events" && (pathname !== "/" || heroSearchGone);

  // Switching view jumps to that view's home, so nobody is left on a page they cannot use.
  const pickView = (r: Role) => {
    switchPersona(r);
    setMenuOpen(false);
    setSheetOpen(false);
    router.push(ROLE_HOME[r]);
  };
  const signOut = () => {
    logout();
    setMenuOpen(false);
    setSheetOpen(false);
  };

  // Auth pages get a minimal bar: logo and language only.
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
    <>
      <nav
        className={cn(
          "fixed z-50 top-0 w-full h-20 flex justify-center px-5 lg:px-10 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
          // Solid under the sheet, so the dimmed page does not show through the bar
          sheetOpen
            ? "bg-neutral-white border-neutral-light-gray-1"
            : scrolled
            ? "bg-neutral-white/85 backdrop-blur-md border-neutral-light-gray-1"
            : "bg-transparent border-transparent"
        )}
      >
        <div className="max-w-7xl w-full flex items-center gap-6 xl:gap-8">
          <Logo />

          <div className="hidden lg:flex items-center gap-7">
            {MAIN.map((l) => <BarLink key={l.href} item={l} active={isActive(pathname, l.href)} />)}
          </div>

          <div className="hidden xl:flex flex-1 justify-center">
            <NavSearch
              className={cn(
                "w-full max-w-[280px] transition duration-300",
                showSearch ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none invisible"
              )}
            />
          </div>

          <div className="ml-auto xl:ml-0 flex items-center gap-2 sm:gap-3">
            {/* Selling is half the marketplace, so it stays one click away */}
            {role !== "ADMIN" && (
              <Link
                href={SELL.href}
                className={cn(
                  "group hidden lg:inline-flex items-center gap-1.5 h-10 px-4 rounded-full border-2 font-fredoka font-medium text-[15px] transition active:scale-95",
                  isActive(pathname, SELL.href)
                    ? "bg-primary-navy border-primary-navy text-white"
                    : "border-primary-navy text-primary-navy hover:bg-primary-navy hover:text-white"
                )}
              >
                <Plus className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" />
                {t(SELL.en, SELL.id)}
              </Link>
            )}

            {me && (
              <span className="hidden lg:inline-flex px-1">
                <BarLink item={HUB[role]} active={isActive(pathname, HUB[role].href)} />
              </span>
            )}

            <LangToggle className="hidden sm:flex" />

            {/* Account menu, or the way in */}
            {me ? (
              <div ref={menuRef} className="relative hidden lg:block">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={t("Account menu", "Menu akun")}
                  className={cn(
                    "flex items-center gap-2 h-11 pl-1 pr-3 rounded-full border transition cursor-pointer",
                    menuOpen ? "border-lummy-500 bg-neutral-white" : "border-neutral-light-gray-1 bg-neutral-white/80 hover:border-lummy-500"
                  )}
                >
                  <span className="w-9 h-9 rounded-full bg-secondary-blue-light text-lummy-500 text-sm font-semibold grid place-items-center border border-lummy-500">
                    {initials(me.name)}
                  </span>
                  {/* The current view stays visible: presenters switch it mid-demo */}
                  <span className="text-sm font-medium text-neutral-black">{t(ROLE_LABEL[role].en, ROLE_LABEL[role].id)}</span>
                  <ChevronDown className={cn("w-4 h-4 text-neutral-gray transition-transform duration-300", menuOpen && "rotate-180")} />
                </button>

                {menuOpen && (
                  <div role="menu" className="lm-pop [--origin:top_right] absolute right-0 top-full mt-2 w-72 rounded-2xl border border-lummy-500 bg-neutral-white shadow-lummy-lg z-50 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                      <span className="w-10 h-10 rounded-full bg-secondary-blue-light text-lummy-500 font-semibold grid place-items-center border border-lummy-500 shrink-0">
                        {initials(me.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-black text-sm truncate">{me.name}</div>
                        <div className="text-neutral-gray text-xs truncate">{me.email}</div>
                      </div>
                    </div>

                    {showViews && (
                      <div className="px-4 pb-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-gray mb-1.5">
                          {me.account ? t("View as", "Lihat sebagai") : t("Demo persona", "Persona demo")}
                        </div>
                        <ViewSwitch current={role} options={views} onPick={pickView} />
                      </div>
                    )}

                    <div className="border-t border-dashed border-neutral-light-gray-1 py-1.5">
                      {accountLinks.map((l) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          role="menuitem"
                          onClick={closeMenu}
                          className={cn(
                            "group flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors",
                            isActive(pathname, l.href) ? "text-primary-navy font-medium bg-secondary-blue-extra" : "text-neutral-black hover:bg-secondary-blue-light"
                          )}
                        >
                          {l.Icon && <l.Icon className="w-4 h-4 text-neutral-gray group-hover:text-primary-navy transition-colors" />}
                          {t(l.en, l.id)}
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-dashed border-neutral-light-gray-1 py-1.5">
                      <button
                        role="menuitem"
                        onClick={signOut}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-secondary-pink-dark hover:bg-secondary-pink-light transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" /> {t("Sign out", "Keluar")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : mounted ? (
              <Link
                href="/login"
                className="hidden lg:inline-flex items-center gap-1.5 h-10 px-4 rounded-full border-2 border-primary-navy bg-primary-sky text-primary-navy-dark font-fredoka font-semibold text-[15px] shadow-[2px_2px_0_#245397] transition hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_#245397] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <UserIcon className="w-4 h-4" /> {t("Sign in", "Masuk")}
              </Link>
            ) : null}

            {/* Phones and tablets: everything moves into a sheet */}
            <button
              onClick={() => setSheetOpen((o) => !o)}
              aria-label={sheetOpen ? t("Close menu", "Tutup menu") : t("Menu", "Menu")}
              aria-expanded={sheetOpen}
              aria-controls="nav-sheet"
              className="lg:hidden relative w-10 h-10 grid place-items-center rounded-full text-lummy-500 hover:bg-secondary-blue-light transition cursor-pointer"
            >
              <Menu className={cn("absolute w-6 h-6 transition duration-300", sheetOpen ? "opacity-0 rotate-90 scale-75" : "opacity-100")} />
              <X className={cn("absolute w-6 h-6 transition duration-300", sheetOpen ? "opacity-100" : "opacity-0 -rotate-90 scale-75")} />
            </button>
          </div>
        </div>
      </nav>

      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-40" id="nav-sheet">
          <div className="lm-backdrop absolute inset-0 bg-neutral-black/30" onClick={() => setSheetOpen(false)} />
          <div className="lm-pop absolute inset-x-0 top-20 max-h-[calc(100dvh-5rem)] overflow-y-auto bg-neutral-white border-b border-neutral-light-gray-1 shadow-lummy-lg rounded-b-3xl">
            <div className="max-w-xl mx-auto px-5 pt-4 pb-6 flex flex-col gap-5">
              {pathname !== "/events" && <NavSearch onDone={() => setSheetOpen(false)} />}

              <div data-reveal="stagger" className="flex flex-col">
                {[...MAIN, ABOUT].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "flex items-center justify-between py-3 border-b border-dashed border-neutral-light-gray-1 font-fredoka text-xl transition-colors",
                      isActive(pathname, l.href) ? "text-primary-navy font-semibold" : "text-neutral-black"
                    )}
                  >
                    {t(l.en, l.id)}
                  </Link>
                ))}
              </div>

              {role !== "ADMIN" && (
                <Link href={SELL.href} onClick={() => setSheetOpen(false)} className="flex items-center justify-center gap-2 h-12 rounded-2xl border-2 border-primary-navy text-primary-navy font-fredoka font-medium active:scale-[0.98] transition">
                  <Plus className="w-4 h-4" /> {t(SELL.en, SELL.id)}
                </Link>
              )}

              {me ? (
                <div className="rounded-2xl border border-neutral-light-gray-1 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-secondary-blue-extra">
                    <span className="w-9 h-9 rounded-full bg-secondary-blue-light text-lummy-500 text-sm font-semibold grid place-items-center border border-lummy-500 shrink-0">
                      {initials(me.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-neutral-black text-sm truncate">{me.name}</div>
                      <div className="text-neutral-gray text-xs truncate">{me.email}</div>
                    </div>
                  </div>
                  {showViews && (
                    <div className="px-4 pt-3">
                      <ViewSwitch current={role} options={views} onPick={pickView} />
                    </div>
                  )}
                  <div className="py-1.5">
                    {accountLinks.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setSheetOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 px-4 py-2.5 text-sm",
                          isActive(pathname, l.href) ? "text-primary-navy font-medium" : "text-neutral-black"
                        )}
                      >
                        {l.Icon && <l.Icon className="w-4 h-4 text-neutral-gray" />}
                        {t(l.en, l.id)}
                      </Link>
                    ))}
                    <button onClick={signOut} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-secondary-pink-dark cursor-pointer">
                      <LogOut className="w-4 h-4" /> {t("Sign out", "Keluar")}
                    </button>
                  </div>
                </div>
              ) : mounted ? (
                <Button.Primary wrapperClass="w-full" className="w-full flex items-center justify-center gap-2" onClick={() => { setSheetOpen(false); router.push("/login"); }}>
                  <UserIcon className="w-4 h-4" /> {t("Sign in", "Masuk")}
                </Button.Primary>
              ) : null}

              <div className="sm:hidden flex items-center justify-between">
                <span className="text-sm text-neutral-gray">{t("Language", "Bahasa")}</span>
                <LangToggle />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
