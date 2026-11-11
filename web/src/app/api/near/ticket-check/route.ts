// The private ticket check, for anyone to try on a made-up ticket (lib/near/samples.ts): the model reads
// it inside NEAR AI's Trusted Execution Environment, and the answer comes with a receipt and a link to
// NEAR's own Verification Center. POST with a sample runs it. POST with a receipt checks that receipt
// again, which is how the page shows a tampered one being refused. No real ticket passes through here.
import { NextResponse } from "next/server";
import { replayRecording } from "@/lib/near/recorded";
import { allowed } from "@/lib/near/throttle";
import { SAMPLES } from "@/lib/near/samples";
import { errorBody } from "@/lib/route-errors";
import { extractTicketFacts } from "@/lib/tickets/ai";
import { checkReceipt, verificationUrl, type TeeReceipt } from "@/lib/tickets/near-ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 40;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json(errorBody(error), { status, headers: noStore });

/**
 * When NEAR AI last failed on this server instance, and how. For two minutes after, the recording is
 * shown at once rather than after another 30 seconds of tries; then the live check is tried again.
 */
let down: { at: number; said: string } | null = null;
const DOWN_MS = 2 * 60_000;

/** The same check recorded from NEAR AI earlier (lib/near/recorded.ts), checked again, saying why it is not live. */
async function recorded(sampleId: string, said: string, noKey = false) {
  const rec = await replayRecording(sampleId);
  return rec ? NextResponse.json({ ...rec, liveError: said, ...(noKey ? { noKey: true } : {}) }, { headers: noStore }) : null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sample?: unknown; receipt?: unknown } | null;

  if (body?.receipt && typeof body.receipt === "object") {
    if (!allowed(req, "receipt", 60, 60_000)) return fail(429, "terlalu banyak permintaan; coba lagi sebentar lagi");
    const check = await checkReceipt(body.receipt as TeeReceipt);
    return NextResponse.json(check, { headers: noStore });
  }

  const sample = SAMPLES.find((s) => s.id === body?.sample);
  if (!sample) return fail(400, "contoh tiket tidak dikenal");
  if (!allowed(req, "ticket", 6, 10 * 60_000)) return fail(429, "terlalu banyak percobaan; coba lagi beberapa menit lagi");
  // No key here (a clone a judge runs, say): the check recorded from NEAR AI is shown instead, and says so.
  if (!process.env.NEAR_AI_API_KEY) return (await recorded(sample.id, "no NEAR AI key on this server", true)) ?? fail(503, "NEAR AI belum aktif di server ini");

  if (down && Date.now() - down.at < DOWN_MS) {
    const shown = await recorded(sample.id, down.said);
    if (shown) return shown;
  }
  const out = await extractTicketFacts(sample.text, sample.show, { provider: "near", timeoutMs: 30_000 });
  if (!out.ok) {
    // NEAR AI did not answer, or not usably (10 Nov 2026: hours of HTTP 500 from its API, its models
    // and its attestation service). Its own words stay out: "Failed to validate API key" read as if
    // our key were wrong, when their database was down.
    const said = /^HTTP \d+/.exec(out.detail ?? "")?.[0] ?? (out.detail === "timed out" ? "timed out" : out.reason);
    down = { at: Date.now(), said };
    const shown = await recorded(sample.id, said);
    if (shown) return shown;
    return fail(502, `NEAR AI tidak menjawab (${said})`);
  }
  down = null;
  return NextResponse.json(
    {
      facts: out.facts,
      model: out.model,
      ms: out.ms,
      receipt: out.receipt ?? null,
      verifyUrl: out.receipt?.signature ? verificationUrl(out.receipt) : null,
    },
    { headers: noStore }
  );
}
