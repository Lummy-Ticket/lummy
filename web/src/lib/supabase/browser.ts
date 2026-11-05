import { supabasePublicEnv } from "./env";
import type { Database } from "./types";

// The client's type only; the library itself is fetched on first use (below).
type BrowserClient = ReturnType<typeof import("@supabase/ssr").createBrowserClient<Database>>;
let client: Promise<BrowserClient | null> | undefined;

/**
 * Supabase as the signed-in visitor, in the browser. One client per tab; the session lives in
 * cookies so route handlers see the same user. Null on the server or without Supabase env.
 *
 * Loaded on first use, not with the page: the library is about 70 KB gzipped, a quarter of the
 * JavaScript every page sent, and a visitor who never signs in never needs it (UX review 5 Nov 2026).
 */
export function supabaseBrowser(): Promise<BrowserClient | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  client ??= (async () => {
    const env = supabasePublicEnv();
    if (!env) return null;
    const { createBrowserClient } = await import("@supabase/ssr");
    return createBrowserClient<Database>(env.url, env.key);
  })().catch(() => {
    // The library could not be fetched: a flaky network, or a deploy since this page loaded (its
    // chunk names changed). Null this time, and the next call tries again.
    client = undefined;
    return null;
  });
  return client;
}

/**
 * Whether this browser holds a Supabase session cookie (sb-<project>-auth-token, split into .0, .1
 * when long). @supabase/ssr sets it readable by scripts. Without one there is no session to read,
 * so the client need not be loaded to learn that.
 */
export function hasSessionCookie(): boolean {
  return typeof document !== "undefined" && /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(document.cookie);
}
