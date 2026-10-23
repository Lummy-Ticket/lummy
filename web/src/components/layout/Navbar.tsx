"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown, Globe, LayoutDashboard, LogOut, Menu, Plus, Search, ShieldCheck, Ticket, User as UserIcon, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useOrders, useUser, type User } from "@/lib/mock";
import { isStaff, useHydrated } from "@/lib/access";
import { useAccountOrders } from "@/lib/orders/client";
import { useDocumentLang, useFormatters, useT } from "@/lib/i18n";
import { useEventSuggestions } from "@/lib/useEventSuggestions";
import { LangToggle } from "./LangToggle";
import { TEST_MODE } from "./TestModeNotice";

/** Under the test-mode strip while it shows (TestModeNotice), at the top of the window otherwise. */
const TOP = TEST_MODE ? "top-6" : "top-0";

// The layout follows resale marketplaces people already know (Tixel, viagogo, StubHub):
// finding a show on the left, a standing way to sell, and your own things on the right.
// One account both buys and sells, so there is no buyer or seller mode to switch: the
// account menu lists your tickets and your seller dashboard side by side, and says when a
// claim against you is waiting for an answer. Staff get a bar of their own in the console.

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

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/** What the account button says: a first name, not a mode. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

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

/**
 * Claims against this person as a seller that still wait for their answer. The account menu
 * shows the count, so someone who mostly buys cannot miss one on a ticket they once sold.
 */
function useClaimsToAnswer(me: User | null) {
  const sample = useOrders((s) => s.orders);
  const { orders } = useAccountOrders(me?.account ? { seller: me.id } : null);
  if (!me) return 0;
  const mine = me.account ? (orders ?? []) : sample.filter((o) => o.sellerName === me.name);
  return mine.filter((o) => o.escrowStatus === "DISPUTED" && !(o.dispute?.replies ?? []).some((r) => r.fromSeller)).length;
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

/** How many things wait on this person, next to where they are handled. */
function Count({ n, label }: { n: number; label: string }) {
  if (!n) return null;
  return (
    <span aria-label={label} className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-secondary-orange-dark text-white text-[11px] font-semibold grid place-items-center">
      {n}
    </span>
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

/** One dropdown with everything that is yours. */
function AccountMenu({
  me, links, claims, pathname, onSignOut, className,
}: {
  me: User;
  links: NavItem[];
  claims: number;
  pathname: string;
  onSignOut: () => void;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("Account menu", "Menu akun")}
        className={cn(
          "flex items-center gap-2 h-11 pl-1 pr-3 rounded-full border transition cursor-pointer",
          open ? "border-lummy-500 bg-neutral-white" : "border-neutral-light-gray-1 bg-neutral-white/80 hover:border-lummy-500"
        )}
      >
        <span className="relative w-9 h-9 rounded-full bg-secondary-blue-light text-lummy-500 text-sm font-semibold grid place-items-center border border-lummy-500">
          {initials(me.name)}
          {claims > 0 && <span aria-hidden className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-secondary-orange-dark border-2 border-neutral-white" />}
        </span>
        <span className="hidden sm:inline text-sm font-medium text-neutral-black max-w-32 truncate">{firstName(me.name)}</span>
        <ChevronDown className={cn("w-4 h-4 text-neutral-gray transition-transform duration-300", open && "rotate-180")} />
      </button>

      {open && (
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
          <div className="border-t border-dashed border-neutral-light-gray-1 py-1.5">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                onClick={close}
                className={cn(
                  "group flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors",
                  isActive(pathname, l.href) ? "text-primary-navy font-medium bg-secondary-blue-extra" : "text-neutral-black hover:bg-secondary-blue-light"
                )}
              >
                {l.Icon && <l.Icon className="w-4 h-4 text-neutral-gray group-hover:text-primary-navy transition-colors" />}
                {t(l.en, l.id)}
                {l.href === DASHBOARD.href && <Count n={claims} label={t(`${claims} ${claims === 1 ? "claim" : "claims"} to answer`, `${claims} klaim perlu dijawab`)} />}
              </Link>
            ))}
          </div>
          <div className="border-t border-dashed border-neutral-light-gray-1 py-1.5">
            <button
              role="menuitem"
              onClick={() => { close(); onSignOut(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-secondary-pink-dark hover:bg-secondary-pink-light transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> {t("Sign out", "Keluar")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const t = useT();
  useDocumentLang();
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser((s) => s.user);
  const logout = useUser((s) => s.logout);
  const mounted = useHydrated();

  const [scrolled, setScrolled] = useState(false);
  // On home the hero has its own search; the bar only offers one once that has scrolled away.
  const [heroSearchGone, setHeroSearchGone] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      const hero = document.querySelector("[data-hero-search]");
      setHeroSearchGone(!hero || hero.getBoundingClientRect().bottom < (TEST_MODE ? 96 : 72));
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
  const staff = isStaff(me);
  const claims = useClaimsToAnswer(me);
  const accountLinks = [TICKETS, DASHBOARD, PROFILE, ...(staff ? [CONSOLE] : [])];
  // Signing in from an event page comes back to that page.
  const loginHref = pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`;
  // The one place each person keeps coming back to, kept in the bar.
  const hub = staff ? CONSOLE : TICKETS;
  const showSearch = pathname !== "/events" && (pathname !== "/" || heroSearchGone);
  const signOut = () => {
    logout();
    setSheetOpen(false);
  };

  // Auth pages get a minimal bar: logo and language only.
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return (
      <nav className={cn("fixed z-40 w-full h-20 flex justify-center px-5 lg:px-10 bg-neutral-white border-b border-neutral-light-gray-1", TOP)}>
        <div className="max-w-7xl w-full flex items-center justify-between">
          <Logo />
          <LangToggle />
        </div>
      </nav>
    );
  }

  // Inside the console, staff work: no browsing, selling or explainer links, just the way back
  // to the site and the account menu.
  if (me && staff && isActive(pathname, CONSOLE.href)) {
    return (
      <nav data-bar="staff" className={cn("fixed z-50 w-full h-20 flex justify-center px-5 lg:px-10 bg-neutral-white border-b border-neutral-light-gray-1", TOP)}>
        <div className="max-w-7xl w-full flex items-center gap-2 sm:gap-3">
          <Logo className="[&_img]:h-6 sm:[&_img]:h-8" />
          {/* On a phone the bar is full: the chip keeps its shield, and its word for wider screens. */}
          <span
            title={t("Staff", "Staf")}
            className="inline-flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-full bg-secondary-blue-light border border-lummy-500 text-primary-navy text-sm font-medium shrink-0"
          >
            <ShieldCheck className="w-4 h-4" aria-hidden /> <span className="sr-only sm:not-sr-only">{t("Staff", "Staf")}</span>
          </span>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            {/* The logo already leads back to the site, so a phone does without this one. */}
            <Link href="/" aria-label={t("View site", "Lihat situs")} className="hidden sm:inline-flex items-center gap-1.5 text-sm text-neutral-gray hover:text-neutral-black transition-colors">
              <Globe className="w-4 h-4" /> {t("View site", "Lihat situs")}
            </Link>
            <LangToggle />
            <AccountMenu me={me} links={accountLinks} claims={claims} pathname={pathname} onSignOut={signOut} />
          </div>
        </div>
      </nav>
    );
  }

  return (
    <>
      <nav
        data-bar="site"
        className={cn(
          "fixed z-50 w-full h-20 flex justify-center px-5 lg:px-10 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
          TOP,
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
            <Link
              href={SELL.href}
              className={cn(
                "group hidden lg:inline-flex items-center gap-1.5 h-10 px-4 rounded-full border-2 font-semibold text-[15px] transition active:scale-95",
                isActive(pathname, SELL.href)
                  ? "bg-primary-navy border-primary-navy text-white"
                  : "border-primary-navy text-primary-navy hover:bg-primary-navy hover:text-white"
              )}
            >
              <Plus className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" />
              {t(SELL.en, SELL.id)}
            </Link>

            {me && (
              <span className="hidden lg:inline-flex px-1">
                <BarLink item={hub} active={isActive(pathname, hub.href)} />
              </span>
            )}

            <LangToggle />

            {/* Account menu, or the way in */}
            {me ? (
              <AccountMenu me={me} links={accountLinks} claims={claims} pathname={pathname} onSignOut={signOut} className="hidden lg:block" />
            ) : mounted ? (
              <Link
                href={loginHref}
                className="hidden lg:inline-flex items-center gap-1.5 h-10 px-4 rounded-full border-2 border-primary-navy bg-primary-sky text-primary-navy-dark font-semibold text-[15px] shadow-[2px_2px_0_#0D3B9A] transition hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_#0D3B9A] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
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
              {claims > 0 && !sheetOpen && <span aria-hidden className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-secondary-orange-dark border-2 border-neutral-white" />}
            </button>
          </div>
        </div>
      </nav>

      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-40" id="nav-sheet">
          <div className="lm-backdrop absolute inset-0 bg-neutral-black/30" onClick={() => setSheetOpen(false)} />
          <div
            className={cn(
              "lm-pop absolute inset-x-0 overflow-y-auto bg-neutral-white border-b border-neutral-light-gray-1 shadow-lummy-lg rounded-b-3xl",
              TEST_MODE ? "top-[104px] max-h-[calc(100dvh-104px)]" : "top-20 max-h-[calc(100dvh-5rem)]"
            )}
          >
            <div className="max-w-xl mx-auto px-5 pt-4 pb-6 flex flex-col gap-5">
              {pathname !== "/events" && <NavSearch onDone={() => setSheetOpen(false)} />}

              <div data-reveal="stagger" className="flex flex-col">
                {[...MAIN, ABOUT].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "flex items-center justify-between py-3 border-b border-dashed border-neutral-light-gray-1 text-xl font-semibold transition-colors",
                      isActive(pathname, l.href) ? "text-primary-navy font-semibold" : "text-neutral-black"
                    )}
                  >
                    {t(l.en, l.id)}
                  </Link>
                ))}
              </div>

              <Link href={SELL.href} onClick={() => setSheetOpen(false)} className="flex items-center justify-center gap-2 h-12 rounded-2xl border-2 border-primary-navy text-primary-navy font-semibold active:scale-[0.98] transition">
                <Plus className="w-4 h-4" /> {t(SELL.en, SELL.id)}
              </Link>

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
                        {l.href === DASHBOARD.href && <Count n={claims} label={t(`${claims} ${claims === 1 ? "claim" : "claims"} to answer`, `${claims} klaim perlu dijawab`)} />}
                      </Link>
                    ))}
                    <button onClick={signOut} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-secondary-pink-dark cursor-pointer">
                      <LogOut className="w-4 h-4" /> {t("Sign out", "Keluar")}
                    </button>
                  </div>
                </div>
              ) : mounted ? (
                <Button.Primary wrapperClass="w-full" className="w-full flex items-center justify-center gap-2" onClick={() => { setSheetOpen(false); router.push(loginHref); }}>
                  <UserIcon className="w-4 h-4" /> {t("Sign in", "Masuk")}
                </Button.Primary>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
