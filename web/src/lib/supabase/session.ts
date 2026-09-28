// Who is calling a route: the session cookie, checked with Supabase rather than trusted as sent,
// and the staff flag from the database, the same source the pages use.
import { supabaseServer } from "./server";

if (typeof window !== "undefined") throw new Error("lib/supabase/session hanya boleh dipakai di server");

export type SessionUser = { id: string; email: string; name: string; staff: boolean };

export async function currentUser(): Promise<SessionUser | null> {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await sb.from("profiles").select("full_name, role").eq("id", data.user.id).maybeSingle();
  const email = data.user.email ?? "";
  return { id: data.user.id, email, name: profile?.full_name || email.split("@")[0] || "Lummy", staff: profile?.role === "admin" };
}
