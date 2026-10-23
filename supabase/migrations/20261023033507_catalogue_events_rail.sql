-- The catalogue tells the checkout which rail a show takes: its country and currency, appended to
-- the view so the existing columns keep their places. The view stays security_invoker, so the two
-- new columns are granted to the public roles like the rest of the catalogue.
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
  e.currency
from public.events e
left join lateral (
  select min(l.ask_price) as from_price, count(*)::integer as listing_count
  from public.listings l
  where l.event_id = e.id
    and l.status = 'active'::public.listing_status
    and not l.barcode_duplicate
    and (l.cleared_at is not null or not l.pdf_suspicious and l.forgery_score < 60)
) p on true;

grant select (country, currency) on public.events to anon, authenticated;
