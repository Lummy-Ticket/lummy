-- Two findings of the production audit of 2 Nov 2026 that must be closed before real payouts.

-- M7. Payout details changed with a session alone: a stolen session could have sent a seller's
-- money elsewhere. They now change only through api/profile/payout, which asks for a sign-in made in
-- the last minutes and emails the account. The browser roles keep their other profile columns.
revoke update (payout_bank, payout_number) on public.profiles from authenticated;

-- M8. Staff opening a seller's ticket PDF or a claim photo left no record. One row per opening,
-- written by the route before it hands out the file (fail closed), so it can be said afterwards who
-- saw which file. Server only: RLS on, no policy, no grant to the browser roles. The staff account
-- and what was opened are personal data: the privacy page names the log, and the daily cron deletes
-- rows after a year.
create table public.file_access (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  staff_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('ticket_pdf', 'claim_photo')),
  -- The listing or order the file belongs to, and for a claim photo whose side it is.
  ref text not null check (char_length(ref) <= 120)
);
create index file_access_at_idx on public.file_access (at);
create index file_access_staff_idx on public.file_access (staff_id);
alter table public.file_access enable row level security;
revoke all on public.file_access from public, anon, authenticated;
grant select, insert, delete on public.file_access to service_role;
comment on table public.file_access is
  'Staff openings of personal files (seller ticket PDFs, claim photos), written before the file is handed out (audit M8). Kept a year.';
