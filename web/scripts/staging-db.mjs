// The staging project's database (docs/config/05-staging.md), through the Supabase CLI at a pinned
// version, so no install is needed:
//   npm run staging:setup   supabase/migrations, then supabase/seed.sql (supabase db push --include-seed)
//   npm run staging:rls     supabase/tests/rls_check.sql, the RLS probe (supabase db query --file)
// The connection string is STAGING_DB_URL in ~/.lummy/staging.env. It is never printed, and the
// CLI's output is passed on with its password blanked. Anything that names the production project,
// or a database that is not the project NEXT_PUBLIC_SUPABASE_URL names, is refused before the CLI
// starts.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PRODUCTION_REF, WEB_DIR, readEnvFile, stagingFile } from "./lib/target-env.mjs";

const CLI = "supabase@2.122.0";
const REPO = path.resolve(WEB_DIR, "..");
const mode = process.argv[2];

function fail(message) {
  console.error(`staging:${mode ?? "?"}: ${message}`);
  process.exit(1);
}

if (mode !== "setup" && mode !== "rls") fail("say setup or rls (npm run staging:setup, npm run staging:rls)");

const file = stagingFile();
if (!existsSync(file)) fail(`${file} does not exist yet. Make it first: bash ~/code/opertix/web/scripts/staging-env.sh (docs/config/05-staging.md)`);
const values = readEnvFile(file);
const dbUrl = values.STAGING_DB_URL ?? "";
const apiUrl = values.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!dbUrl) fail(`STAGING_DB_URL is missing from ${file}`);
if (!apiUrl) fail(`NEXT_PUBLIC_SUPABASE_URL is missing from ${file}`);
if (dbUrl.includes(PRODUCTION_REF) || apiUrl.includes(PRODUCTION_REF)) {
  fail(`refused: ${file} names the production project ${PRODUCTION_REF}. Staging has to be a project of its own.`);
}

let db;
try {
  db = new URL(dbUrl);
} catch {
  fail("STAGING_DB_URL is not a connection string (postgresql://...)");
}
if (db.protocol !== "postgresql:" && db.protocol !== "postgres:") fail("STAGING_DB_URL is not a postgresql:// connection string");
if (!db.password) fail("STAGING_DB_URL has no password in it");
const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    fail("STAGING_DB_URL has a broken %-escape in it");
  }
};
// The Session pooler names the project in the user (postgres.REF), a direct connection in the host.
const dbRef = /^postgres\.([a-z0-9]+)$/.exec(decode(db.username))?.[1] ?? /^db\.([a-z0-9]+)\.supabase\.co$/.exec(db.hostname)?.[1];
const apiRef = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(apiUrl)?.[1];
if (!dbRef) fail("cannot tell which project STAGING_DB_URL is for; use the Session pooler string from the dashboard");
if (!apiRef) fail("NEXT_PUBLIC_SUPABASE_URL is not a project URL like https://REF.supabase.co");
if (dbRef !== apiRef) fail(`STAGING_DB_URL is for project ${dbRef} but NEXT_PUBLIC_SUPABASE_URL for ${apiRef}`);

const secrets = [db.password, decode(db.password)].filter((s) => s.length >= 3);
const blank = (text) => secrets.reduce((t, s) => t.split(s).join("***"), text);

/** Runs the CLI, passing its output on line by line with the password blanked, and keeps it. */
function cli(args, { echo }) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["-y", CLI, ...args], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
    let kept = "";
    const relay = (stream, to) => {
      let partial = "";
      stream.on("data", (chunk) => {
        const lines = (partial + chunk.toString()).split("\n");
        partial = lines.pop();
        for (const line of lines) {
          const clean = blank(line);
          kept += `${clean}\n`;
          if (echo) to.write(`${clean}\n`);
        }
      });
      stream.on("end", () => {
        if (!partial) return;
        const clean = blank(partial);
        kept += clean;
        if (echo) to.write(`${clean}\n`);
      });
    };
    relay(child.stdout, process.stdout);
    relay(child.stderr, process.stderr);
    child.on("close", (code) => resolve({ code, out: kept }));
  });
}

if (mode === "setup") {
  const migrations = readdirSync(path.join(REPO, "supabase/migrations")).filter((f) => f.endsWith(".sql")).length;
  console.log(`Staging project ${dbRef}: ${migrations} migrations from supabase/migrations, then supabase/seed.sql, with ${CLI}.`);
  const { code } = await cli(["db", "push", "--db-url", dbUrl, "--workdir", REPO, "--include-seed", "--yes"], { echo: true });
  if (code !== 0) fail(`supabase db push stopped with code ${code}; nothing after the failing step was applied`);
  console.log("Staging is set up. Next: npm run staging:rls, then bash scripts/start-local.sh (docs/config/05-staging.md).");
} else {
  // The probe reports through an error on purpose, which is what rolls back everything it made, so
  // the CLI exits non-zero even when every line is ok: the lines decide.
  const probe = path.join(REPO, "supabase/tests/rls_check.sql");
  const sql = readFileSync(probe, "utf8");
  const expected = (sql.match(/^select pg_temp\.probe\(/gm) ?? []).length + (sql.match(/^insert into t_out\(line\)/gm) ?? []).length;
  console.log(`Staging project ${dbRef}: running supabase/tests/rls_check.sql (${expected} checks, rolled back) with ${CLI}.`);
  const { out } = await cli(["db", "query", "--db-url", dbUrl, "--file", probe], { echo: false });
  const report = out
    .replaceAll("\\n", "\n")
    .split("\n")
    .map((line) => /(?:^|[\s"])(ok {4}|FAIL {2})(.+?)\s*(?:\(SQLSTATE [0-9A-Z]{5}\))?"?$/.exec(line))
    .filter(Boolean)
    .map((m) => `${m[1]}${m[2]}`);
  for (const line of report) console.log(line);
  const ok = report.filter((l) => l.startsWith("ok")).length;
  const failed = report.length - ok;
  if (!report.length) {
    console.error(out.split("\n").slice(-30).join("\n"));
    fail("the CLI did not hand back the probe's report. Run supabase/tests/rls_check.sql in the staging project's SQL editor instead (docs/config/05-staging.md).");
  }
  if (failed || ok !== expected) fail(`${ok} ok and ${failed} FAIL of ${expected} checks`);
  console.log(`RLS probe on staging: all ${expected} checks ok.`);
}
