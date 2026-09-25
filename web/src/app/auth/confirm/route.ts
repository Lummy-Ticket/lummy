// Sign-in links from our own email templates (once custom SMTP is on): the link carries a
// token hash that is verified here, so it works on any device, unlike the default link, whose
// one-time code only works in the browser that asked for it.
// Template link: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin, safePath } from "@/lib/public-origin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const TYPES: EmailOtpType[] = ["email", "signup", "magiclink"];

/** Where to land: the ?next= the login page put in its redirect URL, but only on this site. */
function landing(redirectTo: string | null, origin: string) {
  if (!redirectTo) return "/";
  try {
    const url = new URL(redirectTo);
    return url.origin === origin ? safePath(url.searchParams.get("next")) : "/";
  } catch {
    return "/";
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const origin = publicOrigin(req);
  if (tokenHash && type && TYPES.includes(type)) {
    const sb = await supabaseServer();
    const result = sb && (await sb.auth.verifyOtp({ type, token_hash: tokenHash }));
    if (result && !result.error) {
      return NextResponse.redirect(`${origin}${landing(params.get("redirect_to"), origin)}`, { headers: noStore });
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`, { headers: noStore });
}
