-- Real shows carry freely licensed photos (CC BY, CC BY-SA), and those licences ask for credit
-- next to the photo. Readable by everyone, like the rest of the catalogue.
alter table public.events
  add column image_credit text check (char_length(image_credit) <= 300);
comment on column public.events.image_credit is
  'Credit for image_url when it is a licensed photo: author, licence and source, shown under the photo.';
grant select (image_credit) on public.events to anon, authenticated;

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
  e.image_credit
from public.events e
left join lateral (
  select min(l.ask_price) as from_price, count(*)::integer as listing_count
  from public.listings l
  where l.event_id = e.id
    and l.status = 'active'::public.listing_status
    and not l.barcode_duplicate
    and (l.cleared_at is not null or not l.pdf_suspicious and l.forgery_score < 60)
) p on true;
