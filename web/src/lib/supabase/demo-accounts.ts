// The demo accounts on the server: created on first use, with the name and staff flag set from
// DEMO_ACCOUNTS every time, so the database cannot drift from the list.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/mock/types";
import { DEMO_ACCOUNTS } from "./demo";
import type { Database } from "./types";

if (typeof window !== "undefined") throw new Error("lib/supabase/demo-accounts hanya boleh dipakai di server");

type Admin = SupabaseClient<Database>;

async function findUserId(admin: Admin, email: string): Promise<string> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`akun demo ${email} tidak ditemukan`);
}

/** The account's id, creating it on first use. */
export async function ensureDemoAccount(admin: Admin, persona: Role): Promise<string> {
  const account = DEMO_ACCOUNTS[persona];
  const created = await admin.auth.admin.createUser({
    email: account.email,
    email_confirm: true,
    user_metadata: { full_name: account.name },
  });
  if (created.error && created.error.code !== "email_exists") throw new Error(created.error.message);
  const id = created.data.user?.id ?? (await findUserId(admin, account.email));
  const profile = await admin
    .from("profiles")
    .update({ full_name: account.name, role: account.staff ? "admin" : "member" })
    .eq("id", id);
  if (profile.error) throw new Error(profile.error.message);
  return id;
}
