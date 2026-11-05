import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { SEED_LISTINGS, isBuyable, seedEvents, type SeedEvent } from "../src/lib/mock/seed";
import type { Listing } from "../src/lib/mock/types";

/**
 * Waits until React holds what a visitor can use on the page. A tap before that does nothing, as on a
 * slow phone. Text used to double as this signal on the Indonesian phones, because it switched only
 * after hydration, until the server rendered the visitor's language itself (5 Nov 2026). A page with
 * no React on it, such as robots.txt, just runs out the wait.
 */
async function hydrated(page: Page) {
  await page
    .waitForFunction(
      () => {
        const controls = [...document.querySelectorAll("main a, main button, main input, nav a, nav button")];
        return controls.length > 0 && controls.every((c) => Object.keys(c).some((k) => k.startsWith("__reactFiber$")));
      },
      undefined,
      { timeout: 10_000 }
    )
    .catch(() => {});
}

/**
 * Every test also fails on an error the page throws or logs, not only on what it asserts: a crash,
 * a hydration mismatch, a file that is not there. A test passes only on a page with a clean console.
 */
export const test = base.extend<{ cleanConsole: void }>({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await hydrated(page);
      return response;
    };
    await provide(page);
  },
  cleanConsole: [
    async ({ page }, use) => {
      const errors: string[] = [];
      // WebKit reports a same-origin fetch cut short by leaving the page as an access-control
      // failure (the dev panel's, on a local host). The same words about another host still count.
      const cutShort = (text: string) => {
        const host = URL.canParse(page.url()) ? new URL(page.url()).host : "";
        return !!host && /access control checks/.test(text) && text.includes(host);
      };
      page.on("pageerror", (e) => {
        if (!cutShort(e.message)) errors.push(`thrown: ${e.message.slice(0, 200)}`);
      });
      page.on("console", (m) => {
        if (m.type() === "error" && !cutShort(m.text())) errors.push(`logged: ${m.text().slice(0, 200)} (${m.location().url})`);
      });
      await use();
      expect(errors, "errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Whether the tests run against this machine, where the dev panel always shows. */
export const isLocal = (baseURL: string | undefined) => /\/\/(localhost|127\.0\.0\.1)\b/.test(baseURL ?? "");

/** The login page's button for a sample persona, which it calls a demo account (a sample account before 24 Oct 2026). */
export const DEMO_SIGN_IN = /^(Lanjut dengan akun (demo|contoh)|Continue with a (demo|sample) account)$/;

/**
 * Signs in with a sample account from the login page and lands on `next`, the way a tester sent to
 * the login page comes back. Nothing reaches the database.
 */
export async function signInSample(page: Page, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await tapUntil(page, page.getByRole("button", { name: DEMO_SIGN_IN }), (u) => u.pathname === next);
}

/**
 * Taps a button that leads to another page, and taps again while it has not: a tap that lands
 * before the page is ready does nothing, as on a slow phone. Only for buttons that a second tap
 * cannot repeat (a sign-in, or a payment whose dialog covers the button once it starts).
 */
export async function tapUntil(page: Page, button: Locator, arrived: (url: URL) => boolean) {
  await expect(async () => {
    if (await button.isVisible()) await button.click({ timeout: 3_000 });
    await expect(page).toHaveURL(arrived, { timeout: 6_000 });
  }).toPass({ timeout: 45_000 });
}

/** A page wider than the phone scrolls sideways, which a tester feels at once. */
export async function expectFitsScreen(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

/**
 * Lines that claim AI does something it does not. Saying AI never sees an ID card, or that it is
 * still to come, is fine. Since 20 Oct 2026 Claude fills the sell form in from a real ticket's
 * cleaned text, so a line that names Claude describes what is live; a line that says AI checks or
 * verifies tickets is still not true, since the checks are the barcode reader and the PDF forensics.
 */
export const aiClaims = (text: string) =>
  text.split("\n").filter((l) => /\bAI\b/.test(l) && !/dikirim ke AI|sent to AI|menyusul|comes next|layanan AI|AI service|\bClaude\b/.test(l));

/** The sample personas of lib/mock/seed.ts, switched the way the demo switches them. */
const PERSONAS = {
  buyer: { id: "u-buyer", name: "Raka Pratama", email: "raka@demo.lummy.id", role: "BUYER" },
  seller: { id: "u-seller", name: "Maya Kusuma", email: "maya@demo.lummy.id", role: "SELLER" },
  admin: { id: "u-admin", name: "Admin Lummy", email: "admin@demo.lummy.id", role: "ADMIN" },
} as const;

/** Becomes a sample persona; the next page load reads it. Sample orders and claims stay in this browser. */
export async function persona(page: Page, who: keyof typeof PERSONAS) {
  if (page.url() === "about:blank") await page.goto("/");
  await page.evaluate((u) => localStorage.setItem("lummy:user", JSON.stringify({ state: { user: u }, version: 0 })), PERSONAS[who]);
}

// --- Shows and listings that are still to come (tasks 11.8) ---
// Tests name no show or listing by id when its date matters: every show in the catalogue is real
// and passes on its own date, and a test that names one breaks the day after. These pick from the
// seed (which the database mirrors) the first show at least three days away that fits, and fail
// with a plain message once the catalogue runs out, which is the cue to add the next real shows.

const AHEAD_MS = 3 * 86_400_000;
const upcoming = () =>
  seedEvents()
    .filter((e) => Date.parse(e.dateISO) > Date.now() + AHEAD_MS)
    .sort((a, b) => Date.parse(a.dateISO) - Date.parse(b.dateISO));
const onSale = (e: SeedEvent) => SEED_LISTINGS.filter((l) => l.eventId === e.id && l.status === "active");

/** The first upcoming show that fits and has listings on sale. */
export function showWhere(what: string, fits: (e: SeedEvent, listings: Listing[]) => boolean): SeedEvent {
  const e = upcoming().find((x) => fits(x, onSale(x)));
  if (!e) throw new Error(`no upcoming show in the seed is ${what}: add the next real shows (tasks 12.7)`);
  return e;
}

/** The first listing on an upcoming show that fits. */
export function listingWhere(what: string, fits: (l: Listing, e: SeedEvent) => boolean): Listing {
  for (const e of upcoming()) {
    const l = onSale(e).find((x) => fits(x, e));
    if (l) return l;
  }
  throw new Error(`no listing on an upcoming show in the seed is ${what}: add the next real shows (tasks 12.7)`);
}

export const rupiah = (e: SeedEvent) => (e.currency ?? "IDR") === "IDR";
export { isBuyable };

/** A rupiah show whose cheapest listing sells one ticket, the count its page opens on, and that listing. */
export function cheapestSingle(): { show: SeedEvent; listing: Listing } {
  for (const e of upcoming().filter(rupiah)) {
    const ls = onSale(e).filter(isBuyable);
    if (!ls.length) continue;
    const low = Math.min(...ls.map((l) => l.askPrice));
    const l = ls.find((x) => x.askPrice === low && (x.splittable || x.quantity === 1));
    if (l) return { show: e, listing: l };
  }
  throw new Error("no upcoming rupiah show opens on a single ticket: add the next real shows (tasks 12.7)");
}
