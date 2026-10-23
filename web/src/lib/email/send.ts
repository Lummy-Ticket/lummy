// Email from Lummy beyond sign-in (lib/features.ts, `emails`). Sign-in links go out through
// Supabase's own SMTP settings; everything else goes through here, over SMTP to Mailspace, the only
// server allowed to send as @lummy.id (docs/config/04). Nothing is sent unless the flag is on and
// the mail credentials are set, so a server without them stays quiet. EMAIL_TRANSPORT=file writes
// each message as JSON into EMAIL_DIR instead, for npm run email:check, and never runs on Vercel.
// Sending happens after the answer is sent (next/server after()), so a slow or failing mail server
// never holds up or fails the request; a failure is logged and the email is lost.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { after } from "next/server";
import { createTransport, type Transporter } from "nodemailer";
import { FEATURES } from "@/lib/features";
import { isDemoEmail } from "@/lib/supabase/demo";

if (typeof window !== "undefined") throw new Error("lib/email/send hanya boleh dipakai di server");

/** The public contact (components/legal/LegalPage), where a reply to any of these emails lands. */
export const REPLY_TO = "team@lummy.id";

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** What the email is about, for the logs and the check: "order-paid", "claim-seller", and so on. */
  kind: string;
  /** The order, listing or show it is about. */
  ref: string;
};

type Transport = { kind: "smtp"; from: string; mailer: Transporter } | { kind: "file"; from: string; dir: string };

let smtp: { key: string; mailer: Transporter } | null = null;

function transport(): Transport | null {
  if (process.env.EMAIL_TRANSPORT?.trim() === "file") {
    // For the check only. Set on Vercel by mistake, it sends nothing at all rather than write there.
    const dir = process.env.EMAIL_DIR?.trim();
    if (!dir || process.env.VERCEL) return null;
    return { kind: "file", from: process.env.MAIL_FROM?.trim() || "Lummy <no-reply@lummy.id>", dir };
  }
  if (!FEATURES.emails) return null;
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  // Trimmed like every other secret here: a pasted value often ends in a newline.
  const pass = process.env.SMTP_PASSWORD?.trim();
  const from = process.env.MAIL_FROM?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || 465);
  if (!host || !user || !pass || !from || !Number.isInteger(port)) return null;
  const key = `${host}:${port}:${user}`;
  if (smtp?.key !== key) {
    smtp = {
      key,
      // 465 speaks TLS from the first byte; 587 starts plain and must upgrade (requireTLS).
      mailer: createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user, pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return { kind: "smtp", from, mailer: smtp.mailer };
}

/** The domains kept for examples (RFC 2606). The checks make their accounts there. */
const RESERVED = /@(?:[\w-]+\.)*example\.(?:com|net|org)$/i;
const ADDRESS = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

/**
 * Who may receive one. Never a demo account: its domain has no DNS records, so nothing could arrive
 * (lib/supabase/demo). Never an example address, except into the check's folder.
 */
export function deliverable(to: string, file: boolean) {
  const address = to.trim().toLowerCase();
  if (!ADDRESS.test(address) || isDemoEmail(address)) return false;
  return file || !RESERVED.test(address);
}

async function deliver(t: Transport, mail: Mail) {
  if (!deliverable(mail.to, t.kind === "file")) return;
  // A subject is one line, whatever a show's title holds.
  const subject = mail.subject.replace(/[\r\n]+/g, " ").trim();
  if (t.kind === "file") {
    await mkdir(t.dir, { recursive: true });
    const name = `${Date.now()}-${mail.kind}-${randomUUID().slice(0, 8)}.json`;
    const message = { from: t.from, replyTo: REPLY_TO, to: mail.to, subject, kind: mail.kind, ref: mail.ref, text: mail.text, html: mail.html, at: new Date().toISOString() };
    await writeFile(path.join(t.dir, name), JSON.stringify(message, null, 2));
    return;
  }
  await t.mailer.sendMail({
    from: t.from,
    to: mail.to,
    replyTo: REPLY_TO,
    subject,
    text: mail.text,
    html: mail.html,
    // An automatic message (RFC 3834): out-of-office replies leave it alone.
    headers: { "Auto-Submitted": "auto-generated" },
  });
}

/**
 * Builds and sends a batch once the answer is out. `build` does its own reads (who receives it, what
 * the order says), so a request pays nothing for email. Outside a request (a script) it runs at once.
 * Recipients are never logged, only what the email was about.
 */
export function queueEmails(label: string, build: () => Promise<Mail[]>) {
  const t = transport();
  if (!t) return;
  const run = async () => {
    let mails: Mail[];
    try {
      mails = await build();
    } catch (e) {
      console.error("[email] could not prepare:", label, (e as Error).message);
      return;
    }
    for (const mail of mails) {
      await deliver(t, mail).catch((e) => console.error("[email] not sent:", mail.kind, mail.ref, (e as Error).message));
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
