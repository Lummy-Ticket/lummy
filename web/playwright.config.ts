// Browser tests (web/e2e), set up the way playwright.dev/docs/best-practices asks: locators by role
// and text, assertions that wait on their own, no fixed waits, every test on its own, traces kept
// from the first retry on CI. The @smoke tests use sample accounts only, so they write nothing to
// the database and run against lummy.id after every deploy (.github/workflows/e2e.yml).
//
//   npm run e2e                          # everything, against a local server on :3000
//   BASE=https://lummy.id npm run e2e:smoke
import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;
// Locally the Chrome already installed; on CI the Chromium that `playwright install` brings.
const chrome = CI ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // WebKit in WSL has no GPU and drops its browser under a heavy parallel load; three at a time holds.
  workers: CI ? 2 : 3,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalTimeout: 20 * 60_000,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL ?? process.env.BASE ?? "http://localhost:3000",
    timezoneId: "Asia/Jakarta",
    // As a visitor who asks for less motion: no smooth scrolling that keeps a button moving while it
    // is tapped, and no entrance still fading in when a check reads the page. motion:check covers motion.
    contextOptions: { reducedMotion: "reduce" },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // testMatch is tried on the whole path, so each names the spec file: a checkout in a folder
  // called opertix-demo would otherwise make every file in e2e a demo test, support.ts included.
  projects: [
    // Playwright's test agents (docs/testing/playwright-agents.md): the seed they start from and the
    // drafts they write, a name.draft.spec.ts on the laptop in English or a name.draft.phone.spec.ts
    // on the Android phone in Indonesian, until a person reviews one into the projects below. First
    // in the list, because an agent that names no project takes the first one, and in a project
    // without a seed it writes a blank seed over ours. Nothing here is tagged @smoke, so CI skips it.
    { name: "agents", testMatch: /\/(seed|[\w-]+\.draft)\.spec\.ts$/, use: { ...devices["Desktop Chrome"], ...chrome, locale: "en-US", viewport: { width: 1280, height: 1000 } } },
    { name: "agents-phone", testMatch: /\/(seed|[\w-]+\.draft\.phone)\.spec\.ts$/, use: { ...devices["Galaxy S24"], ...chrome, locale: "id-ID" } },
    // The five user-testing tasks (tasks/user-testing.md) on the phones testers bring, the edges of
    // a sale a buyer meets, and the accessibility audit on the Android one.
    { name: "phone", testMatch: /\/(user-tasks|buyer|a11y)\.spec\.ts$/, use: { ...devices["Galaxy S24"], ...chrome, locale: "id-ID" } },
    { name: "iphone", testMatch: /\/(user-tasks|buyer)\.spec\.ts$/, use: { ...devices["iPhone 15"], locale: "id-ID" } },
    // The demo script (docs/06), in English on a laptop, the way it is presented; what sellers and
    // staff do beyond it; and the site's headers, files and links.
    { name: "desktop", testMatch: /\/(demo|seller-staff|site)\.spec\.ts$/, use: { ...devices["Desktop Chrome"], ...chrome, locale: "en-US", viewport: { width: 1280, height: 1000 } } },
  ],
});
