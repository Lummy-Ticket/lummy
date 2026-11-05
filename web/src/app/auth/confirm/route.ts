// Sign-in links from our own email templates (custom SMTP): the link carries a token hash that is
// verified here, so it works on any device, unlike the default link, whose one-time code only works
// in the browser that asked for it.
// Template link: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}
//
// Opening the link only shows a button; pressing it signs in (review, 4 Nov 2026). Signing in on a
// plain GET let anyone who sent a link for their own account sign the reader in as them (an order
// then paid, or a ticket then listed, would land in the sender's account), and let a mail scanner
// that opens links spend the one-time token first. The POST is taken only from this site's own page.
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin, safePath } from "@/lib/public-origin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const TYPES: EmailOtpType[] = ["email", "signup", "magiclink"];
const TOKEN = /^[\w-]{8,200}$/;

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

const failed = (origin: string) => NextResponse.redirect(`${origin}/login?error=link`, { status: 303, headers: noStore });

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The page a sign-in link opens: one button, which posts the token back here. */
function confirmPage(tokenHash: string, type: string, redirectTo: string | null) {
  const hidden = [
    ["token_hash", tokenHash],
    ["type", type],
    ...(redirectTo ? [["redirect_to", redirectTo]] : []),
  ]
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escape(value)}">`)
    .join("");
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Masuk ke Lummy Ticket</title>
<style>
  body { margin: 0; min-height: 100svh; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f6f7fb; color: #111827; }
  main { max-width: 420px; width: 100%; background: #fff; border: 1px solid #c7d2fe; border-radius: 24px; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.5; color: #4b5563; margin: 0 0 12px; }
  .en { color: #6b7280; }
  button { margin-top: 8px; width: 100%; min-height: 48px; border: 0; border-radius: 14px; background: #1e2a78; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<main>
  <h1>Masuk ke Lummy Ticket</h1>
  <p>Tekan tombol di bawah untuk masuk. Lanjutkan hanya kalau kamu sendiri yang meminta link ini dari halaman masuk Lummy.</p>
  <p class="en" lang="en">Press the button to sign in. Only continue if you asked for this link yourself on Lummy's sign-in page.</p>
  <form method="post" action="/auth/confirm">${hidden}
    <button type="submit" data-confirm-sign-in>Lanjut masuk / Continue</button>
  </form>
</main>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const tokenHash = params.get("token_hash") ?? "";
  const type = params.get("type") as EmailOtpType | null;
  if (!TOKEN.test(tokenHash) || !type || !TYPES.includes(type)) return failed(publicOrigin(req));
  return new NextResponse(confirmPage(tokenHash, type, params.get("redirect_to")), {
    headers: {
      ...noStore,
      "Content-Type": "text/html; charset=utf-8",
      // Not inside another site's frame, so nobody can lay a decoy over the button.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/**
 * Only this site's own page may post here: a form on another site would sign the visitor in
 * with whatever token that site holds. Browsers send Origin with every form post.
 */
function fromThisSite(req: NextRequest, origin: string) {
  const sent = req.headers.get("origin");
  if (sent) return sent === origin;
  return req.headers.get("sec-fetch-site") === "same-origin";
}

export async function POST(req: NextRequest) {
  const origin = publicOrigin(req);
  if (!fromThisSite(req, origin)) return failed(origin);
  const form = await req.formData().catch(() => null);
  const tokenHash = String(form?.get("token_hash") ?? "");
  const type = String(form?.get("type") ?? "") as EmailOtpType;
  if (!TOKEN.test(tokenHash) || !TYPES.includes(type)) return failed(origin);
  const sb = await supabaseServer();
  const result = sb && (await sb.auth.verifyOtp({ type, token_hash: tokenHash }));
  if (!result || result.error) return failed(origin);
  const redirectTo = form?.get("redirect_to");
  return NextResponse.redirect(`${origin}${landing(typeof redirectTo === "string" ? redirectTo : null, origin)}`, { status: 303, headers: noStore });
}
