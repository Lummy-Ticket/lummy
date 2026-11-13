// What a judge of NEAR HACKATHON would find at lummy.id right now, checked from outside: the pages
// and public endpoints the README sends them to, the order of 12 Nov (locked, then refunded on 13 Nov), and the gas left
// for the team's own orders. Run every three hours while the judging lasts
// (.github/workflows/judging-watch.yml in our working repository); a failed run sends an email.
// No keys, no dependencies: Node 22 and the public internet.
//
//   npm run near:watch            (BASE=http://localhost:3000 for a local server)
const BASE = process.env.BASE ?? "https://lummy.id";
/** The team's order of 12 Nov 2026: locked in the escrow until 30 Nov unless someone files a claim. */
const LOCKED = "0xcae8b654980f9b56ae6c63713f58cf0494bcbeb9ae71cd52b7a93bd63fa5c536";
/** Pays the gas of the team's orders on Arbitrum One: about 0.000026 ETH an order. */
const OPERATOR = "0x6a494D6b9099b7e14755f8d01eB2a122B86Df5f0";
const ESCROW = "0x68d535494bf33a6F483A945683Ab629D036d3cb3";
const FACTORY = "0x3dFc2bFFBfC17F1e5F741E0dCD04e8F24dd6b75C";
const BASE_USDC = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
/** The hosted demo is kept up until then (HACKATHON.md, Q-012). After it this file has no job. */
const UNTIL = Date.parse("2026-11-26T00:00:00Z");

const results = [];
const say = (level, name, note) => results.push({ level, name, note });

/** One request, tried again once after a pause: a single dropped connection is not news. */
async function ask(path, init) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      const text = await r.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        // not JSON: a page
      }
      if (r.status >= 500 && i === 0) throw new Error(`HTTP ${r.status}`);
      return { status: r.status, text, json };
    } catch (e) {
      if (i === 1) return { status: 0, text: String(e?.message ?? e), json: null };
      await new Promise((done) => setTimeout(done, 5000));
    }
  }
}
const post = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function main() {
  if (Date.now() > UNTIL) {
    console.log("The judging window is over: this watch has no job any more. Remove its workflow.");
    return 0;
  }

  const page = await ask("/near");
  say(page.status === 200 && page.text.includes("NEAR HACKATHON") ? "ok" : "fail", "the page the X post sends people to opens", `HTTP ${page.status}`);

  const options = await ask("/api/near/options");
  const o = options.json ?? {};
  const assets = Array.isArray(o.assets) ? o.assets.length : 0;
  say(o.rail === true && String(o.escrow).toLowerCase() === ESCROW.toLowerCase() && String(o.factory).toLowerCase() === FACTORY.toLowerCase() && assets >= 5 ? "ok" : "fail", "the rail is on, on the contracts the README names", `HTTP ${options.status}, rail ${o.rail}, ${assets} assets`);
  if (assets !== 15 && assets >= 5) say("warn", "NEAR Intents lists another number of the assets we offer than the README's 15", `${assets}`);

  const quote = await ask("/api/near/quote", post({ originAsset: BASE_USDC, amount: "9500000" }));
  const q = quote.json ?? {};
  say(q.amountOut === "9.5" && Number(q.amountIn) > 9.5 && Number(q.amountIn) < 10.5 ? "ok" : "fail", "a live quote from NEAR Intents for a 9.50 USDC ticket", `HTTP ${quote.status} ${quote.text.slice(0, 160)}`);

  const read = await ask("/api/near/ticket-check", post({ sample: "concert" }));
  const receipt = read.json?.receipt;
  say(read.status === 200 && receipt?.verified === true ? "ok" : "fail", "a ticket check comes back with a verified receipt", `HTTP ${read.status} ${read.text.slice(0, 160)}`);
  if (read.json?.recordedAt) say("warn", "NEAR AI did not answer, so the page is showing its recorded check", String(read.json.liveError));
  else if (receipt && !(receipt.attested === true && receipt.gpu?.ok && receipt.gpu?.fresh && receipt.gpu?.signed)) say("warn", "the live receipt came without the attestation report or NVIDIA's verdict", JSON.stringify({ attested: receipt.attested, gpu: receipt.gpu ?? null }));

  const held = await ask("/api/near/held", post({ address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", amount: "9500000" }));
  const rows = Array.isArray(held.json?.held) ? held.json.held : [];
  const unread = rows.filter((h) => h.balance === null).length;
  say(rows.length >= 5 && unread < rows.length ? "ok" : "fail", "a wallet's holdings are read", `HTTP ${held.status}, ${rows.length} assets, ${unread} not read`);
  if (unread > 0 && unread < rows.length) say("warn", "some chains were not read just now", `${unread} of ${rows.length}`);

  const history = await ask(`/api/chain/history/${LOCKED}`);
  const live = history.json?.live;
  // Locked on 12 Nov, then claimed and refunded by the team on 13 Nov (03:36 UTC). That state is final.
  say(live?.status === "Refunded" ? "ok" : "fail", "the order of 12 Nov reads Refunded, as it has since the claim of 13 Nov", `HTTP ${history.status}, ${JSON.stringify(live ?? null).slice(0, 160)}`);
  // The receipt recorded in the registry contract on NEAR mainnet on 13 Nov 2026: the live site asks the
  // contract, which must recover the TEE's signer and still hold the record.
  const onNear = await ask("/api/near/registry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signedText: "Qwen/Qwen3.8-27B:96a90952dbaad059e47a2bef0a69a8d30994be452b07f21c8a3e20248f5af455:64bb01a7e2c5dab802fcdc4fa8276d3968e883f71830b34691d404da0528f3ed", signature: "0xad16014dd0517fe7079ba74b833477f7c81b7c771fca2ba52d25a5390600a72a689a44affeb0da8296fdad6732d30cb27fd640da55dc4542e5bdee16582d8d7b1b", signer: "0x835ab53d20294ef795906dff21ae4c045336aa26" }),
  });
  const answer = onNear.status === 200 ? JSON.parse(onNear.text) : {};
  say(answer.matches && answer.recordedAt ? "ok" : "fail", "the contract on NEAR recovers the TEE signer and holds the recorded receipt", `HTTP ${onNear.status}, ${answer.account ?? "no answer"}`);
  const recent = await ask("/api/chain/recent");
  const listed = recent.status === 200 ? (JSON.parse(recent.text).orders ?? []).some((o) => o.id.toLowerCase() === LOCKED.toLowerCase()) : false;
  say(listed ? "ok" : "fail", "the public list of escrow orders names it", `HTTP ${recent.status}`);
  const proof = await ask(`/proof/${LOCKED}`);
  say(proof.status === 200 ? "ok" : "fail", "its public proof page opens", `HTTP ${proof.status}`);

  const show = await ask("/events/ev-bbw-2026");
  if (show.status !== 200) say("fail", "the show the team lists on opens", `HTTP ${show.status}`);
  else if (!show.text.includes("cloud.near.ai/verify")) say("warn", "no listing on Binance Blockchain Week shows a TEE receipt any more: list and clear another sample ticket", "the last one sold or was withdrawn");
  else say("ok", "a listing in the product shows the receipt of its TEE read");

  const cron = await ask("/api/cron/intents");
  say(cron.status === 401 ? "ok" : "fail", "the job that finishes orders is deployed, and closed to strangers", `HTTP ${cron.status}`);

  const gas = await ask("https://arb1.arbitrum.io/rpc", post({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [OPERATOR, "latest"] }));
  const eth = gas.json?.result ? Number(BigInt(gas.json.result)) / 1e18 : null;
  if (eth === null) say("warn", "the operator's gas could not be read from the public RPC", `HTTP ${gas.status}`);
  else say(eth >= 0.0002 ? "ok" : "fail", "the operator holds gas for the team's orders", `${eth.toFixed(6)} ETH, about ${Math.floor(eth / 0.000026)} orders`);
  if (eth !== null && eth >= 0.0002 && eth < 0.0004) say("warn", "the operator's gas is getting low", `${eth.toFixed(6)} ETH`);

  for (const r of results) {
    console.log(`${r.level === "ok" ? "PASS" : r.level === "warn" ? "WARN" : "FAIL"}  ${r.name}${r.level === "ok" ? "" : `  (${r.note})`}`);
    if (process.env.GITHUB_ACTIONS && r.level !== "ok") console.log(`::${r.level === "warn" ? "warning" : "error"}::${r.name}: ${r.note}`);
  }
  const failed = results.filter((r) => r.level === "fail").length;
  const checks = results.filter((r) => r.level !== "warn").length;
  console.log(`\n${checks - failed}/${checks} checks pass, ${results.filter((r) => r.level === "warn").length} warnings, ${BASE}, ${new Date().toISOString()}`);
  return failed ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
