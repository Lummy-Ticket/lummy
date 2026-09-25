// The secret key bypasses RLS. Server only, and only for work the server has already
// authorised; never behind a NEXT_PUBLIC_ name.
import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "./env";
import type { Database } from "./types";

if (typeof window !== "undefined") throw new Error("lib/supabase/admin hanya boleh dipakai di server");

export function supabaseAdmin() {
  const env = supabasePublicEnv();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!env || !secret) return null;
  return createClient<Database>(env.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
