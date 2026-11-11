// The daily job, called by Vercel Cron (vercel.json); one job, since the Hobby plan allows few.
//   1. Pays out every order whose window passed in silence, so the clock settles it even when
//      nobody opens the order (lib/orders/settle.ts).
//   2. Deletes files whose time is up: ticket PDFs a month after the show, claim photos a month
//      after the decision, uploads never attached after a week (lib/retention.ts).
//   3. Brings the public ledger up to date for QRIS orders whose last step did not reach the chain
//      (lib/orders/ledger.ts).
//   4. Reads QRIS holds closed in the last two days once more at Xendit, so money no webhook
//      reported still becomes its order or a refund, and gives paid holds the order a failed write
//      left them without (lib/payments/checkout.ts, recheckClosedHolds).
// The steps run money first (4, then 1 and 3, then 2) under one deadline (RUN_MS).
// It can only do what the escrow rules and the retention rules already say, the same as the pages
// asking, and what it finishes is not due the next time. Still, a stranger calling it over and over
// would load the database, so only a call carrying CRON_SECRET (Vercel sends it as a bearer token
// on every cron run) gets in, and a server without the secret answers 503 instead of running for
// anyone, as it did until 2 Nov 2026 (production audit, M6). Counts only in the answer.
import { NextResponse } from "next/server";
import { fromCron } from "@/lib/cron-auth";
import { syncLedgerDue } from "@/lib/orders/ledger";
import { settleDue } from "@/lib/orders/settle";
import { expireHolds, recheckClosedHolds, type RecheckReport } from "@/lib/payments/checkout";
import { settleIntentLeftovers } from "@/lib/payments/intents";
import { reconcileUsdcHolds, usdcRail } from "@/lib/payments/usdc";
import { xenditConfig } from "@/lib/payments/xendit";
import { purgeExpired } from "@/lib/retention-purge";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { FILE_ACCESS_DAYS } from "@/lib/files/access-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/**
 * New work starts only this long into the run, out of the function's sixty seconds: the rest covers
 * one slow call finishing past its step's share (a Xendit read can take twenty, two tries of ten)
 * and the answer. Each step gets at most its own cap of what is left, so one slow step cannot leave
 * the function killed before the ones after it ran (review, 4 Nov 2026).
 */
const RUN_MS = 40_000;

export async function GET(req: Request) {
  const started = Date.now();
  const left = (cap: number) => Math.max(0, Math.min(cap, started + RUN_MS - Date.now()));
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET belum di-set di server ini" }, { status: 503, headers: noStore });
  if (!fromCron(req, secret)) return NextResponse.json({ error: "cuma Vercel Cron" }, { status: 401, headers: noStore });
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "database belum tersambung di server ini" }, { status: 503, headers: noStore });
  // Money first: holds and money Xendit reported, then payouts and the ledger, then files, which
  // can wait a day when a run is short of time.
  // QRIS holds nobody paid: the catalogue releases them too, this catches the quiet days.
  let holdsReleased: number | { error: string };
  try {
    holdsReleased = await expireHolds(admin);
  } catch (e) {
    holdsReleased = { error: (e as Error).message };
  }
  // Closed holds read once more at Xendit, and paid holds given the order they lack. A hold not
  // reached is still in the two-day window tomorrow; one about to leave it is logged by id.
  let holdsRechecked: RecheckReport | { error: string } | null = null;
  const qris = xenditConfig();
  if (qris) {
    try {
      holdsRechecked = await recheckClosedHolds(admin, qris, left(15_000));
    } catch (e) {
      holdsRechecked = { error: (e as Error).message };
    }
    if (holdsRechecked && !("error" in holdsRechecked) && (holdsRechecked.left || holdsRechecked.failed || holdsRechecked.unscanned)) {
      console.error("[cron/daily] the QRIS recheck did not finish:", JSON.stringify(holdsRechecked));
    }
  }
  let settle: Awaited<ReturnType<typeof settleDue>> | { error: string };
  try {
    settle = await settleDue(admin, left(20_000));
  } catch (e) {
    settle = { error: (e as Error).message };
  }
  // USDC submits cut off half way: money in the escrow without an order goes back to its wallet.
  // Each takes chain calls of a few seconds, so it waits for a day with time to spare.
  let usdcReconciled: number | { error: string } | "later" | null = null;
  const op = usdcRail();
  if (op) {
    if (left(Infinity) < 15_000) usdcReconciled = "later";
    else {
      try {
        usdcReconciled = await reconcileUsdcHolds(admin, op, 10);
      } catch (e) {
        usdcReconciled = { error: (e as Error).message };
      }
    }
  }
  // Money from NEAR Intents that reached a receiver with no order to go to: back to its refund address.
  let intentsSwept: number | { error: string } | "later" = "later";
  if (left(Infinity) >= 15_000) {
    try {
      intentsSwept = await settleIntentLeftovers(admin);
    } catch (e) {
      intentsSwept = { error: (e as Error).message };
    }
  }
  // After the payouts above, so a release made just now reaches the chain in the same run.
  let ledger: Awaited<ReturnType<typeof syncLedgerDue>> | { error: string };
  try {
    ledger = await syncLedgerDue(admin, left(10_000));
  } catch (e) {
    ledger = { error: (e as Error).message };
  }
  const purge = await purgeExpired(admin, Date.now(), left(15_000));
  if (purge.errors.length) console.error("[cron/daily] files that could not be deleted:", purge.errors);
  // Attempt counts (lib/rate.ts) only ever matter for their last day; an account that comes back
  // clears its own, this takes the rest, so none lasts past two days, as the privacy page says.
  const attempts = await admin.from("rate_attempts").delete().lt("at", new Date(Date.now() - 86_400_000).toISOString());
  if (attempts.error) console.error("[cron/daily] old attempt counts not deleted:", attempts.error.message);
  // The record of staff opening personal files (lib/files/access-log.ts) is kept a year.
  const openings = await admin.from("file_access").delete().lt("at", new Date(Date.now() - FILE_ACCESS_DAYS * 86_400_000).toISOString());
  if (openings.error) console.error("[cron/daily] old file openings not deleted:", openings.error.message);
  // Something here needs a person: a step that threw, payouts that failed or are held for a show
  // that changed, holds the recheck could not read or that leave its window unread, files not
  // deleted. The answer is then 500, so Vercel's cron page shows the run as failed instead of
  // green with the trouble only in the body (money audit, 4 Nov 2026). Counts only, as before.
  const failedStep = (v: unknown) => !!v && typeof v === "object" && "error" in v;
  const attention =
    [settle, holdsReleased, holdsRechecked, usdcReconciled, intentsSwept, ledger].some(failedStep) ||
    (!failedStep(settle) && (settle as Awaited<ReturnType<typeof settleDue>>).failed > 0) ||
    (!!holdsRechecked && !failedStep(holdsRechecked) && ((holdsRechecked as RecheckReport).failed > 0 || (holdsRechecked as RecheckReport).lastChance > 0)) ||
    purge.errors.length > 0;
  if (attention) console.error("[cron/daily] a step needs a look; the run answers 500");
  return NextResponse.json(
    {
      settle,
      holdsReleased,
      holdsRechecked,
      usdcReconciled,
      intentsSwept,
      ledger,
      purge: { ticketFiles: purge.ticketFiles, evidenceFiles: purge.evidenceFiles, orphanUploads: purge.orphanUploads, errors: purge.errors.length, unfinished: purge.unfinished },
      attempts: attempts.error ? "failed" : "cleared",
    },
    { status: attention ? 500 : 200, headers: noStore }
  );
}
