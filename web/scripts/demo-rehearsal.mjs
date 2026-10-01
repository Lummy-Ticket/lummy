/**
 * Walks every beat of docs/06-demo-script.md against the running app and reports
 * pass or fail for each one.
 *
 * Run this before recording the demo video. A script that has not been walked
 * through the real app is a script that breaks on camera: the previous version
 * told the presenter to click "simulate event finished" and watch funds release,
 * which stopped being true once settlement moved onto the clock.
 *
 *   npm run dev                 # in one terminal
 *   node scripts/demo-rehearsal.mjs
 *
 * Chrome path can be overridden with CHROME=/path/to/chrome.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";

const USERS = {
  buyer: { id: "u-buyer", name: "Luthfi Hadi", email: "luthfi@demo.id", role: "BUYER" },
  seller: { id: "u-seller", name: "Zahra Amelia", email: "zahra@demo.id", role: "SELLER" },
  admin: { id: "u-admin", name: "Admin Lummy", email: "admin@lummy.id", role: "ADMIN" },
};

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();

const results = [];
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 90)));

const beat = async (name, fn) => {
  try {
    results.push({ name, ok: (await fn()) === true });
  } catch (e) {
    results.push({ name, ok: false, note: e.message.split("\n")[0].slice(0, 70) });
  }
};
const signIn = (who) =>
  page.evaluate(
    (u) => localStorage.setItem("lummy:user", JSON.stringify({ state: { user: u }, version: 0 })),
    USERS[who]
  );

// Warm every route first. In dev, Next compiles a route on its first request,
// so a cold server makes the earliest beats time out and report a failure that
// is really just a slow build. Nobody should have to guess that before a shoot.
process.stdout.write("warming routes");
for (const r of ["/", "/events", "/sell", "/checkout?listing=ls-1&qty=2", "/tickets",
                 "/tickets/or-seed-2", "/seller", "/admin"]) {
  await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  process.stdout.write(".");
}
console.log(" ready\n");

await page.goto(BASE, { waitUntil: "networkidle" });

await beat("0:12  EN -> ID flips the whole page", async () => {
  await page.getByRole("button", { name: "ID", exact: true }).click();
  await page.waitForTimeout(500);
  const id = await page.locator("h1").first().innerText();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.waitForTimeout(400);
  const en = await page.locator("h1").first().innerText();
  return id.includes("Beli tiket") && en.includes("Buy resale");
});

await signIn("seller");
await beat("0:25  sample upload fills the form", async () => {
  await page.goto(`${BASE}/sell`, { waitUntil: "networkidle" });
  await page.getByText("No file handy? Use a sample").click();
  await page.waitForTimeout(300);
  await page.getByText("Analyse with AI").click();
  await page.waitForTimeout(2500);
  return page.getByText("Auto-filled details").isVisible();
});
await beat("0:35  edited ticket scores high", async () => {
  await page.goto(`${BASE}/sell`, { waitUntil: "networkidle" });
  await page.getByText("Edited ticket").click();
  await page.waitForTimeout(300);
  await page.getByText("Analyse with AI").click();
  await page.waitForTimeout(2500);
  return page.getByText(/Traces of editing/).isVisible();
});
await beat("0:42  duplicate barcode is hard-blocked", async () => {
  await page.goto(`${BASE}/sell`, { waitUntil: "networkidle" });
  await page.getByText("Duplicate barcode").click();
  await page.waitForTimeout(300);
  await page.getByText("Analyse with AI").click();
  await page.waitForTimeout(2500);
  await page.getByText("Continue to price").click();
  await page.waitForTimeout(600);
  return page.getByRole("button", { name: /Blocked \(duplicate\)/ }).isVisible();
});
await beat("0:50  last-minute listing goes to review", async () => {
  await page.goto(`${BASE}/sell`, { waitUntil: "networkidle" });
  await page.getByText("No file handy? Use a sample").click();
  await page.waitForTimeout(250);
  await page.getByText("Analyse with AI").click();
  await page.waitForTimeout(2500);
  await page.locator("select").first().selectOption("ev-wtf");
  await page.waitForTimeout(400);
  await page.getByText("Continue to price").click();
  await page.waitForTimeout(600);
  return (
    (await page.getByText(/duplicate-ticket fraud happens/).isVisible()) &&
    (await page.getByRole("button", { name: /Submit for review/ }).isVisible())
  );
});

await signIn("buyer");
await beat("1:00  checkout creates the order", async () => {
  await page.goto(`${BASE}/checkout?listing=ls-1&qty=2`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.waitForTimeout(2600);
  return page.url().includes("/tickets/or-");
});
await beat("1:10  handover doc and on-chain panel open", async () => {
  const doc = await page.getByText("Letter of authorisation").first().isVisible();
  await page.getByText("Verify it yourself on-chain").click();
  await page.waitForTimeout(400);
  // A sample order says so and links the live contract; a chain-mode order lists its transactions.
  const sample = await page.getByText("This is a sample order").isVisible();
  const onchain = await page.getByText("Escrow contract").isVisible();
  return doc && (sample || onchain);
});

await page.goto(`${BASE}/tickets/or-seed-2`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await beat("1:20  live countdown is on screen", () =>
  page.getByText("Auto-releases to the seller in").isVisible()
);
await beat("1:32  no-show is refused on the spot", async () => {
  await page.getByText("Something went wrong at the gate").click();
  await page.waitForTimeout(400);
  await page.getByText("I could not attend").click();
  await page.waitForTimeout(350);
  return (
    (await page.getByText("Not a refund case").isVisible()) &&
    (await page.getByRole("button", { name: "File dispute" }).isDisabled())
  );
});
await beat("1:45  weak evidence reads WEAK, with the reason", async () => {
  await page.getByText("Turned away at the gate").click();
  await page.waitForTimeout(300);
  await page.getByText("scanner-no-code-visible.jpg").click();
  await page.waitForTimeout(400);
  return (
    (await page.getByText("WEAK").first().isVisible()) &&
    (await page.getByText(/someone else being refused/).isVisible())
  );
});
await beat("1:55  strong evidence files the claim", async () => {
  await page.getByText("gate-scanner-rejected.jpg").click();
  await page.waitForTimeout(400);
  const strong = await page.getByText("STRONG").first().isVisible();
  await page.locator("input[type=checkbox]").check();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "File dispute" }).click();
  await page.waitForTimeout(2300);
  return strong && (await page.getByText("Under review").first().isVisible());
});
await beat("2:05  seller sees the claim and answers", async () => {
  await signIn("seller");
  await page.goto(`${BASE}/seller`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const seen = await page.getByRole("heading", { name: /Claims against you/ }).isVisible();
  await page.getByText("Answer this claim").first().click();
  await page.waitForTimeout(400);
  await page.locator("textarea").fill("Handed the ticket over three days before the show.");
  await page.getByText("handover-chat.png").click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Send answer/ }).click();
  await page.waitForTimeout(1100);
  return seen && (await page.getByText("Your answer is on file").first().isVisible());
});
await beat("2:15  arbiter sees both sides, ladder and penalty", async () => {
  await signIn("admin");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const both = await page.getByText("Seller replied").first().isVisible();
  const rungs = await page.getByRole("button", { name: /Full refund|Release to seller/ }).count();
  const penalty = await page.getByText(/40% of the sale/).first().isVisible();
  return both && rungs >= 2 && penalty;
});
await beat("2:22  verdict lands on the buyer's order", async () => {
  await page.getByRole("button", { name: /Full refund/ }).first().click();
  await page.waitForTimeout(1400);
  await signIn("buyer");
  await page.goto(`${BASE}/tickets`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  return (await page.getByText("Refunded to you").count()) >= 1;
});
await beat("2:25  bonus: organiser cancels, refund is automatic", async () => {
  await page.goto(`${BASE}/tickets/or-seed-1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.getByText("Organiser cancels").click();
  await page.waitForTimeout(1300);
  return page.getByText("Refunded to you").first().isVisible();
});

// Name rules: the organiser's rule reaches the buyer before paying, and a refusal over the name on
// a genuine ticket refunds the buyer without charging the seller.
await beat("bonus: the show's name rule is on the event page", async () => {
  await page.goto(`${BASE}/events/ev-coldplay`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  return page.getByText("Named ticket, letter accepted").first().isVisible();
});
await beat("bonus: ID-match show, the buyer confirms the risk before paying", async () => {
  await page.goto(`${BASE}/checkout?listing=ls-9&qty=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const pay = page.getByRole("button", { name: /^Pay / });
  const heldFirst = await pay.isDisabled();
  await page.getByText(/my ID card matches the name/).click();
  await page.waitForTimeout(200);
  return heldFirst && (await pay.isEnabled());
});
await beat("bonus: refused over the name, refund without a seller penalty", async () => {
  await page.goto(`${BASE}/checkout?listing=ls-1&qty=2`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.waitForURL(/\/tickets\/or-/, { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.getByText("Mark event as finished").click();
  await page.waitForTimeout(1300);
  await page.getByText("Something went wrong at the gate").click();
  await page.waitForTimeout(400);
  await page.getByText("Turned away over the name").click();
  await page.waitForTimeout(300);
  await page.getByText("gate-id-check-refused.jpg").click();
  await page.waitForTimeout(400);
  const strong = await page.getByText("STRONG").first().isVisible();
  await page.locator("input[type=checkbox]").check();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "File dispute" }).click();
  await page.waitForTimeout(2300);
  await signIn("admin");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const card = page.locator("[data-claim]", { hasText: "Turned away over the name" }).first();
  const noPenalty = await card.getByText(/charges the seller nothing/).isVisible();
  const noCharge = !(await card.getByText(/40% of the sale/).isVisible());
  return strong && noPenalty && noCharge;
});

await beat("bonus: a first visit is signed out, and a sample account returns to checkout", async () => {
  await page.evaluate(() => localStorage.removeItem("lummy:user"));
  await page.goto(BASE, { waitUntil: "networkidle" });
  const signedOut = await page.getByRole("link", { name: "Sign in" }).isVisible();
  await page.goto(`${BASE}/checkout?listing=ls-1`, { waitUntil: "networkidle" });
  await page.waitForURL((u) => u.pathname === "/login", { timeout: 10000 });
  await page.getByRole("button", { name: /^(Continue with a sample account|Sign in)$/ }).click();
  await page.waitForURL((u) => u.pathname === "/checkout", { timeout: 10000 });
  return signedOut && new URL(page.url()).searchParams.get("listing") === "ls-1";
});

await context.close();
await browser.close();

for (const r of results) {
  console.log(`${r.ok ? "PASS " : "FAIL "} ${r.name}${r.note ? `  (${r.note})` : ""}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} beats pass`);
if (pageErrors.length) console.log("page errors: " + [...new Set(pageErrors)].join(" | "));
process.exit(failed ? 1 : 0);
