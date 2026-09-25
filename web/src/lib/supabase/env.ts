// The project URL and publishable key are public by design (RLS and grants guard the data),
// so the server and the browser read them the same way. Null means the app runs on sample data.
export function supabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}
