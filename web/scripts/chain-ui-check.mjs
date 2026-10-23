// Alur pembeli dan admin di browser dengan mode chain menyala: checkout, panel on-chain, sengketa,
// putusan, dan pencairan setelah window, dicocokkan dengan kontrak.
//   Dipanggil chain-e2e.sh terhadap Anvil (waktu dilompati), atau
//   npm run chain:live terhadap Arbitrum Sepolia asli, lewat `npm run dev` yang sedang jalan atau
//   lummy.id (BASE=https://lummy.id DEMO_KEY=...). Menunggu window sungguhan, sekitar 12 menit,
//   memakai 2 USDC testnet dan 1 dikembalikan.
import { chromium } from "playwright-core";

const LIVE = process.env.LIVE === "1";
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const RPC = process.env.RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";
const DEMO_KEY = process.env.DEMO_KEY ?? "";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const USERS = {
  buyer: { id: "u-buyer", name: "Raka Pratama", email: "raka@demo.id", role: "BUYER" },
  admin: { id: "u-admin", name: "Admin Lummy", email: "admin@lummy.id", role: "ADMIN" },
};
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "LOLOS" : "GAGAL"}  UI: ${name}${!ok && detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}

async function rpc(method, params = []) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await r.json()).result;
}

const receiptOk = async (hash) => (await rpc("eth_getTransactionReceipt", [hash]))?.status === "0x1";

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
page.setDefaultTimeout(30000);
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 90)));

const as = (who) =>
  page.evaluate((u) => localStorage.setItem("lummy:user", JSON.stringify({ state: { user: u }, version: 0 })), USERS[who]);
const txLinks = () =>
  page.$$eval('a[href*="/tx/0x"]', (links) => [...new Set(links.map((a) => a.getAttribute("href").split("/tx/")[1]))]);

async function checkout() {
  await page.goto(`${BASE}/checkout?listing=ls-1&qty=2`, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByText("Chain mode: a real escrow on Arbitrum Sepolia").waitFor();
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.waitForURL(/\/tickets\/or-/, { timeout: 90000 });
  await page.waitForLoadState("networkidle");
}

try {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 90000 });
  await page.evaluate((key) => {
    localStorage.setItem("lummy:chain-on", "1");
    if (key) localStorage.setItem("lummy:demo-key", key);
    localStorage.setItem("lummy:demo-event-ended", "1");
  }, DEMO_KEY);
  await as("buyer");

  // Checkout jadi escrow sungguhan
  await checkout();
  const orderUrl = page.url();
  check("checkout mode chain membuat pesanan", orderUrl.includes("/tickets/or-"));
  await page.getByText("Verify it yourself on-chain").click();
  await page.getByText("Handover proof tx").waitFor();
  await page.getByText("DisputeWindow").first().waitFor();
  check("panel membaca status dari kontrak", true);
  check("panel bukan pesanan contoh", !(await page.getByText("This is a sample order").isVisible()));
  const first = await txLinks();
  const firstOk = await Promise.all(first.map(receiptOk));
  check("tautan panel = tiga tx asli yang sukses di chain", first.length >= 3 && firstOk.every(Boolean), first.join(", "));

  // Riwayat dari event kontrak, lalu halaman bukti publik yang bisa dibagikan
  await page.getByText("The buyer's money is locked in escrow").waitFor({ timeout: 60000 });
  check("riwayat escrow dari event kontrak tampil di halaman tiket", await page.getByText("Recorded on the blockchain").first().isVisible());
  await page.getByText("Open the public proof page").click();
  await page.waitForURL(/\/proof\/0x[0-9a-fA-F]{64}$/);
  await page.getByText("Rules the contract enforces").waitFor({ timeout: 60000 });
  await page.getByText("Handover recorded").waitFor();
  const proofText = await page.locator("main").innerText();
  check(
    "halaman bukti publik tampil tanpa data pribadi",
    !proofText.includes(USERS.buyer.name) && !proofText.includes(USERS.buyer.email) && !proofText.includes("Coldplay"),
    proofText.slice(0, 120),
  );
  // Balik ke tiket: panel teknis tertutup lagi setelah halaman dimuat ulang, jadi dibuka lagi.
  await page.goto(orderUrl, { waitUntil: "networkidle" });
  await page.getByText("Verify it yourself on-chain").click();
  await page.getByText("Handover proof tx").waitFor();

  // Sengketa masuk ke kontrak
  await page.getByText("Something went wrong at the gate").click();
  await page.getByText("Turned away at the gate").click();
  await page.getByText("gate-scanner-rejected.jpg").click();
  await page.locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: "File dispute" }).click();
  await page.getByText("DisputeWindow, disputed").waitFor({ timeout: 60000 });
  check("sengketa tercatat di kontrak", true);

  // Putusan admin dijalankan kontrak: refund penuh
  await as("admin");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const card = page.locator("div.rounded-3xl", { has: page.locator("h3", { hasText: "Coldplay" }) }).first();
  await card.getByRole("button", { name: /Full refund/ }).click();
  await page.getByText("Upheld: full refund").waitFor({ timeout: 90000 });
  check("putusan admin terkirim ke kontrak", true);
  await as("buyer");
  await page.goto(orderUrl, { waitUntil: "networkidle" });
  await page.getByText("Verify it yourself on-chain").click();
  await page.getByText("Refunded").first().waitFor();
  const refunded = (await page.getByText("Refund tx").isVisible()) && (await page.getByText("Payout tx").first().isVisible());
  check("pesanan Refunded menurut kontrak, dengan tx refund dan tx kirim dana", refunded);
  await page.getByText("Claim decided").waitFor({ timeout: 60000 });
  check("putusan tercatat di riwayat escrow", true);

  // Diam berarti beres: window lewat di jam chain, halaman memicu pencairan. Di Anvil waktunya
  // dilompati; di testnet ditunggu sungguhan.
  await checkout();
  if (!LIVE) {
    await rpc("evm_increaseTime", [601]);
    await rpc("evm_mine");
  } else {
    console.log("       menunggu window 10 menit di Arbitrum Sepolia...");
  }
  await page.getByText("Verify it yourself on-chain").click();
  await page.getByText("Release tx").waitFor({ timeout: LIVE ? 15 * 60_000 : 90000 });
  check("window lewat: kontrak membayar penjual, tx pencairan tampil", true);
  const second = await txLinks();
  const secondOk = await Promise.all(second.map(receiptOk));
  check("semua tx pesanan kedua sukses di chain", second.length >= 5 && secondOk.every(Boolean), second.join(", "));
  if (LIVE) {
    console.log("\nTx dari app (Arbiscan):");
    for (const h of [...first, ...second]) console.log(`  https://sepolia.arbiscan.io/tx/${h}`);
  }
} catch (e) {
  check("alur UI selesai tanpa macet", false, e.message.split("\n")[0].slice(0, 160));
}

check("tanpa error halaman", pageErrors.length === 0, [...new Set(pageErrors)].join(" | "));
await browser.close();
console.log(failed ? `\n${failed} cek UI gagal` : "\nSemua cek UI mode chain lolos");
process.exit(failed ? 1 : 0);
