/**
 * The private ticket check, on made-up tickets, from a terminal: each goes to a model in NEAR AI's
 * Trusted Execution Environment, the receipt is checked here, and the link opens NEAR's own Verification
 * Center, which checks the signature and the hardware evidence in your browser.
 *
 *   NEAR_AI_API_KEY=... npm run near:prove
 *   npm run near:prove -- --model Qwen/Qwen3.8-27B
 *
 * Without NEAR_AI_API_KEY it looks in ~/.lummy/production.env. The key is never printed. About US$0.0005
 * per ticket.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { SAMPLES } from "../src/lib/near/samples";
import { extractTicketFacts } from "../src/lib/tickets/ai";
import { verificationUrl } from "../src/lib/tickets/near-ai";

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

const i = process.argv.indexOf("--model");
const model = i > 0 ? process.argv[i + 1] : undefined;

async function main() {
  let failed = 0;
  for (const s of SAMPLES) {
    console.log(`\n--- ${s.label}`);
    const out = await extractTicketFacts(s.text, s.show, { provider: "near", timeoutMs: 45_000, ...(model ? { model } : {}) });
    if (!out.ok) {
      console.log(`no answer: ${out.reason} ${out.detail ?? ""}`);
      failed++;
      continue;
    }
    console.log(`${out.model} in ${out.ms} ms, ${out.tokens.in} tokens in, ${out.tokens.out} out`);
    console.log(JSON.stringify(out.facts));
    const r = out.receipt;
    if (!r) {
      console.log("no receipt");
      failed++;
      continue;
    }
    console.log(`signature kind: ${r.signatureKind}, algorithm: ${r.signingAlgo}, signer: ${r.signingAddress}`);
    console.log(`signature and text check out: ${r.verified}${r.problem ? ` (${r.problem})` : ""}`);
    console.log(`signer named in the model's attestation report: ${r.attested}`);
    if (r.signature) console.log(`check it yourself: ${verificationUrl(r)}`);
    if (!r.verified || !r.attested) failed++;
  }
  console.log(failed ? `\n${failed} ticket(s) did not get a verified receipt` : "\nevery ticket got a verified receipt");
  process.exit(failed ? 1 : 0);
}

void main();
