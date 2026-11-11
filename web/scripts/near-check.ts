/**
 * What the NEAR HACKATHON work promises, offline: no network, no key, no database, so a judge or CI can
 * run it from a fresh clone.
 *
 *   npm run near:check
 *
 * The receipt from NEAR AI: a real ECDSA signature over `model:request_hash:response_hash` passes, and
 * any other text, signer, or kind of signature fails. The verification link carries exactly what NEAR's
 * Verification Center reads. The 1Click request asks for the exact amount at the receiver, with refunds
 * on the chain paid from. A listing links a receipt only when it was verified and attested. Who may pay
 * for real: staff and the named team, never a demo account. The
 * escrow itself is proven in contracts/test: `forge test`, plus `RUN_FORK=1 forge test --match-contract Fork`
 * against Circle's real USDC.
 */
import { decodeFunctionData, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { POST as ticketCheck } from "../src/app/api/near/ticket-check/route";
import { RECORDINGS, replayRecording } from "../src/lib/near/recorded";
import { nearTeam } from "../src/lib/near/team";
import { allowed } from "../src/lib/near/throttle";
import { ARBITRUM_USDC, payOptions, requestQuote } from "../src/lib/near/oneclick";
import { depositTransfer } from "../src/lib/near/send";
import { gpuConfirmed, readVerdict, signedBy, type Jwk } from "../src/lib/near/gpu";
import { gasReserve, judge, orderHeld, pickHeld, shortAmount, type HeldAsset } from "../src/lib/near/held";
import { SAMPLES } from "../src/lib/near/samples";
import { buildPrompt, extractTicketFacts, responseSchema } from "../src/lib/tickets/ai";
import { checkReceipt, DEFAULT_NEAR_MODEL, teeLink, verificationUrl, type TeeReceipt } from "../src/lib/tickets/near-ai";

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

/** A throwaway key standing in for the model's TEE key. Public on purpose: it signs nothing real. */
const TEE = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const OTHER = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ea870594951c74f2f6b2ca2");

async function receipt(over: Partial<TeeReceipt> = {}, signer = TEE): Promise<TeeReceipt> {
  const requestHash = "a".repeat(64);
  const responseHash = "b".repeat(64);
  const signedText = `${DEFAULT_NEAR_MODEL}:${requestHash}:${responseHash}`;
  return {
    completionId: "chatcmpl-1",
    model: DEFAULT_NEAR_MODEL,
    signatureKind: "provider_tee",
    signingAlgo: "ecdsa",
    signingAddress: TEE.address,
    signedText,
    signature: await signer.signMessage({ message: signedText }),
    requestHash,
    responseHash,
    verified: true,
    attested: true,
    verifiedAt: "2026-11-09T00:00:00.000Z",
    ...over,
  };
}

async function main() {
  // --- The receipt
  const good = await receipt();
  check("receipt: a signature by the named key over this model and these bytes passes", (await checkReceipt(good)).ok);
  check("receipt: one changed character in the reply's hash fails", !(await checkReceipt({ ...good, responseHash: `${good.responseHash.slice(0, -1)}c` })).ok);
  check("receipt: one changed character in the request's hash fails", !(await checkReceipt({ ...good, requestHash: `${good.requestHash.slice(0, -1)}c` })).ok);
  check("receipt: another model's name fails", !(await checkReceipt({ ...good, model: "openai/gpt-6-luna" })).ok);
  check("receipt: a signature by another key fails", !(await checkReceipt(await receipt({}, OTHER))).ok);
  check("receipt: a signature over other text fails", !(await checkReceipt({ ...good, signature: await TEE.signMessage({ message: "something else" }) })).ok);
  check("receipt: the gateway's signature is not the model's TEE", !(await checkReceipt({ ...good, signatureKind: "gateway" })).ok);
  check("receipt: no signature at all fails", !(await checkReceipt({ ...good, signature: null })).ok);
  check("receipt: garbage for a signature fails, and does not throw", !(await checkReceipt({ ...good, signature: "0x1234" })).ok);

  // --- The link to NEAR's Verification Center
  const url = new URL(verificationUrl(good));
  const carried = JSON.parse(Buffer.from(url.hash.replace("#receipt=", ""), "base64url").toString()) as Record<string, string>;
  check("link: NEAR's own page, for this model", url.origin === "https://cloud.near.ai" && url.pathname === "/verify" && url.searchParams.get("model") === DEFAULT_NEAR_MODEL);
  check(
    "link: the fragment holds every field the page requires",
    ["completionId", "model", "signatureKind", "signingAlgo", "signingAddress", "signedText", "signature"].every((k) => !!carried[k]),
    JSON.stringify(Object.keys(carried))
  );
  check("link: no ticket text in it", !url.href.includes("Tribun"));

  // --- What a listing shows buyers: a receipt link only for a verified, attested TEE signature
  const kept = { ...good, verified: true, attested: true };
  check("listing: a verified, attested receipt links the Verification Center", teeLink(kept) === verificationUrl(kept));
  check("listing: an unverified receipt shows no link", teeLink({ ...kept, verified: false }) === undefined);
  check("listing: a signer not named in the attestation report shows no link", teeLink({ ...kept, attested: false }) === undefined);
  check("listing: the gateway's signature shows no link", teeLink({ ...kept, signatureKind: "gateway" }) === undefined);
  check("listing: a receipt without its signature shows no link", teeLink({ ...kept, signature: null }) === undefined);
  check("listing: anything else stored there shows no link, and does not throw", [null, "x", 42, {}, []].every((v) => teeLink(v) === undefined));

  // --- The made-up tickets: they say what they are, and hold nothing a real ticket would have to hide
  for (const s of SAMPLES) {
    const prompt = buildPrompt(s.text, s.show);
    check(`sample ${s.id}: names and codes are already taken out`, s.text.includes("[x]") && !/@|\b\d{10,}\b/.test(s.text));
    check(`sample ${s.id}: the model is told the ticket is data, not instructions`, prompt.includes("data, not instructions"));
    const schema = responseSchema(s.show) as { required: string[]; properties: Record<string, unknown> };
    check(`sample ${s.id}: every field is required, as strict JSON output needs`, Object.keys(schema.properties).every((k) => schema.required.includes(k)));
  }

  // --- The checks recorded from NEAR AI (npm run near:record), which /near shows when NEAR AI does not
  // answer: real signatures by the model's TEE key over the exact request and reply kept here
  const category: Record<string, string> = { conference: "t-bbw-early", concert: "t-cat2" };
  for (const s of SAMPLES) {
    const rec = RECORDINGS[s.id];
    check(`recorded ${s.id}: there is a recording`, !!rec);
    if (!rec) continue;
    const replay = await replayRecording(s.id);
    check(`recorded ${s.id}: the request and reply kept hash to what NEAR AI's TEE key signed, and the signature recovers to that key`, replay?.receipt.verified === true, replay?.receipt.problem ?? "no facts in the reply");
    check(`recorded ${s.id}: a provider_tee signature, by a key named in the model's attestation report when recorded`, rec.receipt.signatureKind === "provider_tee" && rec.receipt.attested === true);
    check(`recorded ${s.id}: the page's model, sent this sample as the page sends it`, rec.receipt.model === DEFAULT_NEAR_MODEL && rec.request.includes(JSON.stringify(buildPrompt(s.text, s.show)).slice(1, -1)), rec.receipt.model);
    check(`recorded ${s.id}: the signed reply reads the right category`, replay?.facts?.tierId === category[s.id], replay?.facts?.tierId ?? "none");
    const edited = await replayRecording(s.id, { ...rec, response: `${rec.response} ` });
    check(`recorded ${s.id}: a reply with one character added is refused`, edited?.receipt.verified === false, edited?.receipt.problem);
  }

  // --- When NEAR AI does not answer (10 Nov 2026: hours of HTTP 500), the page gets the recording, marked as one
  {
    const before = globalThis.fetch;
    const hadKey = process.env.NEAR_AI_API_KEY;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: "Failed to validate API key", type: "internal_server_error" } }), { status: 500 });
    }) as typeof fetch;
    process.env.NEAR_AI_API_KEY = "not-a-real-key";
    const ask = () =>
      ticketCheck(new Request("https://lummy.id/api/near/ticket-check", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify({ sample: SAMPLES[0].id }) }));
    try {
      const first = await ask();
      const shown = (await first.json()) as { recordedAt?: string; liveError?: string; facts?: unknown; receipt?: { verified?: boolean } };
      check("outage: NEAR AI's HTTP 500 brings the recorded check, verified again and marked as recorded", first.status === 200 && !!shown.recordedAt && !!shown.facts && shown.receipt?.verified === true, `${first.status} ${JSON.stringify(shown).slice(0, 160)}`);
      check("outage: the page is told the status, not NEAR's words about the key", shown.liveError === "HTTP 500", shown.liveError);
      const asked = calls;
      const again = await ask();
      check("outage: for a while after, the recording comes at once, without asking NEAR AI again", again.status === 200 && calls === asked, `${calls - asked} more calls`);
    } finally {
      globalThis.fetch = before;
      if (hadKey === undefined) delete process.env.NEAR_AI_API_KEY;
      else process.env.NEAR_AI_API_KEY = hadKey;
    }
  }

  // --- While a model is redeployed, NEAR's gateway says 400 "Provider failed": tried again, unlike other 400s
  {
    const before = globalThis.fetch;
    const hadKey = process.env.NEAR_AI_API_KEY;
    let chats = 0;
    let said = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const chat = String(input).endsWith("/chat/completions");
      if (chat) chats++;
      return new Response(JSON.stringify({ error: { message: said } }), { status: chat ? 400 : 503 });
    }) as typeof fetch;
    process.env.NEAR_AI_API_KEY = "not-a-real-key";
    try {
      said = "Provider failed for model 'Qwen/Qwen3.8-27B': Upstream request failed with status 404 Not Found";
      await extractTicketFacts(SAMPLES[0].text, SAMPLES[0].show, { provider: "near", timeoutMs: 30_000 });
      check("retry: NEAR's 400 \"Provider failed\" is tried three times", chats === 3, `${chats} tries`);
      chats = 0;
      said = "Invalid request: unknown field";
      await extractTicketFacts(SAMPLES[0].text, SAMPLES[0].show, { provider: "near", timeoutMs: 30_000 });
      check("retry: any other 400 is not tried again", chats === 1, `${chats} tries`);
    } finally {
      globalThis.fetch = before;
      if (hadKey === undefined) delete process.env.NEAR_AI_API_KEY;
      else process.env.NEAR_AI_API_KEY = hadKey;
    }
  }

  // --- The 1Click request
  const realFetch = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  let path = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    path = String(input);
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ quote: { amountIn: "1", amountInFormatted: "1", amountOut: "1", amountOutFormatted: "1", depositAddress: "0xdep" } }), { status: 200 });
  }) as typeof fetch;
  const q = await requestQuote({ dry: false, originAsset: "nep141:base-usdc", chain: "base", amountOut: BigInt(9_500_000), recipient: "0xreceiver", refundTo: "0xwallet", deadline: "2026-11-14T00:00:00.000Z" });
  globalThis.fetch = realFetch;
  check("1Click: asks at /v0/quote", path.endsWith("/v0/quote"), path);
  check("1Click: the exact price at the receiver, in micro-USDC", sent.swapType === "EXACT_OUTPUT" && sent.amount === "9500000" && sent.recipient === "0xreceiver" && sent.recipientType === "DESTINATION_CHAIN", JSON.stringify(sent));
  check("1Click: USDC on Arbitrum One is the only destination", sent.destinationAsset === ARBITRUM_USDC);
  check("1Click: a deposit that cannot be swapped goes back on the chain it came from", sent.refundTo === "0xwallet" && sent.refundType === "ORIGIN_CHAIN", JSON.stringify(sent));
  check("1Click: hands back the address to pay", q.depositAddress === "0xdep");

  // --- Paying the deposit from the buyer's own wallet on an EVM chain (lib/near/send.ts): the exact
  // asset and amount, after the team's run picked ETH while holding USDC (T4, 10 Nov 2026)
  {
    const USDC_ETH = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const DEPOSIT = "0x9ee94a51da7f576f109fc0e82925d362fde51fe9";
    const before = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          { assetId: `nep141:eth-${USDC_ETH}.omft.near`, blockchain: "eth", symbol: "USDC", decimals: 6, contractAddress: USDC_ETH },
          { assetId: "nep141:base.omft.near", blockchain: "base", symbol: "ETH", decimals: 18 },
          { assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", blockchain: "sol", symbol: "USDC", decimals: 6, contractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
        ]),
        { status: 200 }
      )) as typeof fetch;
    const offered = await payOptions().finally(() => {
      globalThis.fetch = before;
    });
    const ethUsdc = offered.find((o) => o.chain === "eth" && o.symbol === "USDC");
    const baseEth = offered.find((o) => o.chain === "base" && o.symbol === "ETH");
    const solUsdc = offered.find((o) => o.chain === "sol" && o.symbol === "USDC");
    check("wallet: USDC on Ethereum carries chain 1, its contract and 6 decimals", ethUsdc?.chainId === 1 && ethUsdc.contract === USDC_ETH && ethUsdc.decimals === 6 && ethUsdc.evm, JSON.stringify(ethUsdc));
    check("wallet: ETH on Base is the chain's own coin, with no contract", baseEth?.chainId === 8453 && baseEth.contract === null && baseEth.decimals === 18, JSON.stringify(baseEth));
    check("wallet: USDC on Solana is not offered to a browser EVM wallet", solUsdc?.chainId === null && solUsdc.contract === null && !solUsdc.evm, JSON.stringify(solUsdc));
    const usdc = depositTransfer({ chainId: 1, to: DEPOSIT, amount: "9.603158", decimals: 6, token: USDC_ETH });
    const call = usdc.data ? decodeFunctionData({ abi: erc20Abi, data: usdc.data }) : null;
    check(
      "wallet: a USDC deposit is transfer(the deposit address, the exact units) on the token, with no value",
      usdc.to.toLowerCase() === USDC_ETH && usdc.value === BigInt(0) && call?.functionName === "transfer" && String(call.args[0]).toLowerCase() === DEPOSIT && call.args[1] === BigInt(9_603_158),
      JSON.stringify(call, (_, v) => (typeof v === "bigint" ? v.toString() : v))
    );
    const eth = depositTransfer({ chainId: 8453, to: DEPOSIT, amount: "0.004553610108364126", decimals: 18, token: null });
    check("wallet: an ETH deposit is the exact value to the deposit address, with no data", eth.to === DEPOSIT && eth.value === BigInt("4553610108364126") && !eth.data);
  }

  // --- What the buyer's wallet holds (lib/near/held.ts): which asset is offered first, after the
  // team's run, where the buyer picked ETH while holding USDC and pasted the address by hand
  {
    const U = (n: number) => BigInt(Math.round(n * 1e6));
    const gwei = BigInt(1_000_000_000);
    check("held: a token balance that covers the quote is enough", judge({ balance: U(12.4), needs: U(9.6), token: true, coin: gwei * BigInt(1_000_000), reserve: gasReserve(8453, gwei / BigInt(100), true) }).enough);
    check("held: one unit short is not enough", !judge({ balance: U(9.6) - BigInt(1), needs: U(9.6), token: true, coin: gwei, reserve: BigInt(0) }).enough);
    const dry = judge({ balance: U(12.4), needs: U(9.6), token: true, coin: BigInt(0), reserve: gasReserve(1, gwei * BigInt(2), true) });
    check("held: a token with none of the chain's own coin is enough, but cannot be sent", dry.enough && !dry.gas);
    check(
      "held: the chain's own coin must cover the gas as well as the price",
      !judge({ balance: BigInt(1000), needs: BigInt(1000), token: false, coin: BigInt(1000), reserve: BigInt(1) }).enough && judge({ balance: BigInt(1001), needs: BigInt(1000), token: false, coin: BigInt(1001), reserve: BigInt(1) }).enough
    );
    check("held: no quote, no verdict", !judge({ balance: U(50), needs: null, token: true, coin: gwei, reserve: BigInt(0) }).enough);
    check("held: a rollup keeps three times more aside than its gas price shows", gasReserve(8453, gwei, true) === gasReserve(1, gwei, true) * BigInt(3));
    const opts = [
      { assetId: "usdc-base", symbol: "USDC", chain: "base" },
      { assetId: "usdc-eth", symbol: "USDC", chain: "eth" },
      { assetId: "eth-base", symbol: "ETH", chain: "base" },
      { assetId: "eth-eth", symbol: "ETH", chain: "eth" },
    ];
    const h = (assetId: string, enough = true, gas = true): HeldAsset => ({ assetId, balance: "1", needs: "1", enough, gas });
    check("held: USDC on Base is offered before USDC on Ethereum", pickHeld(opts, [h("usdc-eth"), h("usdc-base")]) === "usdc-base");
    check("held: ETH on Base before USDC on Ethereum, where fees are highest", pickHeld(opts, [h("usdc-eth"), h("eth-base")]) === "eth-base");
    check("held: the wallet of the team's run, USDC and ETH on Ethereum, is offered USDC", pickHeld(opts, [h("eth-eth"), h("usdc-eth")]) === "usdc-eth");
    check("held: an asset that falls short or cannot be sent is never picked", pickHeld(opts, [h("usdc-base", false), h("usdc-eth", true, false), h("eth-eth")]) === "eth-eth");
    check(
      "held: the list shows what can pay first, then the rest in the order the checkout lists them",
      orderHeld(opts, [h("usdc-base", false), h("usdc-eth"), h("eth-base")]).map((o) => o.assetId).join() === "eth-base,usdc-eth,usdc-base,eth-eth"
    );
    check("held: nothing that can pay, nothing picked", pickHeld(opts, [h("usdc-base", false)]) === null && pickHeld(opts, []) === null);
    check("held: amounts show six decimals at most, cut and never rounded up", shortAmount("12.400000") === "12.4" && shortAmount("0.004553610108364126") === "0.004553" && shortAmount("9") === "9");
  }

  // --- NVIDIA's verdict on the GPU evidence (lib/near/gpu.ts): the verdict, our nonce, and the token's
  // signature, with a key made here standing in for the ones NVIDIA publishes
  {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-384" }, true, ["sign", "verify"]);
    const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const keys: Jwk[] = [{ kty: "EC", crv: "P-384", kid: "k1", x: pub.x, y: pub.y }];
    const b64 = (x: object) => Buffer.from(JSON.stringify(x)).toString("base64url");
    const NONCE = "ab".repeat(32);
    const now = 1_794_381_629_000;
    const token = async (claims: object, kid = "k1") => {
      const head = `${b64({ alg: "ES384", kid })}.${b64(claims)}`;
      const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-384" }, pair.privateKey, new TextEncoder().encode(head));
      return `${head}.${Buffer.from(sig).toString("base64url")}`;
    };
    const good = { iss: "https://nras.attestation.nvidia.com", "x-nvidia-overall-att-result": true, eat_nonce: NONCE.toUpperCase(), exp: now / 1000 + 3600 };
    const reply = async (claims: object, kid?: string) => [["JWT", await token(claims, kid)], { "GPU-0": "a.b.c", "GPU-1": "a.b.c" }];
    const yes = await readVerdict(await reply(good), NONCE, keys, now);
    check("gpu: NVIDIA's valid verdict, with our nonce, signed by a published key, is confirmed", gpuConfirmed(yes) && yes?.gpus === 2, JSON.stringify(yes));
    const replayed = await readVerdict(await reply(good), "cd".repeat(32), keys, now);
    check("gpu: evidence made for another nonce is not fresh", replayed?.fresh === false && !gpuConfirmed(replayed));
    const failed = await readVerdict(await reply({ ...good, "x-nvidia-overall-att-result": false }), NONCE, keys, now);
    check("gpu: a verdict of false is not confirmed", failed?.ok === false && !gpuConfirmed(failed));
    const stale = await readVerdict(await reply(good), NONCE, keys, now + 2 * 3600_000);
    check("gpu: an expired token is not confirmed", stale?.ok === false);
    const elsewhere = await readVerdict(await reply({ ...good, iss: "https://example.com" }), NONCE, keys, now);
    check("gpu: a token from another issuer is not confirmed", elsewhere?.ok === false);
    const real = await token(good);
    const [h, , s] = real.split(".");
    const forged = `${h}.${b64({ ...good, eat_nonce: "cd".repeat(32) })}.${s}`;
    check("gpu: a token whose claims were changed after signing fails its signature", (await signedBy(real, keys)) && !(await signedBy(forged, keys)));
    const unknown = await readVerdict(await reply(good, "k2"), NONCE, keys, now);
    check("gpu: a token signed by a key NVIDIA does not publish is not confirmed", unknown?.signed === false && !gpuConfirmed(unknown));
    check("gpu: anything that is not NVIDIA's reply reads as nothing, and does not throw", (await readVerdict({ error: "x" }, NONCE, keys, now)) === null && (await readVerdict([["JWT", "nope"]], NONCE, keys, now)) === null);
    check("gpu: no verdict is never shown as confirmed", !gpuConfirmed(null) && !gpuConfirmed(undefined));
  }

  // --- Who may pay for real
  process.env.LUMMY_NEAR_TEAM = " Team@Lummy.id ,other@lummy.id";
  check("team: staff may", nearTeam({ email: "a@b.c", staff: true }));
  check("team: a named account may, whatever the case", nearTeam({ email: "team@lummy.id", staff: false }));
  check("team: anyone else may not", !nearTeam({ email: "fan@gmail.com", staff: false }));
  check("team: no account may not", !nearTeam(null));
  check("team: a demo account never may, even as staff", !nearTeam({ email: "admin@demo.lummy.id", staff: true }));
  process.env.LUMMY_NEAR_TEAM = "";
  check("team: an empty list names nobody", !nearTeam({ email: "", staff: false }));

  // --- The soft brake on the public endpoints
  const req = (ip: string) => new Request("https://lummy.id/api/near/quote", { headers: { "x-forwarded-for": ip } });
  check("brake: within the limit", allowed(req("1.1.1.1"), "t", 2, 1000, 0) && allowed(req("1.1.1.1"), "t", 2, 1000, 1));
  check("brake: over it, refused", !allowed(req("1.1.1.1"), "t", 2, 1000, 2));
  check("brake: per visitor", allowed(req("2.2.2.2"), "t", 2, 1000, 2));
  check("brake: the window passes", allowed(req("1.1.1.1"), "t", 2, 1000, 2000));
}

main()
  .catch((e) => check("the checks ran", false, e instanceof Error ? e.message : String(e)))
  .finally(() => {
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks pass`);
    process.exit(failed ? 1 : 0);
  });
