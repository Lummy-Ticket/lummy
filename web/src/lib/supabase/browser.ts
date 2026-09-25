import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicEnv } from "./env";
import type { Database } from "./types";

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;
let client: BrowserClient | null | undefined;

/**
 * Supabase as the signed-in visitor, in the browser. One client per tab; the session lives in
 * cookies so route handlers see the same user. Null on the server or without Supabase env.
 */
export function supabaseBrowser(): BrowserClient | null {
  if (typeof window === "undefined") return null;
  if (client === undefined) {
    const env = supabasePublicEnv();
    client = env ? createBrowserClient<Database>(env.url, env.key) : null;
  }
  return client;
}
