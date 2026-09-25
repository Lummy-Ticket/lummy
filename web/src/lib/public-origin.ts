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

/** Only same-site paths, so a sign-in link cannot be turned into a redirect to another site. */
export function safePath(path: string | null) {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}
