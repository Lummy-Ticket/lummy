// Supabase as the signed-in visitor, from their session cookies. For route handlers, which may
// write refreshed cookies back. Server Components cannot write cookies; once pages start reading
// the session on the server, add the proxy from the Supabase SSR guide to refresh tokens.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicEnv } from "./env";
import type { Database } from "./types";

if (typeof window !== "undefined") throw new Error("lib/supabase/server hanya boleh dipakai di server");

export async function supabaseServer() {
  const env = supabasePublicEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies.
        }
      },
    },
  });
}
