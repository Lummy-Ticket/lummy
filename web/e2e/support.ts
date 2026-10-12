import { expect, type Page } from "@playwright/test";

/** Whether the tests run against this machine, where the dev panel always shows. */
export const isLocal = (baseURL: string | undefined) => /\/\/(localhost|127\.0\.0\.1)\b/.test(baseURL ?? "");

/**
 * Signs in with a sample account from the login page and lands on `next`, the way a tester sent to
 * the login page comes back. Nothing reaches the database.
 */
export async function signInSample(page: Page, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: /^(Lanjut dengan akun contoh|Continue with a sample account)$/ }).click();
  await expect(page).toHaveURL((u) => u.pathname === next);
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
