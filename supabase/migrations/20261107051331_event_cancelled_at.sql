-- When a show was cancelled, so a link to it can say so (UX review 5 Nov 2026, decision 5). A
-- cancelled show stays out of the catalogue, never listed or sold again, but its page says it was
-- cancelled, when, and that buyers are refunded, instead of "this show is not on Lummy". Set by
-- api/events/[id] when staff cancel it. Readable by everyone, like the rest of the show.
alter table public.events add column cancelled_at timestamptz;
comment on column public.events.cancelled_at is
  'When staff cancelled the show (status cancelled). Null when it is not cancelled.';
grant select (cancelled_at) on public.events to anon, authenticated;

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
  e.cancelled_at
from public.events e
left join lateral (
  select min(l.ask_price) as from_price, count(*)::integer as listing_count
  from public.listings l
  where l.event_id = e.id
    and l.status = 'active'::public.listing_status
    and not l.barcode_duplicate
    and (l.cleared_at is not null or not l.pdf_suspicious and l.forgery_score < 60)
) p on true;
