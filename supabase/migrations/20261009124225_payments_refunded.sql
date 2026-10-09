-- Refund manual untuk uang yang masuk tanpa pesanan (status unfulfilled, docs/09 §6). Sampai Money Out
-- tersambung, staf mengembalikan uangnya dari dashboard Xendit, lalu mencatatnya di halaman admin (tab
-- Pembayaran): siapa, kapan, dan catatan transfernya.
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'paid', 'unfulfilled', 'refunded', 'expired', 'canceled', 'failed'));

alter table public.payments
  add column refunded_at timestamptz,
  add column refunded_by uuid references public.profiles (id) on delete set null,
  add column refund_note text check (char_length(refund_note) <= 500);

create index payments_unfulfilled_idx on public.payments (paid_at) where status = 'unfulfilled';

-- Uang yang sudah dikembalikan tidak boleh jadi "dibayar" lagi karena webhook yang datang telat:
-- 'refunded' final, sama seperti 'paid' dan 'unfulfilled'.
create or replace function public.mark_payment_paid(p_id text, p_provider_payment_id text)
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
  if p.status in ('paid', 'unfulfilled', 'refunded') then
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

revoke execute on function public.mark_payment_paid(text, text) from public, anon, authenticated;
grant execute on function public.mark_payment_paid(text, text) to service_role;
