// Sign-in end to end against a running app with Supabase env (npm run auth:check). Covers the
// demo account route and its gate, the login page, Dev Panel demo accounts, the profile saved to
// the database, the admin view limited to staff, RLS through the real API with a user's own
// token, sign-out, and sample personas still working. Sends no email: magic links need a human.
//   BASE=http://127.0.0.1:3000 DEMO_KEY=... npm run auth:check
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const DEMO_KEY = process.env.DEMO_KEY ?? "";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "LOLOS" : "GAGAL"}  auth: ${name}${!ok && detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}

if (!SB_URL || !SB_KEY) {
  console.log("GAGAL  auth: NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY wajib ada (web/.env.local)");
  process.exit(1);
}
const ref = new URL(SB_URL).hostname.split(".")[0];

// --- The demo account route and its gate
const info = await (await fetch(`${BASE}/api/demo/session`)).json();
check("server menawarkan akun demo", info.available === true, JSON.stringify(info));
const post = (body, key) =>
  fetch(`${BASE}/api/demo/session`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-demo-key": key } : {}) },
    body: JSON.stringify(body),
  });
if (info.mode === "key") {
  check("tanpa demo key ditolak 401", (await post({ persona: "BUYER" })).status === 401);
  check("demo key salah ditolak 401", (await post({ persona: "BUYER" }, "salah")).status === 401);
}
check("persona tak dikenal ditolak 400", (await post({ persona: "OWNER" }, DEMO_KEY)).status === 400);
check("persona dari prototype ditolak 400", (await post({ persona: "__proto__" }, DEMO_KEY)).status === 400);
// The full address, scheme and host included: a redirect to https on a plain http server (or to
// another host) must fail here, not only in a browser.
const landsOnLoginError = async (path) => {
  const r = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return r.status >= 300 && r.status < 400 && r.headers.get("location") === `${new URL(BASE).origin}/login?error=link`;
};
check("callback tanpa kode kembali ke login", await landsOnLoginError("/auth/callback"));
check("callback dengan kode palsu kembali ke login", await landsOnLoginError("/auth/callback?code=palsu"));
check("confirm dengan token palsu kembali ke login", await landsOnLoginError("/auth/confirm?token_hash=palsu&type=email"));
check("confirm dengan tipe asing kembali ke login", await landsOnLoginError("/auth/confirm?token_hash=palsu&type=recovery"));

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));

const openPanel = async () => {
  const toggle = page.getByRole("button", { name: /^Dev panel$/ });
  if (await toggle.isVisible()) await toggle.click();
};
const identity = async () => {
  await openPanel();
  return page.locator("[data-identity]").getAttribute("data-identity");
};
const pickPersona = async (label, home) => {
  await openPanel();
  // The panel sits higher while the demo-account bar shows, so match it by its right edge only.
  await page.locator("div.fixed.right-5").getByRole("button", { name: new RegExp(`^${label}$`) }).click();
  await page.waitForURL((u) => u.pathname === home, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
};
const accessToken = async () => {
  const parts = (await context.cookies())
    .filter((c) => c.name.startsWith(`sb-${ref}-auth-token`))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!parts.length) return null;
  const raw = parts.map((c) => c.value).join("");
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64url").toString("utf8") : decodeURIComponent(raw);
  return JSON.parse(json).access_token ?? null;
};

try {
  // --- Login page
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  check("login menawarkan link masuk lewat email", await page.getByRole("button", { name: "Email me a sign-in link" }).isVisible());
  check("jalur akun contoh tetap ada", await page.getByRole("button", { name: /^Continue with a (demo|sample) account$/ }).isVisible());
  await page.getByPlaceholder("you@email.com").fill("bukan-email");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  check("email tidak valid ditolak di halaman", await page.getByText("Enter a valid email address.").isVisible());
  await page.getByPlaceholder("you@email.com").fill("zahra@demo.lummy.id");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  check("email akun demo diarahkan ke Dev Panel", await page.getByText("Demo accounts open from the Dev Panel, not by email.").isVisible());
  await page.goto(`${BASE}/login?error=link`, { waitUntil: "networkidle" });
  check("link masuk yang gagal dijelaskan", await page.getByText("That sign-in link did not work.", { exact: false }).isVisible());

  // --- Demo accounts through the Dev Panel
  await page.evaluate((key) => {
    localStorage.setItem("lummy:demo-accounts", "1");
    // The Dev Panel shows off localhost only on a device that opted in (DevPanel.tsx).
    localStorage.setItem("lummy:dev", "1");
    if (key) localStorage.setItem("lummy:demo-key", key);
  }, DEMO_KEY);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await openPanel();
  check("Dev Panel: persona = akun demo", await page.getByText("Persona (demo account)").waitFor({ timeout: 10000 }).then(() => true, () => false));
  await pickPersona("Seller", "/seller");
  check("masuk sebagai penjual demo", (await identity()) === "account" && (await page.getByText("zahra@demo.lummy.id").isVisible()));
  check("cookie sesi Supabase terpasang", !!(await accessToken()));

  // --- Profile saved to the database
  const phone = `0812-7000-${Math.floor(1000 + Math.random() * 9000)}`;
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Name" }).waitFor();
  check("profil membaca nama dari database", (await page.getByRole("textbox", { name: "Name" }).inputValue()) === "Zahra Amelia");
  await page.getByPlaceholder("0812 3456 7890").fill(phone);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Profile saved").waitFor();
  await page.getByRole("button", { name: "BNI" }).click();
  await page.getByPlaceholder("1234567890").fill("9876543210");
  await page.getByRole("button", { name: "Save account" }).click();
  await page.getByText("Payout account saved").waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Saved: BNI · 9876543210").waitFor();
  check("nomor WhatsApp tersimpan di database", (await page.getByPlaceholder("0812 3456 7890").inputValue()) === phone);
  check("rekening tersimpan di database", await page.getByText("Saved: BNI · 9876543210").isVisible());

  // --- RLS through the real API, with this user's own token
  const token = await accessToken();
  const rest = (path, init = {}) =>
    fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  const mine = await (await rest("profiles?select=id")).json();
  check("RLS: user cuma melihat profilnya sendiri", Array.isArray(mine) && mine.length === 1, JSON.stringify(mine).slice(0, 80));
  const promote = await rest(`profiles?id=eq.${mine[0]?.id}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }), headers: { prefer: "return=representation" } });
  check("RLS: user tidak bisa mengangkat diri jadi admin", promote.status === 401 || promote.status === 403, `HTTP ${promote.status}`);
  const orders = await rest("orders", { method: "POST", body: JSON.stringify({ buyer_id: mine[0]?.id, event_title: "x", event_date: new Date().toISOString(), tier_name: "x", seller_name: "x", quantity: 1, amount: 1 }) });
  check("RLS: user tidak bisa menulis pesanan sendiri", orders.status === 401 || orders.status === 403, `HTTP ${orders.status}`);

  // --- Admin view only for staff
  await pickPersona("Admin", "/admin");
  await page.waitForTimeout(1500);
  check("admin demo membuka konsol admin", new URL(page.url()).pathname === "/admin");
  const staffBar = page.locator('nav[data-bar="staff"]');
  check(
    "konsol admin memakai bar staf, tanpa tautan jelajah dan jual",
    (await staffBar.isVisible()) &&
      (await staffBar.getByRole("link", { name: "How it works" }).count()) === 0 &&
      (await staffBar.getByRole("link", { name: /Sell a ticket/ }).count()) === 0
  );
  await pickPersona("Buyer", "/");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("pembeli demo (bukan staf) ditolak dari konsol admin", new URL(page.url()).pathname !== "/admin", page.url());
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Account menu" }).click();
  // One account buys and sells: both hubs sit in the same menu, with no mode to switch.
  const items = await page.getByRole("menu").getByRole("menuitem").allInnerTexts();
  check(
    "menu akun biasa: tiket dan dasbor penjual sekaligus, tanpa konsol admin",
    items.some((x) => x.startsWith("My tickets")) && items.some((x) => x.startsWith("Seller dashboard")) && !items.some((x) => x.includes("Admin dashboard")),
    items.join(" | ")
  );
  check("tidak ada lagi pilihan tampilan pembeli atau penjual", (await page.getByRole("group", { name: "View as" }).count()) === 0);
  await page.keyboard.press("Escape");

  // --- Sign out, then sample personas still work
  await openPanel();
  await page.locator("div.fixed.right-5").getByRole("button", { name: "Sign out" }).click();
  await page.waitForTimeout(1500);
  check("keluar menghapus sesi", (await identity()) === "none" && !(await accessToken()));
  await page.evaluate(() => localStorage.removeItem("lummy:demo-accounts"));
  await page.reload({ waitUntil: "networkidle" });
  await pickPersona("Buyer", "/");
  check("persona contoh tetap jalan tanpa akun", (await identity()) === "sample" && !(await accessToken()));

  // --- A sign-in link verified by token hash, in a fresh browser (as if opened on a phone).
  // Needs the secret key to mint the link, so it only runs where web/.env.local has it.
  if (process.env.SUPABASE_SECRET_KEY) {
    const admin = createClient(SB_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: "luthfi@demo.lummy.id" });
    const fresh = await browser.newContext();
    const phone = await fresh.newPage();
    const redirectTo = encodeURIComponent(`${BASE}/auth/callback?next=${encodeURIComponent("/profile")}`);
    await phone.goto(`${BASE}/auth/confirm?token_hash=${link?.properties?.hashed_token}&type=email&redirect_to=${redirectTo}`, { waitUntil: "networkidle" });
    const freshSession = (await fresh.cookies()).some((c) => c.name.startsWith(`sb-${ref}-auth-token`));
    check("link token hash membuka sesi di browser lain", !error && freshSession && new URL(phone.url()).pathname === "/profile", error?.message ?? phone.url());
    const reused = await (await fresh.newPage()).goto(`${BASE}/auth/confirm?token_hash=${link?.properties?.hashed_token}&type=email`);
    check("link yang sama tidak bisa dipakai dua kali", reused.url().endsWith("/login?error=link"), reused.url());
    await fresh.close();
  }
} catch (e) {
  check("alur auth selesai tanpa macet", false, e.message.split("\n")[0].slice(0, 160));
}

check("tanpa error halaman", pageErrors.length === 0, [...new Set(pageErrors)].join(" | "));
await browser.close();
console.log(failed ? `\n${failed} cek auth gagal` : "\nSemua cek auth lolos");
process.exit(failed ? 1 : 0);
