// The @smoke tests the way Checkly runs them against lummy.id (lummy.check.ts): the laptop project
// only (the demo script and the site checks), with Playwright's own Chromium, since the shared
// config asks for an installed Chrome unless CI is set. One retry rides out a blip, and the time is
// capped, because Checkly counts a suite's runs by the half minute and the free plan has 1,000.
// Locally: BASE_URL=http://127.0.0.1:3000 npx playwright test -c monitoring/playwright.config.ts
import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

const laptop = base.projects?.find((p) => p.name === "desktop");
if (!laptop) throw new Error('playwright.config.ts has no "desktop" project for the monitor to run');

export default defineConfig({
  ...base,
  // Paths in this file resolve from monitoring/, so they point back to the shared ones.
  testDir: "../e2e",
  outputDir: "../test-results",
  grep: /@smoke/,
  retries: 1,
  workers: 2,
  // The suite takes about 20 seconds against a local server. Three minutes is six runs at most,
  // even when lummy.id hangs and every test waits out its timeout.
  timeout: 60_000,
  globalTimeout: 3 * 60_000,
  reporter: [["list"]],
  use: { ...base.use, baseURL: process.env.BASE_URL ?? "https://lummy.id" },
  projects: [{ ...laptop, use: Object.fromEntries(Object.entries(laptop.use ?? {}).filter(([key]) => key !== "channel")) }],
});
