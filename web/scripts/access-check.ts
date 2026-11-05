/**
 * Who gets where, checked without a server or a database (review, 4 Nov 2026). Offline, run in CI.
 *   1. safePath (lib/public-origin.ts) keeps every ?next= on this site: paths that resolve to
 *      //another.site, however they are spelled, come back as "/", and ordinary paths survive.
 *   2. staffByRole (lib/supabase/demo.ts): on lummy.id a demo account is never staff, whatever
 *      its profile says; elsewhere, and for a real staff account, the role decides.
 *   3. pickRecord (lib/chain/pick.ts): a proof page takes the ledger's record over an escrow
 *      listing anyone may have made under the same id, and never falls back to that listing while
 *      the ledger cannot be read.
 *
 *   npm run access:check
 */
import { postedFromThisSite, safePath } from "../src/lib/public-origin";
import { pickRecord, type Read } from "../src/lib/chain/pick";
import { DEMO_ACCOUNTS, staffByRole } from "../src/lib/supabase/demo";

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

// Where a browser would actually go from lummy.id with this path.
const lands = (path: string) => new URL(path, "https://lummy.id").host;

const offSite = [
  "//evil.example",
  "/\\evil.example",
  "/.//evil.example",
  "/..//evil.example",
  "/%2e//evil.example",
  "/%2E%2E//evil.example",
  "/./\\evil.example",
  "/.\\/evil.example",
  "/a/..//evil.example",
  "/a/../..//evil.example",
  "/%09/evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "https://evil.example/",
  "javascript:alert(1)",
  "evil.example",
  "",
];
for (const p of offSite) {
  const got = safePath(p);
  check(`stays on lummy.id: ${JSON.stringify(p)}`, got.startsWith("/") && !got.startsWith("//") && lands(got) === "lummy.id", `got ${JSON.stringify(got)}`);
}
check("null comes back as /", safePath(null) === "/");

// What the sign-in button's post may look like. "null" is what Chromium and WebKit really send from
// a page with Referrer-Policy: no-referrer (same-origin) and from a sandboxed frame (cross-site).
const SITE = "https://lummy.id";
const posted = (h: Record<string, string>) => postedFromThisSite(new Headers(h), SITE);
check("form post: this site's Origin passes", posted({ origin: SITE, "sec-fetch-site": "same-origin" }));
check("form post: another site's Origin is refused", !posted({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
check("form post: another site's Origin is refused whatever else it sends", !posted({ origin: "https://evil.example", "sec-fetch-site": "same-origin" }));
check("form post: a subdomain's Origin is refused", !posted({ origin: "https://evil.lummy.id", "sec-fetch-site": "same-site" }));
check("form post: Origin null from this site's own page passes", posted({ origin: "null", "sec-fetch-site": "same-origin" }));
check("form post: Origin null from a sandboxed frame is refused", !posted({ origin: "null", "sec-fetch-site": "cross-site" }));
check("form post: Origin null with nothing else is refused", !posted({ origin: "null" }));
check("form post: no Origin from this site passes", posted({ "sec-fetch-site": "same-origin" }));
check("form post: no Origin and nothing else is refused", !posted({}));

const kept: [string, string][] = [
  ["/", "/"],
  ["/checkout?listing=ls-0123456789ab&qty=2", "/checkout?listing=ls-0123456789ab&qty=2"],
  ["/tickets/or-abc#pass", "/tickets/or-abc#pass"],
  ["/events/ev-5sos-jakarta", "/events/ev-5sos-jakarta"],
  ["/a//b", "/a//b"],
  ["/admin/../sell", "/sell"],
];
for (const [p, want] of kept) check(`kept: ${p}`, safePath(p) === want, `got ${JSON.stringify(safePath(p))}`);

const demoAdmin = DEMO_ACCOUNTS.ADMIN.email;
check("on lummy.id the demo admin is not staff, even with role admin", !staffByRole("admin", demoAdmin, true));
check("on lummy.id the demo address in capitals is not staff either", !staffByRole("admin", demoAdmin.toUpperCase(), true));
check("on lummy.id a real staff account stays staff", staffByRole("admin", "someone@lummy.id", true));
check("on a preview or a local server the demo admin is staff", staffByRole("admin", demoAdmin, false));
check("a member is never staff", !staffByRole("member", "someone@lummy.id", false) && !staffByRole(null, demoAdmin, false));
check("an address that only ends like the demo domain is not taken for one", staffByRole("admin", "x@notdemo.lummy.id.example", true));

// Made-up records: "squat" is an escrow listing a stranger created under a ledger record's id.
type Rec = { who: string; there: boolean };
const has = (r: Rec) => r.there;
const ok = (v: Rec | null): Read<Rec> => ({ ok: true, value: v });
const down: Read<Rec> = { ok: false, error: new Error("rpc down") };
const ledgerRec = { who: "ledger", there: true };
const squat = { who: "squat", there: true };
const empty = { who: "none", there: false };
const pick = (e: Read<Rec>, l: Read<Rec>, asked = true) => {
  try {
    return pickRecord(e, l, asked, has)?.who ?? null;
  } catch {
    return "error";
  }
};
check("proof: the ledger's record wins over an escrow listing under the same id", pick(ok(squat), ok(ledgerRec)) === "ledger");
check("proof: ledger unreadable, an escrow listing is not shown in its place", pick(ok(squat), down) === "error");
check("proof: the ledger holds nothing, a real escrow listing is shown", pick(ok(squat), ok(empty)) === "squat" && pick(ok(squat), ok(null)) === "squat");
check("proof: escrow named as the source, the escrow listing is shown", pick(ok(squat), ok(null), false) === "squat");
check("proof: escrow unreadable, the ledger record still shows", pick(down, ok(ledgerRec)) === "ledger");
check("proof: nothing anywhere is null, a failed escrow read with nothing in the ledger is an error", pick(ok(empty), ok(empty)) === null && pick(down, ok(null)) === "error");

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
