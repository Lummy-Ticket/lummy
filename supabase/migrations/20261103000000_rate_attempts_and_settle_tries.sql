-- Per-account attempt counts for the routes that read untrusted files, call the paid AI step or hand
-- out claim-photo upload links (production audit 2 Nov 2026, B3), and when the daily payout sweep
-- last tried an order, so a few that keep failing cannot hold the rest back (M4).

-- One row per attempt, kept only for its window (at most a day). Server only: RLS on and no policy,
-- and the browser roles get no grant, so nobody reads another account's attempts or spends its
-- allowance. Deleted with the account.
create table public.rate_attempts (
  id bigint generated always as identity primary key,
  account_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('pdf_read', 'ai_fill', 'evidence_url')),
  at timestamptz not null default now()
);
create index rate_attempts_account_kind_at_idx on public.rate_attempts (account_id, kind, at);
create index rate_attempts_at_idx on public.rate_attempts (at);
alter table public.rate_attempts enable row level security;
revoke all on public.rate_attempts from public, anon, authenticated;
grant select, insert, delete on public.rate_attempts to service_role;

-- Takes one attempt for the account if it has fewer than p_limit in the last p_window_seconds, and
-- says whether it did. One caller at a time per account and kind (a lock held to the end of the
-- transaction), so two requests at the same moment cannot both slip under the limit. That account's
-- expired attempts of that kind go on the way; the daily cron clears the rest.
create function public.take_attempt(p_account uuid, p_kind text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(secs => p_window_seconds);
  used int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text || ':' || p_kind, 0));
  delete from public.rate_attempts where account_id = p_account and kind = p_kind and at < since;
  select count(*) into used from public.rate_attempts where account_id = p_account and kind = p_kind;
  if used >= p_limit then
    return false;
  end if;
  insert into public.rate_attempts (account_id, kind) values (p_account, p_kind);
  return true;
end;
$$;
revoke execute on function public.take_attempt(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.take_attempt(uuid, text, int, int) to service_role;

-- The sweep (lib/orders/settle.ts) marks each order it tries and takes the least recently tried
-- first; null, never tried, comes first.
alter table public.orders add column settle_tried_at timestamptz;
