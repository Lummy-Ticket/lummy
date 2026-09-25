// Animasi reveal (MotionObserver) terhadap app yang sedang jalan (npm run motion:check):
// yang di layar saat halaman dibuka tampil sejak awal, tanpa menunggu JavaScript; yang di
// bawah layar ditahan lalu naik saat di-scroll; navigasi antarhalaman tetap beranimasi; dan
// tanpa JavaScript atau dengan reduced motion tidak ada yang tersembunyi. Menangkap bug
// yang pernah ada: elemen yang dipindah React di DOM tertahan di opacity 0 selamanya.
//   BASE=http://127.0.0.1:3000 npm run motion:check
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "LOLOS" : "GAGAL"}  reveal: ${name}${!ok && detail ? `  (${detail})` : ""}`); if (!ok) failed++; };

// Opacity of every [data-reveal] target (the element, or each child of a stagger list), split
// by whether it is on screen right now.
const sample = (page) => page.evaluate(() => {
  const out = { on: [], off: [] };
  document.querySelectorAll("[data-reveal]").forEach((el) => {
    const targets = el.getAttribute("data-reveal") === "stagger" ? Array.from(el.children) : [el];
    const r = el.getBoundingClientRect();
    const visible = r.bottom > 0 && r.top < innerHeight && r.width > 0;
    targets.forEach((t) => (visible ? out.on : out.off).push(parseFloat(getComputedStyle(t).opacity)));
  });
  return out;
});

// 1. Hard load: what is on screen shows at once, before and after hydration. A tall window,
//    so some reveals are on screen at load and the check has something to prove.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2200 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/how-it-works`, { waitUntil: "domcontentloaded" });
  // What is already painted when the page arrives must never dip while hydration and the
  // observer start: that dip is the flash this guards against. Content that streams in after
  // the observer starts is new to the page, so it may rise in; it is not watched here.
  const mins = await page.evaluate(() => new Promise((resolve) => {
    const shown = Array.from(document.querySelectorAll("[data-reveal]"))
      .flatMap((el) => {
        const r = el.getBoundingClientRect();
        if (!(r.bottom > 0 && r.top < innerHeight && r.width > 0)) return [];
        return el.getAttribute("data-reveal") === "stagger" ? Array.from(el.children) : [el];
      })
      .filter((t) => parseFloat(getComputedStyle(t).opacity) === 1);
    const min = shown.map(() => 1);
    const start = performance.now();
    const tick = () => {
      shown.forEach((t, i) => (min[i] = Math.min(min[i], parseFloat(getComputedStyle(t).opacity))));
      if (performance.now() - start < 2500) requestAnimationFrame(tick);
      else resolve(min);
    };
    tick();
  }));
  check(`muat ulang: yang sudah terlihat tidak berkedip (${mins.length} elemen diamati)`, mins.every((m) => m === 1), JSON.stringify(mins));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const late = await sample(page);
  check("muat ulang: semua yang di layar akhirnya tampil penuh", late.on.length > 0 && late.on.every((o) => o === 1), JSON.stringify(late.on));
  check("muat ulang: yang di bawah layar ditahan", late.off.length > 0 && late.off.every((o) => o === 0), JSON.stringify(late.off.slice(0, 6)));

  // 2. Below the fold rises in when it arrives
  const idx = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-reveal]")).findIndex((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.top > innerHeight;
    })
  );
  const target = page.locator("[data-reveal]").nth(idx);
  const before = await target.evaluate((el) => parseFloat(getComputedStyle(el.getAttribute("data-reveal") === "stagger" ? el.children[0] : el).opacity));
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600);
  const risen = await target.evaluate((el) => {
    const t = el.getAttribute("data-reveal") === "stagger" ? el.children[0] : el;
    return parseFloat(getComputedStyle(t).opacity);
  });
  check("scroll: target di bawah layar awalnya ditahan", idx >= 0 && before === 0, `idx ${idx}, opacity ${before}`);
  check("scroll: elemen di bawah naik dan tampil penuh", risen === 1, String(risen));

  // 3. Client navigation still animates the new page
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.locator('nav a[href="/how-it-works"]').first().click();
  await page.waitForURL("**/how-it-works");
  // The URL changes before React commits the new page: wait for its content, then sample.
  await page.waitForFunction(() => document.querySelectorAll("[data-reveal]").length > 0);
  const during = await sample(page);
  await page.waitForTimeout(2000);
  const after = await sample(page);
  check("navigasi: halaman baru beranimasi masuk", during.on.some((o) => o < 1), JSON.stringify(during.on));
  check("navigasi: lalu tampil penuh", after.on.length > 0 && after.on.every((o) => o === 1), JSON.stringify(after.on));
  await ctx.close();
}

// 4. Without JavaScript nothing is hidden
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/how-it-works`, { waitUntil: "load" });
  const s = await sample(page);
  check("tanpa JavaScript: semua tampil", [...s.on, ...s.off].every((o) => o === 1));
  await ctx.close();
}

// 5. Reduced motion: nothing is held
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/how-it-works`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const s = await sample(page);
  check("reduced motion: tidak ada yang ditahan", [...s.on, ...s.off].every((o) => o === 1));
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} cek reveal gagal` : "\nSemua cek reveal lolos");
process.exit(failed ? 1 : 0);
