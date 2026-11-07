// Staff opening a seller's ticket PDF or a buyer's or seller's claim photo is written down before the
// file is handed out (production audit 2 Nov 2026, M8), so it can be said afterwards who saw which
// file. The parties opening their own files are not logged: they are theirs. Server only; the table
// has no browser access (migration payout_by_server_and_file_access), and rows go after a year.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

if (typeof window !== "undefined") throw new Error("lib/files/access-log is server-only");

export type FileKind = "ticket_pdf" | "claim_photo";

/** Days a row is kept; the daily cron deletes older ones. */
export const FILE_ACCESS_DAYS = 365;

/** What a route answers when the opening could not be written: the file is not handed out. */
export const NOT_RECORDED = "akses file gagal dicatat, coba lagi";

/** Records one staff opening; false when it could not be written, and then the route refuses. */
export async function recordStaffOpening(admin: SupabaseClient<Database>, staffId: string, kind: FileKind, ref: string): Promise<boolean> {
  const { error } = await admin.from("file_access").insert({ staff_id: staffId, kind, ref: ref.slice(0, 120) });
  if (error) console.error("[file access] could not record:", kind, ref, error.message);
  return !error;
}
