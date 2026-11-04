// Which database a check may write to, decided without one (scripts/lib/target-env.mjs,
// serverDisagrees; review, 4 Nov 2026). A run stops when the local server it drives noted another
// database, and when it picked staging only because ~/.lummy/staging.env exists while nothing says
// what the server uses. Offline, run in CI. Notes go on ports nothing listens on, and are removed.
//
//   npm run target:check
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { serverDisagrees } from "./lib/target-env.mjs";

const results = [];
const check = (name, ok, note) => results.push({ name, ok, note: ok ? undefined : note });

const STAGING = "abcdefghijklmnopqrst.supabase.co";
const PROD = "tnszimamfpuaqjrdynbu.supabase.co";
const port = 65000 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${port}`;
const notePath = `/tmp/lummy-next-${port}.target`;
const say = (v) => JSON.stringify(v);

// No note for this port.
rmSync(notePath, { force: true });
check("auto staging, BASE unset, no note: refused", !!serverDisagrees(STAGING, "staging", {}, base), "was let through");
check("auto staging, BASE set, no note: refused", !!serverDisagrees(STAGING, "staging", { BASE: base }), "was let through");
check("auto staging, remote BASE: refused", !!serverDisagrees(STAGING, "staging", { BASE: "https://lummy.id" }), "was let through");
check("LUMMY_ENV=staging said outright, no note: allowed", serverDisagrees(STAGING, "staging", { BASE: base, LUMMY_ENV: "staging" }) === null);
check("LUMMY_ENV=production, remote BASE: allowed", serverDisagrees(PROD, "production", { BASE: "https://lummy.id", LUMMY_ENV: "production" }) === null);
check("production without a staging file, no note: allowed as before", serverDisagrees(PROD, "production", {}, base) === null);
check("an unreadable BASE is left to the check itself", serverDisagrees(STAGING, "staging", { BASE: "not a url" }) === null);

// A note whose server is gone counts as no note.
writeFileSync(notePath, `staging ${STAGING} 999999999\n`);
check("a note of a dead server is ignored: auto staging refused", !!serverDisagrees(STAGING, "staging", { BASE: base }), "was let through");
check("a note of a dead server is ignored: explicit LUMMY_ENV allowed", serverDisagrees(PROD, "production", { BASE: base, LUMMY_ENV: "production" }) === null);

// A note whose server still runs: a process whose command line holds "next".
const server = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)", "next"], { stdio: "ignore" });
try {
  writeFileSync(notePath, `production ${PROD} ${server.pid}\n`);
  check("a running server on production, run on staging: refused", !!serverDisagrees(STAGING, "staging", { BASE: base, LUMMY_ENV: "staging" }), "was let through");
  check("a running server on production, BASE unset but its port the default: refused", !!serverDisagrees(STAGING, "staging", { LUMMY_ENV: "staging" }, base), "was let through");
  const same = serverDisagrees(PROD, "production", { BASE: base });
  check("a running server on the same database: allowed", same === null, say(same));
  writeFileSync(notePath, `staging ${STAGING} ${server.pid}\n`);
  const agreed = serverDisagrees(STAGING, "staging", { BASE: base });
  check("auto staging with a note that agrees: allowed", agreed === null, say(agreed));
} finally {
  server.kill();
  rmSync(notePath, { force: true });
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
