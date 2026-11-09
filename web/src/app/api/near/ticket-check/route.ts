// The private ticket check, for anyone to try on a made-up ticket (lib/near/samples.ts): the model reads
// it inside NEAR AI's Trusted Execution Environment, and the answer comes with a receipt and a link to
// NEAR's own Verification Center. POST with a sample runs it. POST with a receipt checks that receipt
// again, which is how the page shows a tampered one being refused. No real ticket passes through here.
import { NextResponse } from "next/server";
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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sample?: unknown; receipt?: unknown } | null;

  if (body?.receipt && typeof body.receipt === "object") {
    if (!allowed(req, "receipt", 60, 60_000)) return fail(429, "terlalu banyak permintaan; coba lagi sebentar lagi");
    const check = await checkReceipt(body.receipt as TeeReceipt);
    return NextResponse.json(check, { headers: noStore });
  }

  const sample = SAMPLES.find((s) => s.id === body?.sample);
  if (!sample) return fail(400, "contoh tiket tidak dikenal");
  if (!process.env.NEAR_AI_API_KEY) return fail(503, "NEAR AI belum aktif di server ini");
  if (!allowed(req, "ticket", 6, 10 * 60_000)) return fail(429, "terlalu banyak percobaan; coba lagi beberapa menit lagi");

  const out = await extractTicketFacts(sample.text, sample.show, { provider: "near", timeoutMs: 30_000 });
  if (!out.ok) return fail(502, `NEAR AI: ${out.reason}${out.detail ? ` (${out.detail})` : ""}`);
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
