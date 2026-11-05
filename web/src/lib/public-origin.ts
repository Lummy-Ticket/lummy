import type { NextRequest } from "next/server";

/**
 * The origin the visitor actually used. Behind Vercel the request URL can be internal, so the
 * forwarded host and scheme win. `next start` sets them too, as http, which is why the scheme is
 * read rather than assumed: a local server must not redirect to https.
 */
export function publicOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "http" ? "http" : "https";
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

/**
 * Whether a form post came from this site's own page. A browser names the sender in Origin, except
 * that a page with Referrer-Policy: no-referrer and a sandboxed frame both send the word "null";
 * Sec-Fetch-Site tells those two apart, and a page cannot set it (tried in Chromium and WebKit,
 * 5 Nov 2026). Checked offline by `npm run access:check`.
 */
export function postedFromThisSite(headers: Headers, origin: string) {
  const sent = headers.get("origin");
  if (sent && sent !== "null") return sent === origin;
  return headers.get("sec-fetch-site") === "same-origin";
}

/**
 * Only same-site paths, so a sign-in link cannot be turned into a redirect to another site. The
 * path is resolved the way a browser resolves it, which drops tabs and newlines and reads a
 * backslash as a slash: a prefix check alone let /%09/evil.example through as //evil.example
 * (production audit, 2 Nov 2026). What comes back is the resolved path, never the raw string.
 * A resolved path that starts with two slashes is refused too: /.//evil.example resolves to
 * //evil.example, which a browser and the router read as another site (review, 4 Nov 2026).
 * Checked offline by `npm run access:check`.
 */
export function safePath(path: string | null) {
  if (!path?.startsWith("/")) return "/";
  const base = "https://lummy.invalid";
  try {
    const url = new URL(path, base);
    if (url.origin !== base || url.pathname.startsWith("//")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
