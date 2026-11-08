// Staff send one test email to their own address over this deployment's mail settings (tasks 11.3,
// lib/email/send.ts), whether or not FEATURES.emails is on: proof that the SMTP credentials in Vercel
// work before the flag goes on, or after the mailbox password changes. Only from this site's own
// admin page, only by staff, and only to the staff member's own address, so it cannot be used to
// send mail to anyone else.
import { NextResponse, type NextRequest } from "next/server";
import { sendTestEmail } from "@/lib/email/send";
import { FEATURES } from "@/lib/features";
import { postedFromThisSite, publicOrigin } from "@/lib/public-origin";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

export async function POST(req: NextRequest) {
  if (!postedFromThisSite(req.headers, publicOrigin(req))) return fail(403, "permintaan ini bukan dari halaman Lummy");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!user.staff) return fail(403, "cuma staf yang bisa mengirim email uji");
  const out = await sendTestEmail(user.email);
  if (!out.ok) {
    console.error("[email-test] not sent:", out.reason);
    return fail(502, `email uji tidak terkirim: ${out.reason}`);
  }
  return NextResponse.json({ ok: true, to: user.email, messageId: out.messageId, emailsOn: FEATURES.emails }, { headers: noStore });
}
