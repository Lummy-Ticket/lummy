-- How a named ticket can change hands at a show's gate, recorded per event from the organiser's
-- terms. Null means nobody has confirmed it yet, and the app says so instead of guessing.
--   open       not tied to a name
--   letter     named; a letter of authorisation with the holder's ID is accepted
--   id_match   named; the ID must match the name, so resale stays open but is flagged as risky
--   no_resale  the organiser forbids resale, so listings stay closed
create type public.transfer_policy as enum ('open', 'letter', 'id_match', 'no_resale');
alter table public.events add column transfer_policy public.transfer_policy;

-- Same view, with the policy appended so the existing columns keep their places.
create or replace view public.catalogue_events with (security_invoker = true) as
select
  e.id,
  e.title,
  e.category,
  case
    when e.rolling_hour is null then e.starts_at
    else (((now() at time zone 'Asia/Jakarta')::date + 1) + make_time(e.rolling_hour, 0, 0)) at time zone 'Asia/Jakarta'
  end as starts_at,
  e.venue,
  e.city,
  e.image_url,
  e.featured,
  e.status,
  coalesce(p.from_price, 0) as from_price,
  coalesce(p.listing_count, 0) as listing_count,
  e.transfer_policy
from public.events e
left join lateral (
  select min(l.ask_price) as from_price, count(*)::int as listing_count
  from public.listings l
  where l.event_id = e.id
    and l.status = 'active'
    and not l.barcode_duplicate
    and not l.pdf_suspicious
    and l.forgery_score < 60
) p on true;

-- Turned away over the name on the ticket rather than the ticket itself: the seller did nothing
-- wrong, so the buyer is refunded without a penalty.
alter type public.dispute_reason add value if not exists 'NAME_MISMATCH' after 'BARCODE_USED';

-- The demo catalogue's rules.
update public.events set transfer_policy = 'letter' where id in ('ev-coldplay', 'ev-tulus', 'ev-sos');
update public.events set transfer_policy = 'id_match' where id in ('ev-newjeans', 'ev-timnas');
update public.events set transfer_policy = 'open' where id in ('ev-wtf', 'ev-pandji');
