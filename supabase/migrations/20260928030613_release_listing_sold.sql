-- A sold listing keeps the quantity of its last claim, which says nothing about the seats being
-- handed back. Releasing into a sold listing therefore sets the quantity to what is returned:
-- buyer A claims 3 of 4, buyer B takes the last one (sold), A's order fails, and 3 seats go
-- back on sale, not 1.
create or replace function public.release_listing(p_listing_id text, p_quantity int)
returns void
language sql
set search_path = ''
as $$
  update public.listings
     set status = 'active',
         quantity = case when status = 'sold' then p_quantity else quantity + p_quantity end
   where id = p_listing_id and status in ('active', 'sold');
$$;

revoke execute on function public.release_listing(text, int) from public, anon, authenticated;
grant execute on function public.release_listing(text, int) to service_role;
