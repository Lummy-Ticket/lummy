// Listings from accounts, end to end (npm run listings:check): the demo seller lists a sample
// ticket through the sell page and it goes live in the catalogue, a flagged one waits for staff
// who clear it from the admin console, a duplicate barcode and a price outside the band are
// refused, another account buys the listing (the order lands on the seller), the seller withdraws
// one, who can read which listing, and the cap for an ordinary account. Needs a running app with
// Supabase env and demo accounts, plus SUPABASE_SECRET_KEY (web/.env.local) for a throwaway
// account and the clean-up. Everything it makes is deleted at the end, even when a check fails.
//   BASE=http://127.0.0.1:3000 DEMO_KEY=... npm run listings:check
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const DEMO_KEY = process.env.DEMO_KEY ?? "";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SB_SECRET = process.env.SUPABASE_SECRET_KEY;
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "LOLOS" : "GAGAL"}  listings: ${name}${!ok && detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}

if (!SB_URL || !SB_KEY || !SB_SECRET) {
  console.log("GAGAL  listings: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dan SUPABASE_SECRET_KEY wajib ada (web/.env.local)");
  process.exit(1);
}
const ref = new URL(SB_URL).hostname.split(".")[0];
const admin = createClient(SB_URL, SB_SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const startedAt = new Date(Date.now() - 5000).toISOString();
const PLAIN_EMAIL = `listings-check-${run}@example.com`;
let plainUserId = null;
const pageErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Tulus VIP: face value 1,200,000, so the band is 600,000 to 1,800,000 per ticket.
const TULUS_VIP = { eventId: "ev-tulus", tierId: "t-tl-vip" };

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

/** A browser signed in to one demo account, with the store already showing the account. */
async function signIn(persona) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const r = await context.request.post(`${BASE}/api/demo/session`, { data: { persona }, headers: DEMO_KEY ? { "x-demo-key": DEMO_KEY } : {} });
  const json = await r.json();
  if (!r.ok()) throw new Error(`masuk ${persona} gagal: ${json.error}`);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => pageErrors.push(`${persona}: ${e.message.slice(0, 120)}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForFunction(() => (localStorage.getItem("lummy:user") ?? "").includes('"account":true'));
  return withApi(context, page, json.user);
}

function withApi(context, page, user) {
  const token = async () => {
    const parts = (await context.cookies()).filter((c) => c.name.startsWith(`sb-${ref}-auth-token`)).sort((a, b) => a.name.localeCompare(b.name));
    const raw = parts.map((c) => c.value).join("");
    const text = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64url").toString("utf8") : decodeURIComponent(raw);
    return JSON.parse(text).access_token;
  };
  return {
    context,
    page,
    user,
    list: (body) => context.request.post(`${BASE}/api/listings`, { data: body }),
    act: (id, action) => context.request.post(`${BASE}/api/listings/${id}`, { data: { action } }),
    buy: (listingId) => context.request.post(`${BASE}/api/orders`, { data: { listingId, quantity: 1 } }),
    // Straight to the database API with this account's own token, as the browser client would.
    sees: async (id) => {
      const res = await fetch(`${SB_URL}/rest/v1/listings?select=id&id=eq.${id}`, { headers: { apikey: SB_KEY, authorization: `Bearer ${await token()}` } });
      return res.ok ? (await res.json()).length === 1 : false;
    },
  };
}

const listingOf = async (id) => (await admin.from("listings").select("*").eq("id", id).maybeSingle()).data;
const inCatalogue = async (id) => (await (await fetch(`${BASE}/events/ev-tulus`)).text()).includes(id);
/** The seller's newest listing made during this run. */
const newestOf = async (sellerId) =>
  (await admin.from("listings").select("*").eq("seller_id", sellerId).gte("created_at", startedAt).order("created_at", { ascending: false }).limit(1)).data?.[0];
async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await sleep(1000);
  }
}

/** Through the sell page, the way a seller does it. */
async function listFromPage(who, sampleLabel, publishLabel) {
  await who.page.goto(`${BASE}/sell`, { waitUntil: "networkidle" });
  await who.page.getByRole("button", { name: sampleLabel }).click();
  await who.page.getByRole("button", { name: "Check the ticket" }).click();
  await who.page.getByRole("button", { name: /Continue to price/ }).click();
  await who.page.getByRole("button", { name: publishLabel }).click();
  await who.page.waitForURL((u) => u.pathname === "/seller");
  await who.page.waitForLoadState("networkidle");
}

let seller = null;
try {
  seller = await signIn("SELLER");
  const buyer = await signIn("BUYER");
  const staff = await signIn("ADMIN");

  // --- What the server refuses
  const anon = await fetch(`${BASE}/api/listings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...TULUS_VIP, askPrice: 1_300_000, quantity: 1, sample: "good" }) });
  check("jual tanpa masuk ditolak 401", anon.status === 401, String(anon.status));
  check("harga di bawah 50% harga asli ditolak", (await seller.list({ ...TULUS_VIP, askPrice: 500_000, quantity: 1, sample: "good" })).status() === 400);
  check("harga di atas 150% harga asli ditolak", (await seller.list({ ...TULUS_VIP, askPrice: 1_900_000, quantity: 1, sample: "good" })).status() === 400);
  check("kategori dari acara lain ditolak", (await seller.list({ eventId: "ev-tulus", tierId: "t-cp-cat1", askPrice: 2_300_000, quantity: 1, sample: "good" })).status() === 400);
  check("file di luar tiket contoh ditolak", (await seller.list({ ...TULUS_VIP, askPrice: 1_300_000, quantity: 1, sample: "real.pdf" })).status() === 400);
  check("barcode duplikat diblokir 409", (await seller.list({ ...TULUS_VIP, askPrice: 1_300_000, quantity: 1, sample: "dup" })).status() === 409);

  // --- A clean sample goes live straight away
  await seller.page.goto(`${BASE}/sell`, { waitUntil: "networkidle" });
  // Real uploads open only where the server checks PDFs (a pepper and a reader that works).
  const reader = (await (await fetch(`${BASE}/api/tickets/check`)).json()).available === true;
  check(
    reader ? "halaman jual: upload PDF asli dibuka, server memeriksanya" : "halaman jual jujur: upload PDF asli belum dibuka",
    await seller.page.locator(reader ? '[data-upload="real"]' : "[data-upload-closed]").waitFor({ timeout: 15000 }).then(() => true, () => false)
  );
  await listFromPage(seller, "Genuine ticket", "Publish listing");
  const live = await newestOf(seller.user.id);
  check("listing tersimpan atas nama penjual, dengan nama publik yang disingkat", live?.status === "active" && live.seller_name === "Zahra A.", `${live?.status} ${live?.seller_name}`);
  check("harga asli diambil server dari kategori", live?.face_value === 1_200_000 && live.ask_price === 1_380_000, `${live?.face_value} ${live?.ask_price}`);
  check("sinyal AI dari tabel server", live?.forgery_score === 9 && !live.pdf_suspicious && live.extraction?.sample === "good");
  // The dashboard reads the account's listings after it loads, so give the read a moment.
  check(
    "listing baru tampil di dasbor penjual",
    await seller.page.locator(`[data-listing="${live?.id}"]`).waitFor({ timeout: 15000 }).then(() => true, () => false)
  );
  check("listing baru langsung ada di katalog", await inCatalogue(live?.id));

  // --- A flagged one waits for staff, who clear it from the console
  await listFromPage(seller, "Edited ticket", "Submit for review");
  const held = await newestOf(seller.user.id);
  check("tiket editan masuk review, tidak tayang", held?.status === "review" && held.pdf_suspicious && !(await inCatalogue(held.id)), held?.status);
  check("pembeli lain tidak bisa melihat listing yang direview", !(await buyer.sees(held?.id)));
  check("penjual dan staf bisa melihatnya", (await seller.sees(held?.id)) && (await staff.sees(held?.id)));
  check("penjual tidak bisa meloloskan listingnya sendiri", (await seller.act(held?.id, "approve")).status() === 403);
  // A held listing is not a silence with no end: the seller sees the target, staff see the wait.
  await seller.page.goto(`${BASE}/seller`, { waitUntil: "networkidle" });
  const reviewNote = seller.page.locator(`[data-listing="${held?.id}"] [data-review-note]`);
  await reviewNote.waitFor();
  check("penjual melihat target review 24 jam", (await reviewNote.innerText()).includes("within 24 hours"), await reviewNote.innerText());
  await staff.page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await staff.page.getByRole("button", { name: /Listings held/ }).click();
  const card = staff.page.locator(`[data-listing="${held?.id}"]`);
  await card.waitFor();
  const wait = await card.locator("[data-review-wait]").innerText();
  check("antrean staf menunjukkan lama menunggu", /^Waiting under an hour$/.test(wait.trim()), wait);
  await card.getByRole("button", { name: /Clear listing/ }).click();
  const cleared = await until(async () => (await listingOf(held?.id))?.status === "active");
  check("staf meloloskan dari konsol, listing tayang", cleared && (await inCatalogue(held?.id)));
  check("loloskan kedua kali ditolak 409", (await staff.act(held?.id, "approve")).status() === 409);

  // --- Another account buys it, and the sale lands on the seller
  const bought = await buyer.buy(live?.id);
  const orderId = bought.ok() ? (await bought.json()).id : null;
  const order = orderId ? (await admin.from("orders").select("seller_id, seller_name").eq("id", orderId).single()).data : null;
  check("akun lain membeli listing akun, penjualannya milik penjual", order?.seller_id === seller.user.id && order.seller_name === "Zahra A.", String(bought.status()));
  check("penjual tidak bisa membeli listingnya sendiri", (await seller.buy(held?.id)).status() === 400);
  await seller.page.goto(`${BASE}/seller`, { waitUntil: "networkidle" });
  check("dasbor penjual menandai yang terjual", (await seller.page.locator(`[data-listing="${live?.id}"]`).innerText()).includes("Sold"));

  // --- The seller withdraws one; nobody else can
  const extra = await seller.list({ ...TULUS_VIP, askPrice: 1_250_000, quantity: 2, sample: "good" });
  const extraId = extra.ok() ? (await extra.json()).id : null;
  check("pembeli tidak bisa menarik listing orang lain", (await buyer.act(extraId, "withdraw")).status() === 403);
  await seller.page.goto(`${BASE}/seller`, { waitUntil: "networkidle" });
  const row = seller.page.locator(`[data-listing="${extraId}"]`);
  await row.getByRole("button", { name: "Withdraw" }).click();
  await row.getByRole("button", { name: "Sure? Withdraw" }).click();
  const withdrawn = await until(async () => (await listingOf(extraId))?.status === "cancelled");
  check("penjual menarik listing, hilang dari katalog", withdrawn && !(await inCatalogue(extraId)));
  await seller.page.waitForLoadState("networkidle");
  check("listing yang ditarik hilang dari dasbor", (await seller.page.locator(`[data-listing="${extraId}"]`).count()) === 0);

  // --- An ordinary account keeps at most three listings live or in review
  const created = await admin.auth.admin.createUser({ email: PLAIN_EMAIL, email_confirm: true, user_metadata: { full_name: "Listings Check" } });
  plainUserId = created.data.user?.id ?? null;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: PLAIN_EMAIL });
  const plainContext = await browser.newContext();
  const plainPage = await plainContext.newPage();
  await plainPage.goto(`${BASE}/auth/confirm?token_hash=${link.data.properties?.hashed_token}&type=email`, { waitUntil: "networkidle" });
  const plain = withApi(plainContext, plainPage, { id: plainUserId });
  const three = [];
  for (let i = 0; i < 3; i++) three.push((await plain.list({ ...TULUS_VIP, askPrice: 1_200_000, quantity: 1, sample: "good" })).status());
  check("akun biasa: tiga listing boleh", three.every((c) => c === 200), three.join(","));
  check("akun biasa: listing keempat ditolak 429", (await plain.list({ ...TULUS_VIP, askPrice: 1_200_000, quantity: 1, sample: "good" })).status() === 429);
  check("akun demo tidak kena batas itu", (await seller.list({ ...TULUS_VIP, askPrice: 1_200_000, quantity: 1, sample: "good" })).ok());
  await plainContext.close();
} catch (e) {
  check("alur listing selesai tanpa macet", false, e.message.split("\n")[0].slice(0, 200));
} finally {
  // Take live ones down through the app first, so the catalogue cache forgets them, then delete
  // the orders and listings this run made, then the throwaway account.
  const mine = (await admin.from("listings").select("id, status, seller_id").gte("created_at", startedAt).in("seller_id", [seller?.user.id, plainUserId].filter(Boolean))).data ?? [];
  const sellerLive = mine.filter((x) => x.status === "active" && x.seller_id === seller?.user.id).map((x) => x.id);
  const rest = mine.map((l) => l.id).filter((id) => !sellerLive.includes(id));
  if (rest.length) await admin.from("listings").update({ status: "cancelled" }).in("id", rest);
  for (const id of sellerLive) await seller.act(id, "withdraw");
  const ids = mine.map((l) => l.id);
  const orders = ids.length ? await admin.from("orders").delete().in("listing_id", ids).select("id") : { error: null };
  const listings = ids.length ? await admin.from("listings").delete().in("id", ids).select("id") : { error: null, data: [] };
  const gone = plainUserId ? await admin.auth.admin.deleteUser(plainUserId) : { error: null };
  check("data uji dibersihkan", !orders.error && !listings.error && !gone.error, orders.error?.message ?? listings.error?.message ?? gone.error?.message);
}

check("tanpa error halaman", pageErrors.length === 0, [...new Set(pageErrors)].join(" | "));
await browser.close();
console.log(failed ? `\n${failed} cek listing gagal` : "\nSemua cek listing lolos");
process.exit(failed ? 1 : 0);
