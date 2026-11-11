// Every minute, called by Vercel Cron (vercel.json): finishes payments on the NEAR Intents rail without
// their buyer. Until 11 Nov 2026 an order was written only while the buyer's own page kept asking, so
// closing the tab after paying left the money waiting at its receiver until the refund deadline. In the
// team's real run the buyer asked exactly that: "if I close this, can I come back?"
//   1. Every open hold is brought up to date: what 1Click says, whether the money is at the receiver,
//      and if it is, the escrow is funded and the order written (advanceIntentPayment, the same call
//      the buyer's page makes, under the same lock, so the two cannot both fund one order).
//   2. Money at a receiver whose deadline has passed goes back to its refund address, within minutes
//      instead of at the next daily run.
// It can only do what the contracts already allow anyone to do. Only a call carrying CRON_SECRET gets
// in, as with the daily job, and a server without the secret answers 503. Counts only in the answer.
import { NextResponse } from "next/server";
import { fromCron } from "@/lib/cron-auth";
import { advanceOpenIntents, intentsOperator, settleIntentLeftovers } from "@/lib/payments/intents";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };
/** New work starts only this long into the run: the rest covers one order being funded, four transactions. */
const RUN_MS = 30_000;
const SIX_HOURS = 6 * 3_600_000;

export async function GET(req: Request) {
  const started = Date.now();
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET belum di-set di server ini" }, { status: 503, headers: noStore });
  if (!fromCron(req, secret)) return NextResponse.json({ error: "cuma Vercel Cron" }, { status: 401, headers: noStore });
  const admin = supabaseAdmin();
  const op = intentsOperator();
  if (!admin || !op) return NextResponse.json({ rail: false }, { headers: noStore });

  let holds: Awaited<ReturnType<typeof advanceOpenIntents>> | { error: string };
  try {
    holds = await advanceOpenIntents(admin, op, started + RUN_MS);
  } catch (e) {
    holds = { error: (e as Error).message };
    console.error("[cron/intents] holds:", holds.error);
  }
  let swept: number | { error: string } = 0;
  if (Date.now() < started + RUN_MS) {
    try {
      swept = await settleIntentLeftovers(admin, 2, SIX_HOURS);
    } catch (e) {
      swept = { error: (e as Error).message };
      console.error("[cron/intents] leftovers:", swept.error);
    }
  }
  const report = { rail: true, holds, swept, ms: Date.now() - started };
  // One line every ten minutes, and on any run that had work: enough to see the job is alive in the
  // runtime logs, where a quiet run otherwise leaves no trace.
  const busy = typeof swept !== "number" || swept > 0 || "error" in holds || holds.open > 0;
  if (busy || new Date().getUTCMinutes() % 10 === 0) console.log("[cron/intents]", JSON.stringify(report));
  return NextResponse.json(report, { headers: noStore });
}
