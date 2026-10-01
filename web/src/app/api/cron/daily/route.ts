// The daily job, called by Vercel Cron (vercel.json); one job, since the Hobby plan allows few.
//   1. Pays out every order whose window passed in silence, so the clock settles it even when
//      nobody opens the order (lib/orders/settle.ts).
//   2. Deletes files whose time is up: ticket PDFs a month after the show, claim photos a month
//      after the decision, uploads never attached after a week (lib/retention.ts).
// It needs no secret: it can only do what the escrow rules and the retention rules already say, the
// same as the pages asking, and what it finishes is not due the next time. Counts only in the answer.
import { NextResponse } from "next/server";
import { settleDue } from "@/lib/orders/settle";
import { purgeExpired } from "@/lib/retention-purge";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "database belum tersambung di server ini" }, { status: 503, headers: noStore });
  let settle: Awaited<ReturnType<typeof settleDue>> | { error: string };
  try {
    settle = await settleDue(admin, 30_000);
  } catch (e) {
    settle = { error: (e as Error).message };
  }
  const purge = await purgeExpired(admin, Date.now(), 15_000);
  if (purge.errors.length) console.error("[cron/daily] files that could not be deleted:", purge.errors);
  return NextResponse.json(
    { settle, purge: { ticketFiles: purge.ticketFiles, evidenceFiles: purge.evidenceFiles, orphanUploads: purge.orphanUploads, errors: purge.errors.length, unfinished: purge.unfinished } },
    { headers: noStore }
  );
}
