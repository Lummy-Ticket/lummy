// A soft brake on the public /near endpoints, per visitor and per server instance. Not a wall against a
// botnet: what it protects costs little (a quote costs nothing, a ticket read about US$0.0005).
if (typeof window !== "undefined") throw new Error("lib/near/throttle is server-only");

const seen = new Map<string, number[]>();

/** Whether this visitor may do this now; counts it when they may. */
export function allowed(req: Request, what: string, limit: number, windowMs: number, now = Date.now()) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${what}:${ip}`;
  const recent = (seen.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    seen.set(key, recent);
    return false;
  }
  recent.push(now);
  seen.set(key, recent);
  // Forget visitors who have gone, so the map stays small.
  if (seen.size > 5_000) {
    for (const [k, times] of seen) if (!times.some((t) => now - t < windowMs)) seen.delete(k);
  }
  return true;
}
