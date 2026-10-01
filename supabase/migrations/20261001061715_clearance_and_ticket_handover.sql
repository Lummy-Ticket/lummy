-- Lummy Ticket: a person's review counts, and the buyer receives the ticket file.

-- 1. Staff clearing a held listing makes it buyable. Clearing used to set it active while the
--    flags still kept it out of the catalogue and out of claim_listing, so a listing a person had
--    checked and approved could never be bought. The flags stay as they were, so the record still
--    says what the checks found; cleared_at says a person looked and let it through. A duplicate
--    barcode is never cleared.
alter table public.listings add column cleared_at timestamptz;
grant select (cleared_at) on public.listings to anon, authenticated;

create or replace function public.claim_listing(p_listing_id text, p_quantity int)
returns public.listings
language plpgsql
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = p_listing_id for update;
  if not found or l.status <> 'active' then return null; end if;
  -- Same rule as the catalogue: a duplicate is never for sale, a flagged ticket only once staff cleared it.
  if l.barcode_duplicate then return null; end if;
  if l.cleared_at is null and (l.pdf_suspicious or l.forgery_score >= 60) then return null; end if;
  if p_quantity < 1 or p_quantity > l.quantity then return null; end if;
  -- A set that is not splittable goes whole or not at all.
  if not l.splittable and p_quantity <> l.quantity then return null; end if;

  update public.listings
     set quantity = case when p_quantity = l.quantity then l.quantity else l.quantity - p_quantity end,
         status = case when p_quantity = l.quantity then 'sold'::public.listing_status else l.status end
   where id = p_listing_id
  returning * into l;
  return l;
end;
$$;
revoke execute on function public.claim_listing(text, int) from public, anon, authenticated;
grant execute on function public.claim_listing(text, int) to service_role;

-- Same view, same columns, with the cleared rule.
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
    and (l.cleared_at is not null or (not l.pdf_suspicious and l.forgery_score < 60))
) p on true;

-- 2. The ticket file goes to the buyer. The order remembers whether its listing came with one,
--    and the buyer's first download is logged, like the other handover documents: it is what
--    answers a "never handed over" claim.
alter table public.orders add column ticket_file boolean not null default false;
alter table public.orders add column docs_ticket_at timestamptz;
