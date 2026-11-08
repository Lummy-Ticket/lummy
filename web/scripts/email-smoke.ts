// One test email over the same SMTP settings lib/email/send.ts uses, before FEATURES.emails is turned
// on (tasks 11.3, docs/config/04):
//   npm run email:smoke                         logs in only: checks the password, sends nothing
//   npm run email:smoke -- someone@gmail.com    logs in and sends one test email there
// Reads SMTP_PASSWORD, and any other SMTP_* or MAIL_FROM line, from ~/.lummy/production.env
// (SECRET_FILE to read another file) and never prints it. What is missing defaults to Mailspace's
// settings for no-reply@lummy.id. Save the password first, typed at a hidden prompt:
//   bash ~/code/opertix/web/scripts/set-secret.sh SMTP_PASSWORD
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTransport } from "nodemailer";

const file = process.env.SECRET_FILE ?? path.join(os.homedir(), ".lummy", "production.env");
const env: Record<string, string> = {};
try {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^(SMTP_[A-Z]+|MAIL_FROM)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
} catch {
  console.log(`FAIL  cannot read ${file}`);
  process.exit(1);
}

const host = env.SMTP_HOST || "mx9.mailspace.id";
const port = Number(env.SMTP_PORT || 465);
const user = env.SMTP_USER || "no-reply@lummy.id";
const from = env.MAIL_FROM || "Lummy <no-reply@lummy.id>";
const pass = env.SMTP_PASSWORD;
if (!pass) {
  console.log(`FAIL  SMTP_PASSWORD is not in ${file}. Save it first: bash ~/code/opertix/web/scripts/set-secret.sh SMTP_PASSWORD`);
  process.exit(1);
}
const to = process.argv[2]?.trim();
if (to && !/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(to)) {
  console.log("FAIL  that is not an email address");
  process.exit(1);
}

// The same connection settings as lib/email/send.ts: TLS from the first byte on 465, upgraded on 587.
const t = createTransport({
  host,
  port,
  secure: port === 465,
  requireTLS: port !== 465,
  auth: { user, pass },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 10_000,
});

async function main() {
  await t.verify();
  console.log(`PASS  logged in to ${host}:${port} as ${user}`);
  if (to) {
    const sent = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const info = await t.sendMail({
      from,
      to,
      replyTo: "team@lummy.id",
      subject: "Lummy: email uji",
      text: `Ini email uji dari server email Lummy, dikirim ${sent} WIB lewat ${host} sebagai ${user}. Kalau email ini sampai di kotak masuk, bukan spam, pengiriman notifikasi siap dinyalakan.`,
      headers: { "Auto-Submitted": "auto-generated" },
    });
    console.log(info.accepted.length ? `PASS  accepted by the mail server (${info.messageId})` : "FAIL  the mail server did not accept it");
    console.log("      In Gmail: open it, the three dots, Show original. SPF, DKIM and DMARC should all say PASS.");
  }
}

main()
  .catch((e) => {
    // Only the codes: nodemailer's message repeats the server's reply, which can hold the address.
    const { code, responseCode } = (e ?? {}) as { code?: unknown; responseCode?: unknown };
    console.log(`FAIL  ${typeof code === "string" ? code : "error"}${typeof responseCode === "number" ? ` ${responseCode}` : ""} (EAUTH means the password was not accepted)`);
    process.exitCode = 1;
  })
  .finally(() => t.close());
