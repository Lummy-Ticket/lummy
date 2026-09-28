-- Lummy Ticket: buying a listing without selling the same seats twice (tahap 4b langkah 3).
-- Two buyers can press Pay on the same listing at the same moment; only one may get the seats.
-- The row is locked, checked and changed in one call, so the second buyer finds nothing to
-- claim. Server only: the route checks the buyer first, then calls this with the service role.

create function public.claim_listing(p_listing_id text, p_quantity int)
returns public.listings
language plpgsql
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = p_listing_id for update;
  if not found or l.status <> 'active' then return null; end if;
  -- Same rule as the catalogue: a flagged or duplicate ticket is never for sale.
  if l.barcode_duplicate or l.pdf_suspicious or l.forgery_score >= 60 then return null; end if;
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

-- Undo for a claim whose order could not be written (the chain or the insert failed), so the
-- seats go back on sale.
create function public.release_listing(p_listing_id text, p_quantity int)
returns void
language sql
set search_path = ''
as $$
  update public.listings
     set status = 'active',
         quantity = case when status = 'sold' then quantity else quantity + p_quantity end
   where id = p_listing_id and status in ('active', 'sold');
$$;

revoke execute on function public.claim_listing(text, int) from public, anon, authenticated;
revoke execute on function public.release_listing(text, int) from public, anon, authenticated;
grant execute on function public.claim_listing(text, int) to service_role;
grant execute on function public.release_listing(text, int) to service_role;
