-- QRIS review fixes (docs/09 §6), 9 Oct 2026.

-- One open hold per buyer is a rule of the database, not only of the route: two tabs pressing Pay
-- at the same moment cannot both hold seats.
create unique index payments_one_open_per_buyer on public.payments (buyer_id) where status = 'pending';

-- close_payment also closes a hold whose money cannot be honoured, for instance when Xendit reports
-- a payment that does not match it: the seats go back and the money waits for a refund
-- (unfulfilled), instead of the hold sitting open until it expires.
create or replace function public.close_payment(p_id text, p_status text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  if p_status not in ('expired', 'canceled', 'failed', 'unfulfilled') then
    raise exception 'close_payment: % is not a closing status', p_status;
  end if;
  update public.payments
     set status = p_status, updated_at = now()
   where id = p_id and status = 'pending'
  returning listing_id, quantity into r;
  if not found then
    return false;
  end if;
  perform public.release_listing(r.listing_id, r.quantity);
  return true;
end;
$$;

revoke execute on function public.close_payment(text, text) from public, anon, authenticated;
grant execute on function public.close_payment(text, text) to service_role;
