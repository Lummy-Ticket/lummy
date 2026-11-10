// A real check of each made-up ticket on /near, recorded from NEAR AI by `npm run near:record`, for the
// page to show when NEAR AI Cloud does not answer. On 10 Nov 2026 its API, every private model and the
// attestation service were down for hours, and the page could only say "HTTP 500". A recording keeps
// the exact request and reply, so none of it is taken on trust: both hashes are worked out again from
// those bytes, the signature is recovered again, and the facts are read again from the signed reply.
// near:check does the same offline. Only made-up tickets are recorded: a real ticket's text never is.
import { createHash } from "node:crypto";
import data from "./recorded.json";
import { SAMPLES } from "./samples";
import { parseAnswer } from "@/lib/tickets/ai";
import { checkReceipt, verificationUrl, type TeeReceipt } from "@/lib/tickets/near-ai";

if (typeof window !== "undefined") throw new Error("lib/near/recorded is server-only");

export type Recording = {
  recordedAt: string;
  ms: number;
  /** The exact JSON body sent to NEAR AI, whose SHA-256 is the receipt's requestHash. */
  request: string;
  /** The exact reply, whose SHA-256 is the receipt's responseHash. */
  response: string;
  /** As it was when recorded: `attested` says the signer was named in the model's attestation report then. */
  receipt: TeeReceipt;
};

export const RECORDINGS: Record<string, Recording> = data as Record<string, Recording>;

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** What the model answered, read from the reply's own bytes. */
function answerText(response: string) {
  try {
    return (JSON.parse(response) as { choices?: { message?: { content?: string | null } }[] }).choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

/**
 * A recorded check, checked again now, in the shape the live check answers with, or null when there
 * is no recording for this sample or its reply holds no ticket facts. `verified` holds only when the
 * request and reply hash to what the TEE key signed and the signature recovers to that key.
 */
export async function replayRecording(sampleId: string, rec: Recording | undefined = RECORDINGS[sampleId]) {
  const sample = SAMPLES.find((s) => s.id === sampleId);
  if (!sample || !rec) return null;
  // What the page shows is read from the reply's own bytes, never kept beside them.
  const facts = parseAnswer(answerText(rec.response), sample.show);
  if (!facts) return null;
  const problems: string[] = [];
  if (sha256(rec.request) !== rec.receipt.requestHash) problems.push("the request is not the one that was signed");
  if (sha256(rec.response) !== rec.receipt.responseHash) problems.push("the reply is not the one that was signed");
  const signature = await checkReceipt(rec.receipt);
  if (!signature.ok) problems.push(signature.problem ?? "the signature does not check out");
  const receipt: TeeReceipt = { ...rec.receipt, verified: problems.length === 0, ...(problems.length ? { problem: problems.join("; ") } : {}) };
  return {
    facts,
    model: rec.receipt.model,
    ms: rec.ms,
    receipt,
    verifyUrl: receipt.verified && receipt.signature ? verificationUrl(receipt) : null,
    recordedAt: rec.recordedAt,
  };
}
