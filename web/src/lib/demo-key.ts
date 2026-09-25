// The presenter's demo key: the one gate in front of everything that acts for real on a public
// deploy (testnet transactions, demo account sign-in). "open" on a dev machine without a key,
// "key" whenever LUMMY_DEMO_KEY is set, "off" in production without one.
import { timingSafeEqual } from "crypto";

if (typeof window !== "undefined") throw new Error("lib/demo-key hanya boleh dipakai di server");

export type DemoMode = "off" | "open" | "key";

const demoKey = () => process.env.LUMMY_DEMO_KEY?.trim() || undefined;

export function demoMode(): DemoMode {
  if (demoKey()) return "key";
  return process.env.NODE_ENV === "production" ? "off" : "open";
}

/** The request may act: dev machine, or it carries the right x-demo-key header. */
export function demoKeyAllowed(req: Request): boolean {
  const mode = demoMode();
  if (mode === "open") return true;
  const want = demoKey();
  if (mode !== "key" || !want) return false;
  const given = Buffer.from((req.headers.get("x-demo-key") ?? "").trim());
  const wantBuf = Buffer.from(want);
  return given.length === wantBuf.length && timingSafeEqual(given, wantBuf);
}
