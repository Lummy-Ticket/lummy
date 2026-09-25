// Demo accounts for presenters: a persona click in the Dev Panel signs in to a real Supabase
// account (buyer, seller or admin) without any email. Guarded like chain mode: open on a dev
// machine, demo key in production. The session is minted here from a one-time link, so no
// password exists anywhere.
import { NextResponse } from "next/server";
import { demoKeyAllowed, demoMode } from "@/lib/demo-key";
import type { Role } from "@/lib/mock/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEMO_ACCOUNTS } from "@/lib/supabase/demo";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A response that sets a session must never be cached by anything in between.
const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

export async function GET() {
  const available = !!supabaseAdmin() && demoMode() !== "off";
  return NextResponse.json({ available, mode: available ? demoMode() : "off" }, { headers: noStore });
}

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  const server = await supabaseServer();
  if (!admin || !server || demoMode() === "off") return fail(503, "akun demo tidak tersedia di server ini");
  if (!demoKeyAllowed(req)) return fail(401, "demo key salah atau belum diisi");

  const { persona } = (await req.json().catch(() => ({}))) as { persona?: string };
  if (!persona || !Object.hasOwn(DEMO_ACCOUNTS, persona)) return fail(400, "persona tidak dikenal");
  const account = DEMO_ACCOUNTS[persona as Role];

  // Created on first use, so a fresh project needs no manual setup.
  const created = await admin.auth.admin.createUser({
    email: account.email,
    email_confirm: true,
    user_metadata: { full_name: account.name },
  });
  if (created.error && created.error.code !== "email_exists") return fail(500, created.error.message);

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: account.email });
  const tokenHash = link.data.properties?.hashed_token;
  if (link.error || !tokenHash || !link.data.user) return fail(500, link.error?.message ?? "gagal membuat link masuk");

  // Name and staff flag are set from the list above every time, so the database cannot drift.
  const profile = await admin
    .from("profiles")
    .update({ full_name: account.name, role: account.staff ? "admin" : "member" })
    .eq("id", link.data.user.id);
  if (profile.error) return fail(500, profile.error.message);

  const verified = await server.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (verified.error) return fail(500, verified.error.message);
  // Who is now signed in, so the Dev Panel can open the view that was picked.
  const user = { id: link.data.user.id, email: account.email, name: account.name, staff: account.staff };
  return NextResponse.json({ ok: true, user }, { headers: noStore });
}
