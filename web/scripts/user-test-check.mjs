/**
 * Walks the five user-testing tasks (tasks/user-testing.md) the way a first-time tester does:
 * a 360 px phone set to Indonesian, signed out, a sample account only, so nothing reaches the
 * database. Run it before each round of testing, against lummy.id or a local server:
 *
 *   BASE=https://lummy.id npm run ut:check
 *   BASE=https://lummy.id W=412 H=915 npm run ut:check    # another screen size
 *   BASE=https://lummy.id BROWSER=webkit W=390 H=844 npm run ut:check    # Safari's engine
 *
 * Chrome path can be overridden with CHROME=/path/to/chrome, and WebKit's with
 * WEBKIT=/path/to/pw_run.sh when the cached build is not the one playwright-core expects.
 */
import { chromium, webkit } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const local = /\/\/(localhost|127\.0\.0\.1)\b/.test(BASE);

const browser =
  process.env.BROWSER === "webkit"
    ? await webkit.launch(process.env.WEBKIT ? { executablePath: process.env.WEBKIT } : {})
    : await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: Number(process.env.W ?? 360), height: Number(process.env.H ?? 780) },
  isMobile: true,
  hasTouch: true,
  locale: "id-ID",
  timezoneId: "Asia/Jakarta",
});
const page = await context.newPage();

const results = [];
const pageErrors = [];
const wide = new Set();
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 90)));

const beat = async (name, fn) => {
  try {
    results.push({ name, ok: (await fn()) === true });
  } catch (e) {
    results.push({ name, ok: false, note: e.message.split("\n")[0].slice(0, 70) });
  }
};
const settle = (ms = 800) => page.waitForTimeout(ms);
const text = () => page.evaluate(() => document.body.innerText);
const go = async (path) => {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
  await settle();
};
// Wider than the phone means a sideways scroll, which a tester feels at once.
const checkWidth = async () => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) wide.add(new URL(page.url()).pathname);
};
// Lines that claim AI does something today. Saying AI never sees an ID card, or that it is still
// to come, is fine; claiming it reads, checks or verifies tickets now is not (it does not).
const aiClaims = (t) =>
  t.split("\n").filter((l) => /\bAI\b/.test(l) && !/dikirim ke AI|sent to AI|menyusul|comes next|layanan AI|AI service/.test(l));

// 0. First visit
await beat("first visit follows the phone: Indonesian, with the switch in the bar", async () => {
  await go("/");
  const lang = await page.evaluate(() => document.documentElement.lang);
  const toggle = await page.locator('[data-bar="site"]').getByRole("button", { name: "ID", exact: true }).isVisible();
  await checkWidth();
  return lang === "id" && toggle;
});
await beat(`dev panel ${local ? "shown on a local host" : "hidden from visitors"}`, async () => {
  const shown = await page.getByRole("button", { name: /^(Dev panel|Panel dev)$/ }).isVisible();
  return local ? shown : !shown;
});
await beat("no page or link preview claims AI checks tickets", async () => {
  const found = [];
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  if (/\bAI\b/.test(description ?? "")) found.push("meta description");
  for (const path of ["/", "/events", "/events/ev-tulus", "/how-it-works", "/about"]) {
    await go(path);
    await checkWidth();
    for (const l of aiClaims(await text())) found.push(`${path}: ${l.slice(0, 50)}`);
  }
  if (found.length) throw new Error(found[0]);
  return true;
});

// 1. Find a concert and its cheapest price
await beat("1 search finds a show and its cheapest price", async () => {
  await go("/");
  const box = page.locator("[data-hero-search] input").first();
  await box.fill("tulus");
  await box.press("Enter");
  await page.waitForURL(/\/events\?q=/, { timeout: 15000 });
  await settle();
  await page.locator('a[href^="/events/ev-"]').first().click();
  await page.waitForURL(/\/events\/ev-/, { timeout: 15000 });
  await settle();
  await checkWidth();
  return (await page.getByText("Termurah").first().isVisible()) && (await page.getByText("Mulai dari").isVisible());
});

// 2. Buy one ticket with a sample account
await beat("2 one ticket, sample account, told the payment is simulated", async () => {
  await page.getByRole("group", { name: "Jumlah tiket" }).getByRole("button", { name: "1", exact: true }).click();
  await settle(400);
  await page.getByRole("button", { name: /^Beli$/ }).first().click();
  await page.waitForURL(/\/login/, { timeout: 15000 });
  await page.getByRole("button", { name: /Lanjut dengan akun contoh/ }).click();
  await page.waitForURL(/\/checkout/, { timeout: 15000 });
  await settle();
  await checkWidth();
  const note = await page.locator("[data-sample-payment]").isVisible();
  await page.getByRole("button", { name: /^Bayar / }).click();
  await page.waitForURL(/\/tickets\/or-/, { timeout: 30000 });
  await settle(1200);
  return note;
});

// 3. Where the money is, and when it moves
await beat("3 the ticket says the money is held, and until when", async () => {
  await checkWidth();
  const t = await text();
  return t.includes("Dana terkunci") && t.includes("48 jam");
});
await beat("3 my tickets shows the ticket price, not a wrong total", async () => {
  await go("/tickets");
  await checkWidth();
  const t = await text();
  return t.includes("Harga tiket") && !t.includes("Total dibayar");
});

// 4. Turned away at the gate, on the show that has just ended
await beat("4 a gate claim is filed, graded in Indonesian, payout on hold", async () => {
  await page.getByText(/Tulus: Manusia Tour, Surabaya/).first().click();
  await page.waitForURL(/\/tickets\/or-/, { timeout: 15000 });
  await settle();
  await page.getByText("Ada masalah di gate").first().click();
  await settle(500);
  await page.getByText(/^Ditolak di gate$/).first().click();
  await settle(400);
  await page.getByText("gate-scanner-rejected.jpg").click();
  await settle(500);
  const graded = await page.getByText("KUAT").first().isVisible();
  await page.locator(".lm-dialog input[type=checkbox]").check();
  await page.getByRole("button", { name: /Kirim sengketa/ }).click();
  await settle(2500);
  await checkWidth();
  const t = await text();
  return graded && t.includes("Menunggu putusan klaim") && !t.includes("Cair otomatis pada") && !t.includes("“”");
});

// 5. Sell a sample ticket
await beat("5 a sample ticket is checked and listed, with no AI claim", async () => {
  await go("/sell");
  await page.getByText(/Gak punya file\? Pakai contoh/).click();
  await settle(300);
  await page.getByRole("button", { name: "Cek tiketnya" }).click();
  await settle(3000);
  await checkWidth();
  const t = await text();
  const honest = aiClaims(t).length === 0 && t.includes("Cek tiket") && t.includes("Data dari tiket contoh");
  await page.getByRole("button", { name: /Lanjut ke harga/ }).click();
  await settle();
  await page.getByRole("button", { name: /Publish listing|Ajukan untuk review/ }).first().click();
  await page.waitForURL(/\/seller/, { timeout: 15000 });
  return honest;
});

await beat("no page wider than the phone", async () => {
  if (wide.size) throw new Error([...wide].join(", "));
  return true;
});

await context.close();
await browser.close();

for (const r of results) {
  console.log(`${r.ok ? "PASS " : "FAIL "} ${r.name}${r.note ? `  (${r.note})` : ""}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} pass`);
if (pageErrors.length) console.log("page errors: " + [...new Set(pageErrors)].join(" | "));
process.exit(failed ? 1 : 0);
