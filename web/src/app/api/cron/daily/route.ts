// The daily job, called by Vercel Cron (vercel.json); one job, since the Hobby plan allows few.
//   1. Pays out every order whose window passed in silence, so the clock settles it even when
//      nobody opens the order (lib/orders/settle.ts).
//   2. Deletes files whose time is up: ticket PDFs a month after the show, claim photos a month
//      after the decision, uploads never attached after a week (lib/retention.ts).
//   3. Brings the public ledger up to date for QRIS orders whose last step did not reach the chain
//      (lib/orders/ledger.ts).
// It can only do what the escrow rules and the retention rules already say, the same as the pages
// asking, and what it finishes is not due the next time. Still, a stranger calling it over and over
// would load the database, so when CRON_SECRET is set (Vercel sends it as a bearer token on every
// cron run) anything without it is turned away. Counts only in the answer.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncLedgerDue } from "@/lib/orders/ledger";
import { settleDue } from "@/lib/orders/settle";
import { expireHolds } from "@/lib/payments/checkout";
import { purgeExpired } from "@/lib/retention-purge";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/** Without CRON_SECRET the route stays open, as before; with it, only Vercel Cron gets in. */
function fromCron(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const sent = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return sent.length === expected.length && timingSafeEqual(sent, expected);
}

export async function GET(req: Request) {
  if (!fromCron(req)) return NextResponse.json({ error: "cuma Vercel Cron" }, { status: 401, headers: noStore });
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "database belum tersambung di server ini" }, { status: 503, headers: noStore });
  let settle: Awaited<ReturnType<typeof settleDue>> | { error: string };
  try {
    settle = await settleDue(admin, 30_000);
  } catch (e) {
    settle = { error: (e as Error).message };
  }
  const purge = await purgeExpired(admin, Date.now(), 15_000);
  // QRIS holds nobody paid: the catalogue releases them too, this catches the quiet days.
  let holdsReleased: number | { error: string };
  try {
    holdsReleased = await expireHolds(admin);
  } catch (e) {
    holdsReleased = { error: (e as Error).message };
  }
  // After the payouts above, so a release made just now reaches the chain in the same run.
  let ledger: Awaited<ReturnType<typeof syncLedgerDue>> | { error: string };
  try {
    ledger = await syncLedgerDue(admin, 10_000);
  } catch (e) {
    ledger = { error: (e as Error).message };
  }
  if (purge.errors.length) console.error("[cron/daily] files that could not be deleted:", purge.errors);
  return NextResponse.json(
    { settle, holdsReleased, ledger, purge: { ticketFiles: purge.ticketFiles, evidenceFiles: purge.evidenceFiles, orphanUploads: purge.orphanUploads, errors: purge.errors.length, unfinished: purge.unfinished } },
    { headers: noStore }
  );
}
