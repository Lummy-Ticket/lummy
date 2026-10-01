import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

const EXEC = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = "http://localhost:3000";
const OUT = process.argv[2] || "/tmp/shots";

// route, name, optional pre-action (clicks) as selector list
const ROUTES = [
  ["/", "01-home"],
  ["/events", "02-events"],
  ["/events/ev-coldplay", "03-event-detail"],
  ["/checkout?listing=ls-1", "04-checkout"],
  ["/tickets", "05-tickets"],
  ["/tickets/or-seed-1", "06-transparency"],
  ["/sell", "07-sell"],
  ["/seller", "08-seller"],
  ["/admin", "09-admin"],
  ["/profile", "10-profile"],
  ["/how-it-works", "11-how"],
  ["/login", "12-login"],
];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

if (!existsSync(EXEC)) { console.error("chromium not found:", EXEC); process.exit(1); }
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  // A first visit starts signed out, so the account pages are shot as the sample buyer.
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("lummy:user"))
      localStorage.setItem("lummy:user", JSON.stringify({ state: { user: { id: "u-buyer", name: "Luthfi Hadi", email: "luthfi@demo.id", role: "BUYER" } }, version: 0 }));
  });
  const page = await ctx.newPage();
  for (const [route, name] of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(700);
      const file = `${OUT}/${name}-${vp.name}.png`;
      await page.screenshot({ path: file, fullPage: vp.name === "desktop" });
      console.log("shot", file);
    } catch (e) {
      console.error("FAIL", route, e.message);
    }
  }
  await ctx.close();
}
await browser.close();
console.log("done");
