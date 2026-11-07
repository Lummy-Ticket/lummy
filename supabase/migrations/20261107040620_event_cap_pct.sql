-- Some organisers allow resale only up to the price they sold at. N.Flying's Jakarta show
-- (10 Jan 2027, Karalas Live): "Reselling above the official price is prohibited." The 50 to 150%
-- band on listings stays for every show; a show can lower its own ceiling, never raise it.
alter table public.events
  add column cap_pct smallint not null default 150 check (cap_pct between 100 and 150);
comment on column public.events.cap_pct is
  'Highest asking price for this show, as a percentage of face value: 150 unless the organiser''s terms allow less.';
grant select (cap_pct) on public.events to anon, authenticated;

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
  e.cap_pct
from public.events e
left join lateral (
  select min(l.ask_price) as from_price, count(*)::integer as listing_count
  from public.listings l
  where l.event_id = e.id
    and l.status = 'active'::public.listing_status
    and not l.barcode_duplicate
    and (l.cleared_at is not null or not l.pdf_suspicious and l.forgery_score < 60)
) p on true;

-- The listing route checks the show's ceiling too (lib/listings/rules.ts); this keeps a listing from
-- going above it whatever writes the row. Only a new price or a moved listing is checked, so lowering
-- a show's ceiling later leaves listings already on sale as they are.
create function private.listing_within_event_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cap smallint;
begin
  select e.cap_pct into cap from public.events e where e.id = new.event_id;
  if cap is not null and new.ask_price * 100 > new.face_value * cap then
    raise exception 'asking price % is above % percent of face value % for this show', new.ask_price, cap, new.face_value
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.listing_within_event_cap() from public, anon, authenticated;

create trigger listings_within_event_cap
  before insert or update of ask_price, face_value, event_id on public.listings
  for each row execute function private.listing_within_event_cap();
