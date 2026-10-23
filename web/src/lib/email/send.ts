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
import { createTransport } from "nodemailer";
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

/**
 * One batch opens at most this many connections to Mailspace and sends at most RATE_PER_S messages a
 * second over them, each connection logging in once for up to 100 messages, rather than once per
 * message: a burst of logins is what a mail host reads as abuse.
 */
const CONNECTIONS = 3;
const RATE_PER_S = 10;
/** A stalled connection gives up after this long, so one message never outlives its batch by more. */
const SOCKET_MS = 10_000;
/** How long a batch may take, its reads included, when the caller names no deadline of its own. */
const BUDGET_MS = 15_000;

/**
 * The last moment a route may still start sending: its own time limit, less room for one message
 * still in flight (SOCKET_MS) and for closing. A route that may send many passes this to its
 * notify call, so the function is never stopped half way through a batch with nothing logged.
 */
export const emailDeadline = (startedAt: number, maxDurationS: number) => startedAt + maxDurationS * 1000 - SOCKET_MS - 2_000;

type Transport =
  | { kind: "smtp"; from: string; host: string; port: number; user: string; pass: string }
  | { kind: "file"; from: string; dir: string };

function transport(): Transport | null {
  if (process.env.EMAIL_TRANSPORT?.trim() === "file") {
    // For the check only. Set on Vercel by mistake, it sends nothing at all rather than write there.
    const dir = process.env.EMAIL_DIR?.trim();
    if (!dir || process.env.VERCEL) return null;
    return { kind: "file", from: process.env.MAIL_FROM?.trim() || "Lummy <notify@lummy.id>", dir };
  }
  if (!FEATURES.emails) return null;
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  // Trimmed like every other secret here: a pasted value often ends in a newline.
  const pass = process.env.SMTP_PASSWORD?.trim();
  const from = process.env.MAIL_FROM?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || 465);
  if (!host || !user || !pass || !from || !Number.isInteger(port)) return null;
  return { kind: "smtp", from, host, port, user, pass };
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

/**
 * What a failure is called, without its message: nodemailer adds the mail server's reply to the
 * message, and a refused recipient's reply usually repeats the address.
 */
function failure(e: unknown) {
  const { code, responseCode } = (e ?? {}) as { code?: unknown; responseCode?: unknown };
  return `${typeof code === "string" ? code : "unknown"}${typeof responseCode === "number" ? ` ${responseCode}` : ""}`;
}

/** Sends one batch over one pool of connections, opened for it and closed after it. */
async function sendAll(t: Transport, mails: Mail[], label: string, deadline: number) {
  const pool =
    t.kind === "smtp"
      ? createTransport({
          pool: true,
          maxConnections: CONNECTIONS,
          maxMessages: 100,
          rateDelta: 1000,
          rateLimit: RATE_PER_S,
          host: t.host,
          port: t.port,
          // 465 speaks TLS from the first byte; 587 starts plain and must upgrade (requireTLS).
          secure: t.port === 465,
          requireTLS: t.port !== 465,
          auth: { user: t.user, pass: t.pass },
          connectionTimeout: SOCKET_MS,
          greetingTimeout: SOCKET_MS,
          socketTimeout: SOCKET_MS,
        })
      : null;

  const deliver = async (mail: Mail) => {
    // A subject is one line, whatever a show's title holds.
    const subject = mail.subject.replace(/[\r\n]+/g, " ").trim();
    if (t.kind === "file") {
      await mkdir(t.dir, { recursive: true });
      const name = `${Date.now()}-${mail.kind}-${randomUUID().slice(0, 8)}.json`;
      const message = { from: t.from, replyTo: REPLY_TO, to: mail.to, subject, kind: mail.kind, ref: mail.ref, text: mail.text, html: mail.html, at: new Date().toISOString() };
      await writeFile(path.join(t.dir, name), JSON.stringify(message, null, 2));
      return;
    }
    await pool!.sendMail({
      from: t.from,
      to: mail.to,
      replyTo: REPLY_TO,
      subject,
      text: mail.text,
      html: mail.html,
      // An automatic message (RFC 3834): out-of-office replies leave it alone.
      headers: { "Auto-Submitted": "auto-generated" },
    });
  };

  const queue = mails.filter((m) => deliverable(m.to, t.kind === "file"));
  let late = 0;
  // As many senders as connections, each taking the next email until the queue or the time runs out.
  const sender = async () => {
    for (let mail = queue.shift(); mail; mail = queue.shift()) {
      if (Date.now() >= deadline) {
        late++;
        continue;
      }
      const m = mail;
      await deliver(m).catch((e) => console.error("[email] not sent:", m.kind, m.ref, failure(e)));
    }
  };
  try {
    await Promise.all(Array.from({ length: CONNECTIONS }, sender));
  } finally {
    pool?.close();
  }
  if (late) console.error("[email] out of time:", label, `${late} not sent`);
}

/**
 * Builds and sends a batch once the answer is out. `build` does its own reads (who receives it, what
 * the order says), so a request pays nothing for email. Nothing starts after `deadline` (by default
 * BUDGET_MS from the start), and what is left is counted in the log. Outside a request (a script) it
 * runs at once. Recipients are never logged, only what the email was about.
 */
export function queueEmails(label: string, build: () => Promise<Mail[]>, deadline?: number) {
  const t = transport();
  if (!t) return;
  const run = async () => {
    const until = deadline ?? Date.now() + BUDGET_MS;
    let mails: Mail[];
    try {
      mails = await build();
    } catch (e) {
      // Our own database reads: their messages hold no addresses.
      console.error("[email] could not prepare:", label, (e as Error).message);
      return;
    }
    await sendAll(t, mails, label, until).catch((e) => console.error("[email] batch failed:", label, failure(e)));
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
