/**
 * Who gets where, checked without a server or a database (review, 4 Nov 2026). Offline, run in CI.
 *   1. safePath (lib/public-origin.ts) keeps every ?next= on this site: paths that resolve to
 *      //another.site, however they are spelled, come back as "/", and ordinary paths survive.
 *   2. staffByRole (lib/supabase/demo.ts): on lummy.id a demo account is never staff, whatever
 *      its profile says; elsewhere, and for a real staff account, the role decides.
 *
 *   npm run access:check
 */
import { safePath } from "../src/lib/public-origin";
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

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
