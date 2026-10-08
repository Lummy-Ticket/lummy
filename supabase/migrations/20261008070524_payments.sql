-- Lummy Ticket: paying with QRIS through Xendit (docs/09 §6), in test mode first.
-- Pay holds the seats and opens a QRIS payment that expires with the hold; the order is written
-- only once Xendit says the money arrived. A hold nobody paid gives its seats back. Server only:
-- the routes check the buyer first, then work through the service role.

create table public.payments (
  id text primary key default ('pay-' || substr(md5(gen_random_uuid()::text), 1, 12)),
  buyer_id uuid not null references public.profiles (id),
  listing_id text not null references public.listings (id),
  quantity smallint not null check (quantity between 1 and 8),
  amount bigint not null check (amount > 0), -- ticket subtotal: what the escrow holds
  fee bigint not null check (fee >= 0),
  materai bigint not null check (materai >= 0),
  total bigint not null check (total = amount + fee + materai),
  provider text not null default 'xendit' check (provider = 'xendit'),
  channel text not null default 'QRIS' check (channel = 'QRIS'),
  test_mode boolean not null,
  -- Xendit's payment_request_id, set once the request exists, and the code the buyer scans.
  provider_ref text unique,
  qr_string text,
  -- pending: seats held, waiting for the money. paid: money in, order written. unfulfilled: the
  -- money came after the seats had gone back, so it waits for a refund. The rest closed unpaid.
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'unfulfilled', 'expired', 'canceled', 'failed')),
  expires_at timestamptz not null,
  checked_at timestamptz,
  paid_at timestamptz,
  provider_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_buyer_id_idx on public.payments (buyer_id);
create index payments_listing_id_idx on public.payments (listing_id);
create index payments_pending_idx on public.payments (expires_at) where status = 'pending';
alter table public.payments enable row level security;

-- One payment makes at most one order: a webhook and a page asking at the same moment cannot
-- write two.
alter table public.orders add column payment_id text unique references public.payments (id);

-- Closes one hold that never got its money (the buyer cancelled, or Xendit expired or refused
-- it) and gives the seats back. Once: a second call finds it no longer pending and does nothing.
create function public.close_payment(p_id text, p_status text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  if p_status not in ('expired', 'canceled', 'failed') then
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

-- Holds nobody paid give their seats back once the QRIS has expired at Xendit too (a few minutes
-- of grace), so a late payment cannot land on seats already sold to someone else. Called when the
-- catalogue is rebuilt, by the checkout routes and by the daily cron, so nobody has to watch the
-- clock. Returns the ids it closed.
create function public.expire_payments(p_grace_seconds int default 300)
returns setof text
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    update public.payments
       set status = 'expired', updated_at = now()
     where status = 'pending' and expires_at < now() - make_interval(secs => p_grace_seconds)
    returning id, listing_id, quantity
  loop
    perform public.release_listing(r.listing_id, r.quantity);
    return next r.id;
  end loop;
end;
$$;

-- Xendit says the money arrived. A pending hold becomes paid. A hold that had already closed
-- takes its seats again if they are still free; if not, the money waits for a refund
-- (unfulfilled). The row is locked, so a webhook and a page asking at once change it once.
create function public.mark_payment_paid(p_id text, p_provider_payment_id text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  p public.payments;
  l public.listings;
begin
  select * into p from public.payments where id = p_id for update;
  if not found then
    return null;
  end if;
  if p.status in ('paid', 'unfulfilled') then
    return p.status;
  end if;
  if p.status <> 'pending' then
    l := public.claim_listing(p.listing_id, p.quantity);
    if l.id is null then
      update public.payments
         set status = 'unfulfilled', paid_at = now(), provider_payment_id = p_provider_payment_id, updated_at = now()
       where id = p_id;
      return 'unfulfilled';
    end if;
  end if;
  update public.payments
     set status = 'paid', paid_at = now(), provider_payment_id = p_provider_payment_id, updated_at = now()
   where id = p_id;
  return 'paid';
end;
$$;

revoke execute on function public.close_payment(text, text) from public, anon, authenticated;
revoke execute on function public.expire_payments(int) from public, anon, authenticated;
revoke execute on function public.mark_payment_paid(text, text) from public, anon, authenticated;
grant execute on function public.close_payment(text, text) to service_role;
grant execute on function public.expire_payments(int) to service_role;
grant execute on function public.mark_payment_paid(text, text) to service_role;
