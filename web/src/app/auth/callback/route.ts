// Where the sign-in email lands: trade the one-time code for a session cookie, then carry on.
// The code only works in the browser that asked for the link (PKCE), which the login page says.
import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin, safePath } from "@/lib/public-origin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safePath(req.nextUrl.searchParams.get("next"));
  const origin = publicOrigin(req);
  if (code) {
    const sb = await supabaseServer();
    const result = sb && (await sb.auth.exchangeCodeForSession(code));
    if (result && !result.error) return NextResponse.redirect(`${origin}${next}`, { headers: noStore });
  }
  return NextResponse.redirect(`${origin}/login?error=link`, { headers: noStore });
}
