/**
 * What the NEAR HACKATHON work promises, offline: no network, no key, no database, so a judge or CI can
 * run it from a fresh clone.
 *
 *   npm run near:check
 *
 * The receipt from NEAR AI: a real ECDSA signature over `model:request_hash:response_hash` passes, and
 * any other text, signer, or kind of signature fails. The verification link carries exactly what NEAR's
 * Verification Center reads. The 1Click request asks for the exact amount at the receiver, with refunds
 * on the chain paid from. Who may pay for real: staff and the named team, never a demo account. The
 * escrow itself is proven in contracts/test: `forge test`, plus `RUN_FORK=1 forge test --match-contract Fork`
 * against Circle's real USDC.
 */
import { privateKeyToAccount } from "viem/accounts";
import { nearTeam } from "../src/lib/near/team";
import { allowed } from "../src/lib/near/throttle";
import { ARBITRUM_USDC, requestQuote } from "../src/lib/near/oneclick";
import { SAMPLES } from "../src/lib/near/samples";
import { buildPrompt, responseSchema } from "../src/lib/tickets/ai";
import { checkReceipt, DEFAULT_NEAR_MODEL, verificationUrl, type TeeReceipt } from "../src/lib/tickets/near-ai";

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

  // --- The made-up tickets: they say what they are, and hold nothing a real ticket would have to hide
  for (const s of SAMPLES) {
    const prompt = buildPrompt(s.text, s.show);
    check(`sample ${s.id}: names and codes are already taken out`, s.text.includes("[x]") && !/@|\b\d{10,}\b/.test(s.text));
    check(`sample ${s.id}: the model is told the ticket is data, not instructions`, prompt.includes("data, not instructions"));
    const schema = responseSchema(s.show) as { required: string[]; properties: Record<string, unknown> };
    check(`sample ${s.id}: every field is required, as strict JSON output needs`, Object.keys(schema.properties).every((k) => schema.required.includes(k)));
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
