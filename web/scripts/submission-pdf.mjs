/**
 * Renders a submission HTML one-pager or deck to PDF.
 *
 * The card is a single continuous page rather than paginated A4, which is how
 * these were designed. Anchors survive as real link annotations, so a URL in the
 * footer is clickable in the exported file instead of being text you retype.
 *
 *   node scripts/submission-pdf.mjs ../submission/01a-protocol-camp-1page-plan.html
 *   node scripts/submission-pdf.mjs ../submission            # every .html in the folder
 */
import { chromium } from "playwright-core";
import { readdir, stat } from "node:fs/promises";
import { resolve, join, extname } from "node:path";

const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const target = resolve(process.argv[2] ?? "../submission");

const isDir = (await stat(target)).isDirectory();
const files = isDir
  ? (await readdir(target)).filter((f) => extname(f) === ".html").map((f) => join(target, f))
  : [target];

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

for (const file of files) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
  await page.goto("file://" + file, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // let the webfont land, or metrics shift mid-render

  const card = await page.evaluate(() => {
    const el = document.querySelector(".info") ?? document.body;
    const r = el.getBoundingClientRect();
    return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
  });

  const out = file.replace(/\.html$/, ".pdf");
  await page.pdf({ path: out, width: `${card.w}px`, height: `${card.h}px`, printBackground: true });
  await page.close();

  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(out);
  const links = (buf.toString("latin1").match(/\/Subtype\s*\/Link/g) ?? []).length;
  console.log(`${out.split("/").pop()}  ${card.w}x${card.h}px  ${(buf.length / 1024) | 0}KB  ${links} clickable link${links === 1 ? "" : "s"}`);
}

await browser.close();
