-- The AI research step for show requests (tasks 12.1, lib/events/research.ts): what it found, kept on
-- the request for staff, with when. Written by the server only (no browser role writes requests);
-- read with the rest of the request, by staff and by the seller who asked, under its existing policy.
alter table public.event_requests
  add column research jsonb,
  add column researched_at timestamptz;
comment on column public.event_requests.research is
  'What the AI research found: official page, categories and prices, the resale and name rules, each with its source. A hint for staff, who decide.';

-- One research costs a few cents of searches and model time, so each staff account gets a daily
-- allowance, counted like the other expensive steps (lib/rate.ts).
alter table public.rate_attempts drop constraint rate_attempts_kind_check;
alter table public.rate_attempts add constraint rate_attempts_kind_check
  check (kind in ('pdf_read', 'ai_fill', 'evidence_url', 'ai_research'));

-- Some promoters publish their own letter of authorisation (tasks 12.2, meeting 22 Oct 2026 §11).
-- Staff paste its official link; the ticket page offers it beside Lummy's letter. Set by staff
-- through api/events/[id] or when approving a request; readable by everyone, like the rest of the show.
alter table public.events
  add column letter_template_url text
    check (letter_template_url is null or (letter_template_url ~ '^https://[^[:space:]]+$' and length(letter_template_url) <= 500));
comment on column public.events.letter_template_url is
  'The organiser''s own letter of authorisation (an official https link), when they publish one.';
grant select (letter_template_url) on public.events to anon, authenticated;

create or replace view public.catalogue_events with (security_invoker = true) as
select
  e.id,
  e.title,
  e.category,
  case
    when e.rolling_hour is null then e.starts_at
    else (((now() at time zone 'Asia/Jakarta')::date + 1 + make_time(e.rolling_hour::integer, 0, 0::double precision)) at time zone 'Asia/Jakarta')
  end as starts_at,
  e.venue,
  e.city,
  e.image_url,
  e.featured,
  e.status,
  coalesce(p.from_price, 0::bigint) as from_price,
  coalesce(p.listing_count, 0) as listing_count,
  e.transfer_policy,
  e.country,
  e.currency,
  e.image_credit,
  e.cap_pct,
  e.cancelled_at,
  e.letter_template_url
from public.events e
left join lateral (
  select min(l.ask_price) as from_price, count(*)::integer as listing_count
  from public.listings l
  where l.event_id = e.id
    and l.status = 'active'::public.listing_status
    and not l.barcode_duplicate
    and (l.cleared_at is not null or not l.pdf_suspicious and l.forgery_score < 60)
) p on true;
