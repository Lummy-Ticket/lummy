// What an error report may carry is what the privacy policy says Sentry receives: the page address
// without its query, the browser and device, the error and where in the code it happened. The SDK is
// already told to collect no user, cookie, header (but the user agent), body or query
// (lib/sentry/options.ts); this is the last pass every report and trace takes on its way out, in
// case a URL, a message or a breadcrumb still holds something. It also masks anything shaped like an
// email address, a key, a token or an ID or phone number, wherever such text can appear.
import type { Breadcrumb, Event } from "@sentry/nextjs";

const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g;
const SECRET = new RegExp(
  [
    String.raw`\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]*`, // a JWT, Supabase's session among them
    String.raw`\b(?:Bearer|Basic)\s+[\w.~+/=-]+`, // an Authorization value
    String.raw`\b(?:sb_secret|sb_publishable|xnd_development|xnd_production|xnd_public|sk-ant|sk_live|sk_test|whsec)[\w-]+`,
    String.raw`\bLUMMY1\.[\w.-]+`, // an entry pass (lib/gate)
    String.raw`\b[\w-]{40,}`, // anything long and opaque: a key, a signature, a hash
  ].join("|"),
  "g",
);
// Ten digits or more, spaces or dashes between them: a phone number, or an ID card's 16 (NIK).
const DIGITS = /\+?\d(?:[ -]?\d){9,}/g;
// A query or fragment after a URL or a path. No lookbehind: Safari before 16.4 would not parse it.
const URL_QUERY = /(^|[\s"'(=,:[])((?:https?:\/\/|\/)[^\s?#"'<>()[\]]*)[?#][^\s"'<>()]*/g;

/** One string, cleaned: queries cut off, then the masks. */
export function clean(text: string): string {
  return text.replace(URL_QUERY, "$1$2").replace(EMAIL, "[email]").replace(SECRET, "[secret]").replace(DIGITS, "[number]");
}

// Keys whose value is never sent, whatever it looks like, and keys that are dropped altogether.
const FILTERED_KEY = /cookie|authorization|password|secret|token|api[-_]?key|pepper|private[-_]?key|session|signature/i;
const DROPPED_KEY = /^(?:http\.query|url\.query|http\.fragment|url\.fragment|query_string|arguments|vars)$/;

/** Every string inside a value, cleaned. A Next.js digest only matches a server log, so it stays. */
export function scrub(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return clean(value);
  if (value === null || typeof value !== "object" || depth > 8) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (DROPPED_KEY.test(key)) continue;
    out[key] = FILTERED_KEY.test(key) ? "[Filtered]" : key === "digest" ? v : scrub(v, depth + 1);
  }
  return out;
}

function scrubBreadcrumb(b: Breadcrumb): Breadcrumb {
  return { ...b, message: b.message === undefined ? undefined : clean(b.message), data: b.data && (scrub(b.data) as Breadcrumb["data"]) };
}

/**
 * The report as it may leave: no user, no server name, the request reduced to its address and the
 * browser's user agent, and every free text cleaned. Stack frames keep their files and lines (that
 * is where in the code), but never the values of local variables.
 */
export function scrubEvent<T extends Event>(event: T): T {
  delete event.user;
  delete event.server_name;
  if (event.request) {
    const { url, method, headers = {} } = event.request;
    const agent = headers["user-agent"] ?? headers["User-Agent"];
    event.request = { url: url === undefined ? undefined : clean(url), method, ...(agent ? { headers: { "User-Agent": agent } } : {}) };
  }
  if (event.message !== undefined) event.message = clean(event.message);
  if (event.logentry) event.logentry = scrub(event.logentry) as T["logentry"];
  if (event.transaction !== undefined) event.transaction = clean(event.transaction);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value !== undefined) exception.value = clean(exception.value);
    if (exception.mechanism?.data) exception.mechanism.data = scrub(exception.mechanism.data) as typeof exception.mechanism.data;
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  if (event.extra) event.extra = scrub(event.extra) as T["extra"];
  if (event.tags) event.tags = scrub(event.tags) as T["tags"];
  if (event.contexts) {
    // The trace context holds the ids that tie a report to its trace: kept, with its data cleaned.
    const { trace, ...rest } = event.contexts;
    event.contexts = { ...(scrub(rest) as typeof rest), ...(trace ? { trace: { ...trace, data: trace.data && (scrub(trace.data) as typeof trace.data) } } : {}) };
  }
  if (event.spans) {
    event.spans = event.spans.map((s) => ({ ...s, description: s.description === undefined ? undefined : clean(s.description), data: scrub(s.data) as typeof s.data }));
  }
  return event;
}
