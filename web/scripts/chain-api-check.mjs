// Dipanggil chain-api.sh. Memanggil tiap route /api/chain lewat HTTP dan mencocokkan hasilnya dengan
// aturan kontrak. Waktu Anvil dimajukan langsung lewat RPC.
const { BASE, RPC, DEMO_KEY } = process.env;
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "LOLOS" : "GAGAL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}

async function get(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, body: await r.json() };
}

async function post(path, body, key = DEMO_KEY) {
  const headers = { "content-type": "application/json", ...(key ? { "x-demo-key": key } : {}) };
  const r = await fetch(BASE + path, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

async function rpc(method, params = []) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await r.json()).result;
}

const chainNow = async () => parseInt((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp, 16);
const warp = async (seconds) => {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
};
const isHash = (h) => /^0x[0-9a-f]{64}$/i.test(h ?? "");
const listing = async (id) => (await get(`/api/chain/listing/${id}`)).body;
const act = (listingId, action, toBuyer) => post("/api/chain/action", { listingId, action, toBuyer });
const order = async (eventEndsAt) => (await post("/api/chain/order", { eventEndsAt })).body;
const history = (id) => get(`/api/chain/history/${id}`);
const kinds = (h) => (h.events ?? []).map((e) => e.kind).join(">");
// Riwayat dibaca dari event kontrak dan di-cache 5 detik, jadi tunggu sampai urutannya lengkap.
async function historyUntil(id, want) {
  let h = (await history(id)).body;
  for (let i = 0; i < 20 && kinds(h) !== want; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    h = (await history(id)).body;
  }
  return h;
}

// Info dan gerbang
const info = await get("/api/chain");
check("info: kontrak terbaca, tulis wajib demo key", info.status === 200 && info.body.readable && info.body.writeMode === "key", JSON.stringify(info.body));
check("info: window dibaca dari chain (600 detik)", info.body.disputeWindow === 600, String(info.body.disputeWindow));
check("order tanpa demo key ditolak 401", (await post("/api/chain/order", { eventEndsAt: await chainNow() }, null)).status === 401);
check("order dengan demo key salah ditolak 401", (await post("/api/chain/order", { eventEndsAt: await chainNow() }, "salah")).status === 401);
check("eventEndsAt ngawur ditolak 400", (await post("/api/chain/order", { eventEndsAt: "besok" })).status === 400);
check("id listing bukan bytes32 ditolak 400", (await get("/api/chain/listing/0x1234")).status === 400);
check("aksi tak dikenal ditolak 400", (await act("0x" + "ab".repeat(32), "sweep")).status === 400);
check("riwayat: id bukan bytes32 ditolak 400", (await history("0x1234")).status === 400);
check("riwayat: escrow yang tidak ada 404", (await history("0x" + "cd".repeat(32))).status === 404);

// Sengketa lalu putusan 50:50
const a = await order(await chainNow());
check("order: listing, fund, dan serah terima tercatat", isHash(a.txs?.create) && isHash(a.txs?.fund) && isHash(a.txs?.handover), JSON.stringify(a).slice(0, 140));
let L = await listing(a.listingId);
check("listing: DisputeWindow, 1 USDC, belum disengketakan", L.status === "DisputeWindow" && L.price === "1000000" && L.disputed === false, JSON.stringify(L).slice(0, 160));
let H = await historyUntil(a.listingId, "Listed>Funded>HandoverMarked");
check(
  "riwayat: listing, dana, dan serah terima dari event kontrak",
  kinds(H) === "Listed>Funded>HandoverMarked" && H.events.every((e) => isHash(e.tx) && e.at > 0),
  kinds(H),
);
const early = await act(a.listingId, "release");
check("rilis sebelum window lewat ditolak kontrak", early.status === 502 && early.body.error === "WindowNotElapsed", early.body.error);
const d = await act(a.listingId, "dispute");
check("sengketa dikirim operator atas nama pembeli", d.status === 200 && isHash(d.body.tx), JSON.stringify(d.body));
check("listing: disputed", (await listing(a.listingId)).disputed === true);
const r = await act(a.listingId, "resolve", "500000");
check("putusan 50:50, dana dikirim ke kedua pihak", r.status === 200 && r.body.withdrawals?.length === 2, JSON.stringify(r.body).slice(0, 140));
check("listing: Refunded", (await listing(a.listingId)).status === "Refunded");
H = await historyUntil(a.listingId, "Listed>Funded>HandoverMarked>DisputeRaised>Resolved");
const verdict = H.events?.at(-1);
check(
  "riwayat: sengketa lalu putusan 50:50",
  verdict?.kind === "Resolved" && verdict.toBuyer === "500000" && verdict.toSeller === "500000",
  kinds(H),
);

// Rilis setelah window lewat
const b = await order(await chainNow());
await warp(601);
const rel = await act(b.listingId, "release");
check("rilis setelah window, dana dikirim ke seller", rel.status === 200 && rel.body.withdrawals?.length === 1, JSON.stringify(rel.body).slice(0, 140));
check("listing: Released", (await listing(b.listingId)).status === "Released");
H = await historyUntil(b.listingId, "Listed>Funded>HandoverMarked>Released");
check("riwayat: pencairan ke seller", H.events?.at(-1)?.amount === "1000000" && H.live?.status === "Released", kinds(H));

// Acara besok: window menunggu acara selesai (keputusan G)
const now = await chainNow();
const c = await order(now + 86400);
L = await listing(c.listingId);
check("deadline = acara selesai + window", L.deadline === now + 86400 + 600, `${L.deadline} vs ${now + 86400 + 600}`);
await warp(700);
const tooSoon = await act(c.listingId, "release");
check("rilis ditolak selama acara belum selesai", tooSoon.status === 502 && tooSoon.body.error === "WindowNotElapsed", tooSoon.body.error);
const ref = await act(c.listingId, "refund");
check("refund sebelum acara (mis. acara batal)", ref.status === 200 && ref.body.withdrawals?.length === 1, JSON.stringify(ref.body).slice(0, 140));

// Setelah window tutup tanpa sengketa, refund ditolak
const e = await order(await chainNow());
await warp(601);
const late = await act(e.listingId, "refund");
check("refund setelah window tutup ditolak kontrak", late.status === 502 && late.body.error === "WindowClosed", late.body.error);

console.log(failed ? `\n${failed} cek gagal` : "\nSemua cek route API lolos");
process.exit(failed ? 1 : 0);
