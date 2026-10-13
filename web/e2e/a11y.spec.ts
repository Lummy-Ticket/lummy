import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, signInSample, test } from "./support";

// The pages testers and buyers use, checked by axe against WCAG 2.1 A and AA on a phone. Serious
// and critical problems fail; the rest is listed in the report for the next pass. Motion is reduced
// and the page's heading awaited first, so an entrance still fading in is not read as faint text.

const PUBLIC = ["/", "/events", "/events/ev-tulus", "/how-it-works", "/login"];
const SIGNED_IN = ["/tickets", "/sell", "/checkout?listing=ls-1&qty=1"];

async function audit(page: Page, path: string) {
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  // A toast ("signed in with a sample account") fades in and out; it is gone in seconds.
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 10_000 });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  for (const v of results.violations.filter((x) => !serious.includes(x))) {
    test.info().annotations.push({ type: `a11y ${v.impact}`, description: `${path}: ${v.id} on ${v.nodes.length} element(s): ${v.help}` });
  }
  expect(
    serious.map((v) => `${v.id} (${v.impact}) on ${v.nodes.length}: ${v.help}. First: ${v.nodes[0]?.target.join(" ")}`),
    `serious accessibility problems on ${path}`
  ).toEqual([]);
}

test.describe("accessibility", { tag: "@a11y" }, () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const path of PUBLIC) {
    test(`public ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "id");
      await audit(page, path);
    });
  }

  for (const path of SIGNED_IN) {
    test(`signed in ${path}`, async ({ page }) => {
      const [pathname] = path.split("?");
      await signInSample(page, pathname === "/checkout" ? "/" : pathname);
      if (pathname === "/checkout") await page.goto(path);
      await audit(page, path);
    });
  }
});
