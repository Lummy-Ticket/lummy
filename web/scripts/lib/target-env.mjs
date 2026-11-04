// Which database the scripts in web/scripts talk to (docs/config/05-staging.md). The rule is the
// one web/scripts/start-local.sh follows for the server (through target-env.sh, its shell half), so
// a check and the server it drives agree:
//   LUMMY_ENV=staging      ~/.lummy/staging.env, and stop if it is missing or incomplete
//   LUMMY_ENV=production   web/.env.local, which points at the production project
//   LUMMY_ENV unset        staging when ~/.lummy/staging.env exists, production when it does not
// Staging values win over anything already in the environment; web/.env.local then fills in what
// is still unset, as Next does for the server, so the Xendit test keys come from there.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCTION_REF = "tnszimamfpuaqjrdynbu";
/** A staging file must set these itself: any of them taken from web/.env.local would be production's. */
export const STAGING_REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];
/** Only staging:setup needs the database password, so neither the server nor a check is given it. */
export const SETUP_ONLY = ["STAGING_DB_URL"];

export const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const stagingFile = () => path.join(homedir(), ".lummy", "staging.env");

/**
 * NAME=value lines, the last one for a name winning, with one pair of surrounding quotes taken off.
 * target-env.sh reads the files the same way.
 */
export function readEnvFile(file) {
  const values = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.replace(/\r$/, ""));
    if (!m) continue;
    let value = m[2].trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
    values[m[1]] = value;
  }
  return values;
}

/** "staging" or "production"; throws when LUMMY_ENV asks for something else. */
export function chooseTarget(env = process.env) {
  const asked = env.LUMMY_ENV ?? "";
  if (asked === "staging" || asked === "production") return asked;
  if (asked !== "") throw new Error(`LUMMY_ENV=${asked} is neither staging nor production`);
  return existsSync(stagingFile()) ? "staging" : "production";
}

/** Why a staging file cannot be used, or null when it can. */
export function stagingProblem(values) {
  const missing = STAGING_REQUIRED.filter((name) => !values[name]);
  if (missing.length) return `${missing.join(", ")} missing`;
  if (!/^https:\/\/[^/\s]+/.test(values.NEXT_PUBLIC_SUPABASE_URL)) return "NEXT_PUBLIC_SUPABASE_URL is not an https URL";
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", ...SETUP_ONLY]) {
    if (values[name]?.includes(PRODUCTION_REF)) return `${name} names the production project ${PRODUCTION_REF}`;
  }
  return null;
}

/** The host part of a Supabase URL, which says which project it is without saying anything secret. */
export const hostOf = (url) => (url ? (/^[a-z]+:\/\/([^/:\s]+)/i.exec(url)?.[1] ?? "unreadable URL") : "none");

/** The one line every script prints before it touches anything. */
export function banner(target, host, url = "") {
  if (url.includes(PRODUCTION_REF)) return `DB target: PRODUCTION (${host}), writes land in the live database`;
  if (host === "none") return "DB target: none, no NEXT_PUBLIC_SUPABASE_URL set";
  return target === "staging" ? `DB target: staging (${host})` : `DB target: web/.env.local (${host})`;
}

/**
 * A check and the server it drives must use the same database. start-local.sh leaves a note of the
 * host its server uses in /tmp/lummy-next-PORT.target, so a run that disagrees with a noted local
 * server stops before writing anything. BASE unset means the check's own default, a local server on
 * `defaultBase`, and is looked at too. Where nothing says which database the server uses (a remote
 * BASE, or a local server not started by start-local.sh), a run that picked staging only because
 * ~/.lummy/staging.env exists stops as well: it could write to staging while the server reads
 * production, or the other way round. LUMMY_ENV said outright is trusted there (review, 4 Nov 2026).
 */
export function serverDisagrees(host, target, env = process.env, defaultBase = "http://localhost:3000") {
  let base;
  try {
    base = new URL(env.BASE || defaultBase);
  } catch {
    return null;
  }
  const noted = ["127.0.0.1", "localhost"].includes(base.hostname) ? serverNote(base) : null;
  if (noted) return noted.host === host ? null : `the server at ${base.origin} uses ${noted.target} (${noted.host}), this run would use ${host}`;
  if (target === "staging" && !env.LUMMY_ENV) {
    return `nothing says which database the server at ${base.origin} uses, and this run picked staging only because ~/.lummy/staging.env exists`;
  }
  return null;
}

/** What start-local.sh noted about the server on this port, while that server still runs. */
function serverNote(base) {
  const note = `/tmp/lummy-next-${base.port || (base.protocol === "https:" ? "443" : "80")}.target`;
  if (!existsSync(note)) return null;
  const [target, host, pid] = readFileSync(note, "utf8").trim().split(/\s+/);
  try {
    if (!readFileSync(`/proc/${Number(pid)}/cmdline`, "utf8").includes("next")) return null;
  } catch {
    return null;
  }
  return { target, host };
}

/**
 * Loads the target's env into process.env and prints the banner; exits when it cannot be used.
 * `defaultBase` is the server the check talks to when BASE is unset.
 */
export function loadTarget(defaultBase = "http://localhost:3000") {
  let target;
  try {
    target = chooseTarget();
    if (target === "staging") {
      const file = stagingFile();
      if (!existsSync(file)) throw new Error(`LUMMY_ENV=staging but ${file} does not exist (docs/config/05-staging.md)`);
      const values = readEnvFile(file);
      const problem = stagingProblem(values);
      if (problem) throw new Error(`${file}: ${problem}`);
      for (const [name, value] of Object.entries(values)) if (!SETUP_ONLY.includes(name)) process.env[name] = value;
    }
    const local = path.join(WEB_DIR, ".env.local");
    if (existsSync(local)) process.loadEnvFile(local);
  } catch (e) {
    console.error(`DB target: refused, ${e.message}`);
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const host = hostOf(url);
  console.error(banner(target, host, url));
  const disagreement = serverDisagrees(host, target, process.env, defaultBase);
  if (disagreement) {
    console.error(`DB target: refused, ${disagreement}. Restart it with web/scripts/start-local.sh, or set LUMMY_ENV to match.`);
    process.exit(1);
  }
  return { target, host };
}
