// Orders with an account, end to end (npm run orders:check): buying through the checkout with a
// demo account, the order read back under RLS, one set of seats for two buyers pressing Pay at
// once, the catalogue updated, the handover log, a claim with the seller's answer and the staff
// verdict, the payout once the window has passed, who may read or act on an order, and the cap
// on open orders for an ordinary account while payment is simulated, then the presenter's reset
// (demo accounts back to one order in every phase, the seed catalogue whole again). Needs a running app with
// Supabase env and demo accounts, plus SUPABASE_SECRET_KEY (web/.env.local) to set up its own
// listings and a throwaway account. Everything it makes is deleted at the end, even when a check
// fails. CHAIN=1 also pays the checkout through the escrow contract the server points at (the
// server needs the operator keys, and the claim and verdict then run on chain too).
//   BASE=http://127.0.0.1:3000 DEMO_KEY=... npm run orders:check
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const DEMO_KEY = process.env.DEMO_KEY ?? "";
const CHAIN = process.env.CHAIN === "1";
const EXEC = process.env.CHROME ?? "/opt/google/chrome/chrome";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SB_SECRET = process.env.SUPABASE_SECRET_KEY;
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "LOLOS" : "GAGAL"}  orders: ${name}${!ok && detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}

if (!SB_URL || !SB_KEY || !SB_SECRET) {
  console.log("GAGAL  orders: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dan SUPABASE_SECRET_KEY wajib ada (web/.env.local)");
  process.exit(1);
}
const ref = new URL(SB_URL).hostname.split(".")[0];
const admin = createClient(SB_URL, SB_SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
// Our own listings, so the seed stays as it is: one the demo seller owns, one nobody does, and
// one with seats enough to reach the open-order limit of an ordinary account.
const L1 = `ls-check-${run}-a`;
const L2 = `ls-check-${run}-b`;
const L3 = `ls-check-${run}-c`;
// A seed listing the reset must put back on sale (quantity 2, active in the seed).
const SEED_TOUCHED = "ls-12";
// An ordinary account for that limit. Created without sending any email and deleted at the end.
const PLAIN_EMAIL = `orders-check-${run}@example.com`;
let plainUserId = null;
const pageErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const token = async () => {
    const parts = (await context.cookies()).filter((c) => c.name.startsWith(`sb-${ref}-auth-token`)).sort((a, b) => a.name.localeCompare(b.name));
    const raw = parts.map((c) => c.value).join("");
    const text = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64url").toString("utf8") : decodeURIComponent(raw);
    return JSON.parse(text).access_token;
  };
  return {
    context,
    page,
    user: json.user,
    act: (id, body) => context.request.post(`${BASE}/api/orders/${id}`, { data: body }),
    buy: (body) => context.request.post(`${BASE}/api/orders`, { data: body }),
    // Straight to the database API with this account's own token, as the browser client would.
    rows: async (ids) => {
      const res = await fetch(`${SB_URL}/rest/v1/orders?select=id&id=in.(${ids.join(",")})`, {
        headers: { apikey: SB_KEY, authorization: `Bearer ${await token()}` },
      });
      return res.ok ? (await res.json()).map((o) => o.id).sort() : [`HTTP ${res.status}`];
    },
  };
}

const orderOf = async (listingId) =>
  (await admin.from("orders").select("*, disputes(*, dispute_replies(*))").eq("listing_id", listingId).order("created_at")).data ?? [];
const claimOf = (o) => (Array.isArray(o?.disputes) ? o.disputes[0] : o?.disputes) ?? null;
const listingOf = async (id) => (await admin.from("listings").select("quantity, status").eq("id", id).single()).data;
/** Waits for the database to say something, since the page acts on its own clock. */
async function until(fn, ms = 25000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await sleep(1000);
  }
}

try {
  const buyer = await signIn("BUYER");
  const seller = await signIn("SELLER");
  const staff = await signIn("ADMIN");

  const base = { event_id: "ev-5sos-jakarta", tier_id: "t-5sos-cat4", ask_price: 1000000, face_value: 910000, status: "active", gate_ktp: true };
  const made = await admin.from("listings").insert([
    { ...base, id: L1, seller_id: seller.user.id, seller_name: seller.user.name, quantity: 2, splittable: true },
    { ...base, id: L2, seller_id: null, seller_name: "Lummy test", quantity: 1, splittable: false },
    { ...base, id: L3, seller_id: null, seller_name: "Lummy test", quantity: 6, splittable: true },
  ]);
  check("listing uji dibuat", !made.error, made.error?.message);

  // --- Who may buy
  const anon = await fetch(`${BASE}/api/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId: L2, quantity: 1 }) });
  check("beli tanpa masuk ditolak 401", anon.status === 401, String(anon.status));
  const own = await seller.buy({ listingId: L1, quantity: 1 });
  check("penjual tidak bisa membeli listingnya sendiri", own.status() === 400, String(own.status()));
  const tooMany = await buyer.buy({ listingId: L2, quantity: 2 });
  check("jumlah melebihi stok ditolak 409", tooMany.status() === 409, String(tooMany.status()));

  // --- Two buyers press Pay on the last seat at the same moment: one gets it.
  const race = await Promise.all([buyer.buy({ listingId: L2, quantity: 1 }), buyer.buy({ listingId: L2, quantity: 1 })]);
  const statuses = race.map((r) => r.status()).sort();
  check("satu kursi, dua pembayaran bersamaan: satu lolos, satu 409", statuses[0] === 200 && statuses[1] === 409, statuses.join(","));
  check("listing yang habis jadi sold", (await listingOf(L2))?.status === "sold");
  const [raceOrder] = await orderOf(L2);
  check("tepat satu pesanan tersimpan", (await orderOf(L2)).length === 1);

  // --- The checkout in the browser, as the buyer would use it
  if (CHAIN) {
    await buyer.page.evaluate((key) => {
      localStorage.setItem("lummy:chain-on", "1");
      if (key) localStorage.setItem("lummy:demo-key", key);
    }, DEMO_KEY);
  }
  await buyer.page.goto(`${BASE}/checkout?listing=${L1}&qty=1`, { waitUntil: "networkidle" });
  // With QRIS on (a Xendit test key on the server), the account pays through it, and Xendit's
  // simulator stands in for the buyer's app (docs/09 §6; payments:check covers that path in full).
  const qris = !CHAIN && (await buyer.page.locator("[data-qris-note]").isVisible());
  if (CHAIN) check("checkout: mode chain aktif", await buyer.page.getByText("Chain mode: a real escrow", { exact: false }).isVisible());
  else if (qris) check("checkout: bayar lewat QRIS mode test", true);
  else check("checkout: bilang pembayarannya simulasi", await buyer.page.locator("[data-simulated-payment]").isVisible());
  // Where the gate matches the ID to the name (events.transfer_policy id_match, as for 5 Seconds of
  // Summer on SODTix's terms), Pay waits until the buyer says they understand that risk.
  const pay = buyer.page.getByRole("button", { name: /^Pay Rp/ });
  const nameRisk = buyer.page.getByRole("checkbox", { name: /my ID card matches the name on the ticket/ });
  const { data: show } = await admin.from("events").select("transfer_policy").eq("id", base.event_id).single();
  if (show?.transfer_policy === "id_match") {
    check("checkout: aturan nama harus diakui sebelum bayar", (await pay.isDisabled()) && (await nameRisk.isVisible()));
    await nameRisk.check();
  } else {
    check("checkout: tanpa pengakuan nama kalau acaranya tidak mencocokkan KTP", (await nameRisk.count()) === 0, show?.transfer_policy ?? "null");
  }
  await pay.click();
  if (qris) await buyer.page.locator("[data-qris-simulate]").click();
  await buyer.page.waitForURL(/\/tickets\/or-/, { timeout: CHAIN ? 120000 : 30000 });
  const orderId = new URL(buyer.page.url()).pathname.split("/").pop();
  await buyer.page.getByRole("heading", { name: "5 Seconds of Summer: Everyone's a Star! Jakarta" }).waitFor();
  check("checkout mendarat di tiket yang baru dibeli", orderId.startsWith("or-"), orderId);
  check("tiket akun tanpa kontrol prototipe", !(await buyer.page.getByText("Prototype controls").isVisible()));

  const [o1] = await orderOf(L1);
  check("pesanan tersimpan untuk akun pembeli dan penjual", o1?.id === orderId && o1.buyer_id === buyer.user.id && o1.seller_id === seller.user.id);
  // No e-stamp is charged until a licensed provider adds one (web/src/lib/features.ts, eStamp).
  check("harga dan biaya layanan dihitung server, tanpa biaya materai", o1?.amount === 1000000 && o1.fee === 50000 && o1.materai === 0, `${o1?.amount}/${o1?.fee}/${o1?.materai}`);
  const endsAt = new Date(o1?.event_ends_at).getTime();
  if (CHAIN) {
    check("escrow on-chain tercatat", /^0x[0-9a-f]{64}$/.test(o1?.onchain_listing_id ?? "") && !!o1.tx_fund && o1.escrow_status === "DisputeWindow", o1?.escrow_status);
  } else {
    check("jadwal acara jadi awal masa sengketa", endsAt === new Date("2026-12-06T18:00:00+07:00").getTime() + 4 * 3_600_000, o1?.event_ends_at);
    check("pembayaran simulasi: tanpa escrow on-chain", !o1?.onchain_listing_id && o1?.escrow_status === "Funded");
  }
  check("sebagian set dibeli: sisa 1 tetap dijual", JSON.stringify(await listingOf(L1)) === JSON.stringify({ quantity: 1, status: "active" }));

  // The catalogue is in every page: the sold listing is gone, the one with a seat left is not.
  const html = await (await fetch(`${BASE}/events/ev-5sos-jakarta`)).text();
  check("katalog langsung diperbarui", html.includes(L1) && !html.includes(L2));

  // --- Who can read which order, through the database API with each account's own token
  const ids = [orderId, raceOrder.id].sort();
  check("pembeli membaca kedua pesanannya", JSON.stringify(await buyer.rows(ids)) === JSON.stringify(ids));
  check("penjual cuma membaca penjualannya sendiri", JSON.stringify(await seller.rows(ids)) === JSON.stringify([orderId]));
  check("staf membaca semuanya", JSON.stringify(await staff.rows(ids)) === JSON.stringify(ids));
  const anonRows = await fetch(`${SB_URL}/rest/v1/orders?select=id&id=in.(${ids.join(",")})`, { headers: { apikey: SB_KEY } });
  check("tanpa masuk tidak ada pesanan terbaca", !anonRows.ok || (await anonRows.json()).length === 0);
  check("bukan pihak: pesanan orang lain tidak ada (404)", (await seller.act(raceOrder.id, { action: "settle" })).status() === 404);

  // --- The buyer's list
  await buyer.page.goto(`${BASE}/tickets`, { waitUntil: "networkidle" });
  const links = await buyer.page.locator('a[href^="/tickets/or-"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  check("daftar tiket memuat pesanan akun", links.includes(`/tickets/${orderId}`) && links.includes(`/tickets/${raceOrder.id}`), links.join(" "));
  check("daftar tiket tanpa pesanan contoh", !links.some((h) => h.includes("or-seed-")));

  // --- The handover log: the first open counts, a later one changes nothing
  await buyer.page.goto(`${BASE}/tickets/${orderId}`, { waitUntil: "networkidle" });
  await buyer.page.getByRole("button", { name: /Letter of authorisation/ }).click();
  const opened = await until(async () => (await orderOf(L1))[0]?.docs_letter_at);
  check("membuka surat kuasa tercatat di database", !!opened);
  // The draft is a real PDF to download, with the order on it.
  const [draft] = await Promise.all([buyer.page.waitForEvent("download"), buyer.page.getByRole("button", { name: "Download draft (PDF)" }).click()]);
  const draftHead = readFileSync(await draft.path()).subarray(0, 5).toString("latin1");
  check("draf surat kuasa terunduh sebagai PDF", draft.suggestedFilename() === `draf-surat-kuasa-${orderId}.pdf` && draftHead === "%PDF-", `${draft.suggestedFilename()} ${draftHead}`);
  await buyer.page.keyboard.press("Escape");
  await buyer.page.getByRole("button", { name: "Download draft (PDF)" }).waitFor({ state: "hidden" });
  await buyer.act(orderId, { action: "docs", which: "letter" });
  check("buka kedua tidak menggeser catatan", (await orderOf(L1))[0]?.docs_letter_at === opened);
  check("penjual tidak bisa mencatat buka dokumen", (await seller.act(orderId, { action: "docs", which: "letter" })).status() === 403);

  // --- A claim, checked by the server's own rules
  check("klaim gate sebelum acara ditolak", (await buyer.act(orderId, { action: "dispute", reason: "GATE_DENIED", note: "", evidence: "gate-scanner-rejected.jpg" })).status() === 400);
  check("bukti karangan ditolak", (await buyer.act(orderId, { action: "dispute", reason: "NOT_AS_LISTED", note: "", evidence: "palsu.jpg" })).status() === 400);
  check("berhalangan hadir bukan klaim", (await buyer.act(orderId, { action: "dispute", reason: "NO_SHOW", note: "" })).status() === 400);
  check("penjual tidak bisa mengajukan klaim", (await seller.act(orderId, { action: "dispute", reason: "NOT_DELIVERED", note: "" })).status() === 403);

  await buyer.page.getByRole("button", { name: "Problem with this ticket?" }).click();
  await buyer.page.getByRole("radio", { name: "Ticket differs from the listing" }).check();
  await buyer.page.getByRole("button", { name: "ticket-received.jpg" }).click();
  await buyer.page.getByPlaceholder("Which gate, what the staff said...").fill("Dapat Reguler tapi yang datang tribun belakang.");
  await buyer.page.getByRole("checkbox", { name: /I declare/ }).check();
  await buyer.page.getByRole("button", { name: "File dispute" }).click();
  const filed = await until(async () => {
    const o = (await orderOf(L1))[0];
    return o?.disputed && claimOf(o) ? o : null;
  }, CHAIN ? 90000 : 25000);
  const claim = claimOf(filed);
  check("klaim dari halaman tiket tersimpan", claim?.reason === "NOT_AS_LISTED" && claim.note_en.startsWith("Dapat Reguler"));
  check("detail bukti diambil server, bukan dari browser", claim?.evidence?.fileName === "ticket-received.jpg" && claim.evidence.showsBarcode === true);
  check("klaim kedua ditolak 409", (await buyer.act(orderId, { action: "dispute", reason: "NOT_DELIVERED", note: "" })).status() === 409);

  // --- The seller answers from their dashboard
  await seller.page.goto(`${BASE}/seller`, { waitUntil: "networkidle" });
  const card = seller.page.locator(`[data-claim="${orderId}"]`);
  await card.waitFor();
  check("klaim muncul di dasbor penjual", await card.isVisible());
  // The seller signs the letter, so the draft is on their side too (a show that checks names).
  const [sellerDraft] = await Promise.all([seller.page.waitForEvent("download"), seller.page.locator(`[data-draft-letter="${orderId}"]`).click()]);
  const sellerHead = readFileSync(await sellerDraft.path()).subarray(0, 5).toString("latin1");
  check("penjual bisa mengunduh draf surat kuasa", sellerDraft.suggestedFilename() === `draf-surat-kuasa-${orderId}.pdf` && sellerHead === "%PDF-", `${sellerDraft.suggestedFilename()} ${sellerHead}`);
  await card.getByRole("button", { name: "Answer this claim" }).click();
  await card.getByPlaceholder("What actually happened, in your words...").fill("Tiketnya sesuai listing, ini chat serah terimanya.");
  await card.getByRole("button", { name: "handover-chat.png" }).click();
  await card.getByRole("button", { name: "Send answer" }).click();
  await card.getByText("Your answer is on file, waiting on staff").waitFor();
  const replies = claimOf((await orderOf(L1))[0])?.dispute_replies ?? [];
  check("jawaban penjual tersimpan dengan lampirannya", replies.length === 1 && replies[0].from_seller && replies[0].evidence?.fileName === "handover-chat.png");
  check("jawaban kedua ditolak 409", (await seller.act(orderId, { action: "reply", note: "lagi" })).status() === 409);
  check("penjual tidak bisa memutus", (await seller.act(orderId, { action: "verdict", remedy: "RELEASE_SELLER" })).status() === 403);
  check("pembeli tidak bisa memutus", (await buyer.act(orderId, { action: "verdict", remedy: "REFUND_FULL" })).status() === 403);

  // --- Staff rules from the admin console
  await staff.page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const staffCard = staff.page.locator(`[data-claim="${orderId}"]`);
  await staffCard.waitFor();
  check("klaim masuk antrean admin", await staffCard.isVisible());
  await staffCard.getByRole("button", { name: /Partial refund/ }).click();
  const ruled = await until(async () => {
    const o = (await orderOf(L1))[0];
    return o?.escrow_status === "Refunded" ? o : null;
  }, CHAIN ? 90000 : 25000);
  const verdict = claimOf(ruled);
  check("putusan: refund sebagian dan penalti penjual 40%", verdict?.verdict_remedy === "REFUND_PARTIAL" && verdict.refund_amount === 500000 && verdict.seller_penalty === 400000, JSON.stringify(verdict ?? {}).slice(0, 160));
  check("alasan putusan ditulis server", !!verdict?.rationale_en && verdict.decided_by === staff.user.id);
  if (CHAIN) check("putusan dijalankan kontrak", !!ruled?.tx_settle);
  check("putusan kedua ditolak 409", (await staff.act(orderId, { action: "verdict", remedy: "REFUND_FULL" })).status() === 409);
  await buyer.page.reload({ waitUntil: "networkidle" });
  check("pembeli melihat putusannya", await buyer.page.getByText("Verdict: partial refund").isVisible());

  // --- Silence settles it: once the window has passed, opening the ticket pays the seller.
  check("cair sebelum waktunya ditolak 409", (await buyer.act(raceOrder.id, { action: "settle" })).status() === 409);
  const past = Date.now() - 50 * 3_600_000;
  await admin
    .from("orders")
    .update({ event_ends_at: new Date(past).toISOString(), dispute_deadline: new Date(past + 48 * 3_600_000).toISOString() })
    .eq("id", raceOrder.id);
  await buyer.page.goto(`${BASE}/tickets/${raceOrder.id}`, { waitUntil: "networkidle" });
  const released = await until(async () => (await orderOf(L2))[0]?.escrow_status === "Released");
  check("masa sengketa lewat: cair otomatis ke penjual", released && (await orderOf(L2))[0]?.auto_released === true);
  await buyer.page.reload({ waitUntil: "networkidle" });
  check("halaman tiket bilang sudah cair", await buyer.page.getByText(/Paid out to the seller\.|Released to the seller/).first().isVisible());
  check("pesanan yang sudah cair tidak bisa diklaim", (await buyer.act(raceOrder.id, { action: "dispute", reason: "NOT_DELIVERED", note: "" })).status() === 409);

  // --- While payment is simulated, an ordinary account holds at most three open orders, so
  // nobody can empty the shared catalogue for free. Signed in the way a sign-in link does it.
  const created = await admin.auth.admin.createUser({ email: PLAIN_EMAIL, email_confirm: true, user_metadata: { full_name: "Orders Check" } });
  plainUserId = created.data.user?.id ?? null;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: PLAIN_EMAIL });
  const plain = await browser.newContext();
  await (await plain.newPage()).goto(`${BASE}/auth/confirm?token_hash=${link.data.properties?.hashed_token}&type=email`, { waitUntil: "networkidle" });
  // With QRIS on, an ordinary account must pay through it (the straight path answers 409), and
  // Xendit's test simulator stands in for the buyer's app; the cap holds there too.
  const qrisOn = (await (await fetch(`${BASE}/api/payments`)).json().catch(() => ({}))).enabled === true;
  const plainBuy = async () => {
    if (!qrisOn) return (await plain.request.post(`${BASE}/api/orders`, { data: { listingId: L3, quantity: 1 } })).status();
    const start = await plain.request.post(`${BASE}/api/payments`, { data: { listingId: L3, quantity: 1 } });
    if (start.status() !== 200) return start.status();
    const { id } = await start.json();
    const paid = await plain.request.post(`${BASE}/api/payments/${id}`, { data: { action: "simulate" } });
    return paid.status() === 200 && (await paid.json()).status === "paid" ? 200 : paid.status();
  };
  if (qrisOn) {
    const straight = await plain.request.post(`${BASE}/api/orders`, { data: { listingId: L3, quantity: 1 } });
    check("akun biasa: jalur langsung tertutup selama QRIS aktif (409)", straight.status() === 409, String(straight.status()));
  }
  const firstThree = [await plainBuy(), await plainBuy(), await plainBuy()];
  check("akun biasa: tiga pesanan berjalan boleh", firstThree.every((c) => c === 200), firstThree.join(","));
  const fourth = await plainBuy();
  check("akun biasa: pesanan keempat ditolak 429", fourth === 429, String(fourth));
  check("yang ditolak tidak mengambil kursi", JSON.stringify(await listingOf(L3)) === JSON.stringify({ quantity: 3, status: "active" }));
  check("akun demo tidak kena batas itu", (await buyer.buy({ listingId: L3, quantity: 1 })).status() === 200);
  await plain.close();

  // --- The presenter's reset. A seed listing that sold out comes back, and (in chain mode) an
  // escrow a demo order still holds is closed instead of left locked.
  const mode = (await (await fetch(`${BASE}/api/demo/session`)).json()).mode;
  if (mode === "key") check("reset tanpa demo key ditolak 401", (await fetch(`${BASE}/api/demo/reset`, { method: "POST" })).status === 401);
  await admin.from("listings").update({ status: "sold" }).eq("id", SEED_TOUCHED);
  // One more purchase by the demo buyer, which also expires the catalogue cache. In chain mode it
  // is an escrow still holding money when the reset comes.
  let heldEscrow = null;
  const extra = await buyer.context.request.post(`${BASE}/api/orders`, {
    data: { listingId: L3, quantity: 1, chain: CHAIN },
    headers: CHAIN ? { "x-demo-key": DEMO_KEY } : {},
  });
  if (CHAIN) {
    const extraId = extra.ok() ? (await extra.json()).id : "";
    const held = (await orderOf(L3)).find((o) => o.id === extraId);
    heldEscrow = held?.onchain_listing_id ?? null;
    check("pesanan chain yang masih menahan dana dibuat", !!heldEscrow);
  }
  check("sebelum reset: listing seed yang habis hilang dari katalog", extra.ok() && !(await (await fetch(`${BASE}/events/ev-5sos-jakarta`)).text()).includes(SEED_TOUCHED));

  // From the Dev Panel, as a presenter would: two clicks, then the page loads again.
  await buyer.page.evaluate((key) => {
    localStorage.setItem("lummy:demo-accounts", "1");
    // The Dev Panel shows off localhost only on a device that opted in (DevPanel.tsx).
    localStorage.setItem("lummy:dev", "1");
    if (key) localStorage.setItem("lummy:demo-key", key);
  }, DEMO_KEY);
  await buyer.page.goto(`${BASE}/tickets`, { waitUntil: "networkidle" });
  await buyer.page.getByRole("button", { name: /^Dev panel$/ }).click();
  await buyer.page.getByRole("button", { name: "Reset demo accounts" }).click();
  const reloaded = buyer.page.waitForEvent("load", { timeout: CHAIN ? 90000 : 30000 });
  await buyer.page.getByRole("button", { name: "Sure? Deletes the demo accounts' orders" }).click();
  await reloaded;
  await buyer.page.waitForLoadState("networkidle");

  const demoOrders = (await admin.from("orders").select("id, escrow_status, disputed, seller_id, event_ends_at, disputes(*)").eq("buyer_id", buyer.user.id).order("id")).data ?? [];
  const seededIds = demoOrders.map((o) => o.id).join(",");
  check("reset: pembeli demo punya tepat lima pesanan, satu di tiap fase", seededIds === "or-demo-1,or-demo-2,or-demo-3,or-demo-4,or-demo-5", seededIds);
  const byId = Object.fromEntries(demoOrders.map((o) => [o.id, o]));
  const inReview = byId["or-demo-4"];
  check("reset: klaim yang sedang ditinjau ditujukan ke penjual demo", inReview?.disputed && inReview.seller_id === seller.user.id && claimOf(inReview)?.reason === "BARCODE_USED" && !claimOf(inReview)?.decided_at);
  check("reset: putusan lama tercatat atas nama staf demo", claimOf(byId["or-demo-5"])?.decided_by === staff.user.id && byId["or-demo-5"]?.escrow_status === "Refunded");
  const windowLeft = new Date(byId["or-demo-2"]?.event_ends_at).getTime() + 48 * 3_600_000 - Date.now();
  check("reset: masa sengketa satu pesanan sedang berjalan", windowLeft > 40 * 3_600_000 && windowLeft < 43 * 3_600_000, String(windowLeft));
  check("reset: listing seed yang habis dijual lagi", JSON.stringify(await listingOf(SEED_TOUCHED)) === JSON.stringify({ quantity: 2, status: "active" }));
  check("reset: katalog langsung ikut", (await (await fetch(`${BASE}/events/ev-5sos-jakarta`)).text()).includes(SEED_TOUCHED));
  if (CHAIN) {
    const live = await (await fetch(`${BASE}/api/chain/listing/${heldEscrow}`)).json();
    check("reset: escrow yang masih terkunci dikembalikan ke pembeli di kontrak", live.status === "Refunded", live.status ?? live.error);
  }

  const links2 = await buyer.page.locator('a[href^="/tickets/or-"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  check("reset: tiket saya menampilkan kelima pesanan", links2.filter((h) => h.startsWith("/tickets/or-demo-")).length === 5, links2.join(" "));
  await buyer.page.goto(`${BASE}/tickets/or-demo-2`, { waitUntil: "networkidle" });
  check("reset: hitung mundur masa sengketa tampil", await buyer.page.getByText("Auto-releases to the seller in").isVisible());

  await seller.page.goto(`${BASE}/seller`, { waitUntil: "networkidle" });
  await seller.page.locator('[data-claim="or-demo-4"]').waitFor();
  check("reset: klaim muncul di dasbor penjual demo", await seller.page.locator('[data-claim="or-demo-4"]').isVisible());
  await seller.page.getByRole("button", { name: "Account menu" }).click();
  const menuItem = await seller.page.getByRole("menuitem", { name: /Seller dashboard/ }).innerText();
  check("menu akun memberi tahu ada klaim yang perlu dijawab", menuItem.includes("1"), menuItem);
  await seller.page.keyboard.press("Escape");
  await staff.page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await staff.page.locator('[data-claim="or-demo-4"]').waitFor();
  check("reset: klaim muncul di antrean admin", await staff.page.locator('[data-claim="or-demo-4"]').isVisible());
  const heldDemo = (await admin.from("listings").select("status, seller_id, pdf_suspicious").eq("id", "ls-demo-held").single()).data;
  check("reset: satu listing ter-flag penjual demo menunggu review", heldDemo?.status === "review" && heldDemo.seller_id === seller.user.id && heldDemo.pdf_suspicious);
  const hers = (await admin.from("listings").select("id").eq("id", "ls-1").eq("seller_id", seller.user.id)).data ?? [];
  check("reset: listing contoh atas nama Zahra jadi milik penjual demo", hers.length === 1);

  const again = await fetch(`${BASE}/api/demo/reset`, { method: "POST", headers: DEMO_KEY ? { "x-demo-key": DEMO_KEY } : {} });
  const count = (await admin.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", buyer.user.id)).count;
  check("reset kedua kali tetap lima pesanan", again.ok && count === 5, `${again.status} ${count}`);
} catch (e) {
  check("alur pesanan selesai tanpa macet", false, e.message.split("\n")[0].slice(0, 200));
} finally {
  // Orders first (their claims go with them), then the listings they point at, then the account.
  const orders = await admin.from("orders").delete().in("listing_id", [L1, L2, L3]).select("id");
  await admin.from("payments").delete().in("listing_id", [L1, L2, L3]);
  const listings = await admin.from("listings").delete().in("id", [L1, L2, L3]).select("id");
  const gone = plainUserId ? await admin.auth.admin.deleteUser(plainUserId) : { error: null };
  await admin.from("listings").update({ quantity: 2, status: "active" }).eq("id", SEED_TOUCHED);
  // The reset may already have removed the listing the demo seller owns, so count what is left.
  const left = (await admin.from("listings").select("id").in("id", [L1, L2, L3])).data?.length;
  check(
    "data uji dibersihkan",
    !orders.error && !listings.error && left === 0 && !gone.error,
    orders.error?.message ?? listings.error?.message ?? gone.error?.message ?? `${left} listing uji tersisa`
  );
}

check("tanpa error halaman", pageErrors.length === 0, [...new Set(pageErrors)].join(" | "));
await browser.close();
console.log(failed ? `\n${failed} cek pesanan gagal` : "\nSemua cek pesanan lolos");
process.exit(failed ? 1 : 0);
