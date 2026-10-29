-- Event requests come from sellers (the Sell page, api/events/requests), not from a seed (29 Oct 2026).
-- What a seller adds in their own words, where the show is, whether a ticket was checked with the
-- request, and what staff decided and when. Written by the server only, as before.
alter table public.event_requests
  add column note text not null default '' check (char_length(note) <= 500),
  add column country text not null default 'ID' check (country ~ '^[A-Z]{2}$'),
  add column currency text not null default 'IDR' check (currency in ('IDR', 'USDC')),
  add column ticket_checked boolean not null default false,
  add column review_note text check (char_length(review_note) <= 500),
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column event_id text references public.events (id) on delete set null;

create index event_requests_queue_idx on public.event_requests (status, created_at);
create index event_requests_event_id_idx on public.event_requests (event_id);
create index event_requests_reviewed_by_idx on public.event_requests (reviewed_by);
