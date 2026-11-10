/**
 * Records a real check of each made-up ticket on /near, for the page to show when NEAR AI Cloud does not
 * answer (lib/near/recorded.ts). Each ticket goes to the model in NEAR AI's TEE exactly as the page's
 * check sends it. The exact request and reply are kept, and the file is written only when every
 * receipt verifies, its signer is named in the model's attestation report, both hashes match the bytes
 * kept, and the recording checks out again the way the page will check it. About US$0.001 in all.
 *
 *   npm run near:record
 *
 * Writes src/lib/near/recorded.json; commit it. Without NEAR_AI_API_KEY it looks in
 * ~/.lummy/production.env. The key is never printed, and it never enters a request body.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { replayRecording, type Recording } from "../src/lib/near/recorded";
import { SAMPLES } from "../src/lib/near/samples";
import { extractTicketFacts } from "../src/lib/tickets/ai";

if (!process.env.NEAR_AI_API_KEY) {
  try {
    for (const line of readFileSync(`${homedir()}/.lummy/production.env`, "utf8").split("\n")) {
      const m = /^(NEAR_AI_[A-Z_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // No file: the check below says what is missing.
  }
}
if (!process.env.NEAR_AI_API_KEY) {
  console.error("Set NEAR_AI_API_KEY first (https://cloud.near.ai).");
  process.exit(1);
}

const sha256 = (b: string | Uint8Array) => createHash("sha256").update(b).digest("hex");

// Every exchange with the chat endpoint, as sent and as received, retries included.
const exchanges: { request: string; response: Uint8Array }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await realFetch(input, init);
  if (String(input).endsWith("/chat/completions") && typeof init?.body === "string") {
    exchanges.push({ request: init.body, response: new Uint8Array(await res.clone().arrayBuffer()) });
  }
  return res;
}) as typeof fetch;

async function main() {
  const out: Record<string, Recording> = {};
  for (const s of SAMPLES) {
    exchanges.length = 0;
    const r = await extractTicketFacts(s.text, s.show, { provider: "near", timeoutMs: 30_000 });
    if (!r.ok) throw new Error(`${s.id}: NEAR AI did not answer (${r.reason}${r.detail ? `, ${r.detail}` : ""})`);
    const receipt = r.receipt;
    if (!receipt?.verified || !receipt.attested) throw new Error(`${s.id}: the receipt is not verified and attested (${receipt?.problem ?? "no receipt"})`);
    const kept = exchanges.find((e) => sha256(e.request) === receipt.requestHash && sha256(e.response) === receipt.responseHash);
    if (!kept) throw new Error(`${s.id}: no exchange kept matches the receipt's hashes`);
    const response = new TextDecoder().decode(kept.response);
    if (sha256(response) !== receipt.responseHash) throw new Error(`${s.id}: the reply does not survive as text`);
    if (kept.request.includes(process.env.NEAR_AI_API_KEY!)) throw new Error(`${s.id}: the request body holds the key`);
    const rec: Recording = { recordedAt: receipt.verifiedAt, ms: r.ms, request: kept.request, response, receipt };
    const replay = await replayRecording(s.id, rec);
    if (!replay?.receipt.verified) throw new Error(`${s.id}: the recording does not check out again (${replay?.receipt.problem ?? "no facts in the reply"})`);
    out[s.id] = rec;
    console.log(`${s.id}: ${r.ms} ms, ${receipt.model}, signer ${receipt.signingAddress}`);
    console.log(`  ${JSON.stringify(replay.facts)}`);
  }
  const file = path.resolve(process.cwd(), "src/lib/near/recorded.json");
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nwrote ${path.relative(process.cwd(), file)}: ${Object.keys(out).length} recordings`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
