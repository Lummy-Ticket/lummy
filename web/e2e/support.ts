import { test as base, expect, type Locator, type Page } from "@playwright/test";

/**
 * Every test also fails on an error the page throws or logs, not only on what it asserts: a crash,
 * a hydration mismatch, a file that is not there. A test passes only on a page with a clean console.
 */
export const test = base.extend<{ cleanConsole: void }>({
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

/**
 * Signs in with a sample account from the login page and lands on `next`, the way a tester sent to
 * the login page comes back. Nothing reaches the database.
 */
export async function signInSample(page: Page, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await tapUntil(page, page.getByRole("button", { name: /^(Lanjut dengan akun contoh|Continue with a sample account)$/ }), (u) => u.pathname === next);
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
 * Lines that claim AI does something today. Saying AI never sees an ID card, or that it is still to
 * come, is fine; claiming it reads, checks or verifies tickets on a page a visitor sees is not.
 */
export const aiClaims = (text: string) =>
  text.split("\n").filter((l) => /\bAI\b/.test(l) && !/dikirim ke AI|sent to AI|menyusul|comes next|layanan AI|AI service/.test(l));

/** The sample personas of lib/mock/seed.ts, switched the way the demo switches them. */
const PERSONAS = {
  buyer: { id: "u-buyer", name: "Luthfi Hadi", email: "luthfi@demo.id", role: "BUYER" },
  seller: { id: "u-seller", name: "Zahra Amelia", email: "zahra@demo.id", role: "SELLER" },
  admin: { id: "u-admin", name: "Admin Lummy", email: "admin@lummy.id", role: "ADMIN" },
} as const;

/** Becomes a sample persona; the next page load reads it. Sample orders and claims stay in this browser. */
export async function persona(page: Page, who: keyof typeof PERSONAS) {
  if (page.url() === "about:blank") await page.goto("/");
  await page.evaluate((u) => localStorage.setItem("lummy:user", JSON.stringify({ state: { user: u }, version: 0 })), PERSONAS[who]);
}
