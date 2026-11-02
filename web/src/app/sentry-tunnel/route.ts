// The browser's error reports reach Sentry through lummy.id itself: an ad blocker that stops calls to
// sentry.io does not drop them, and Sentry never learns a visitor's IP address. When the build has a
// Sentry DSN, next.config.ts points /api/client-errors here (Sentry's build looks for this file at
// exactly this path); without one, this answers like a page that is not there.

// An error report is a few kilobytes; nothing here sends session replays or files.
const MAX_BYTES = 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return new Response(null, { status: 404 });
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return new Response(null, { status: 413 });
  const body = await request.arrayBuffer();
  if (!body.byteLength) return new Response(null, { status: 400 });
  if (body.byteLength > MAX_BYTES) return new Response(null, { status: 413 });
  // Only the report and the browser's user agent go on. Sentry's handler would also pass on the
  // visitor's address (X-Forwarded-For), the page they were on (Referer) and the client hints.
  const headers = new Headers({ "content-length": String(body.byteLength) });
  const agent = request.headers.get("user-agent");
  if (agent) headers.set("user-agent", agent);
  // It forwards a report only to the DSN the server itself was started with (lib/sentry/server.ts).
  const { POST: forward } = await import("@sentry/nextjs/tunnel");
  return forward(new Request(request.url, { method: "POST", headers, body }));
}
