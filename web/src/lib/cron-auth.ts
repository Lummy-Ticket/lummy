// Who may run a cron route: only Vercel Cron, which sends `Bearer CRON_SECRET` on every run. Compared in
// constant time, so the answer's timing says nothing about the secret.
import { timingSafeEqual } from "node:crypto";

export function fromCron(req: Request, secret: string) {
  const sent = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return sent.length === expected.length && timingSafeEqual(sent, expected);
}
