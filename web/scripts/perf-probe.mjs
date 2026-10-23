// Pengukuran, bukan lulus/gagal (npm run perf:probe): di HP lambat (CPU 4x lebih lambat),
// median dari 5 kali per halaman, kapan isi pertama di layar mulai terlihat. Pakai setelah
// mengubah animasi masuk, supaya "ringan" tetap terukur. Angka absolut ikut beban mesin;
// bandingkan dalam satu sesi.
//   BASE=http://127.0.0.1:3000 npm run perf:probe
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const RUNS = 5;
const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function once(path, selector) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`${BASE}${path}`, { waitUntil: "commit" });
  const t = await page.evaluate(
    (sel) =>
      new Promise((resolve) => {
        const start = performance.now();
        const tick = () => {
          const el = document.querySelector(sel);
          if (el && parseFloat(getComputedStyle(el).opacity) >= 0.05) return resolve(Math.round(performance.now()));
          if (performance.now() - start > 15000) return resolve(-1);
          requestAnimationFrame(tick);
        };
        tick();
      }),
    selector
  );
  await context.close();
  return t;
}

for (const [path, sel, label] of [
  ["/events", 'a.lm-in[href^="/events/"]', "kartu acara pertama"],
  ["/events/ev-gnr-jakarta", "div.lm-in.rounded-2xl", "listing pertama"],
  ["/how-it-works", "[data-reveal]", "reveal pertama"],
]) {
  await fetch(`${BASE}${path}`); // hangatkan cache server
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await once(path, sel));
  console.log(`${path.padEnd(22)} ${label.padEnd(20)} median ${median(runs)}ms  [${runs.join(", ")}]`);
}
await browser.close();
