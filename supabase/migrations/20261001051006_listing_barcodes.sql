-- Lummy Ticket: barcodes read from real ticket PDFs (docs/09 §5.2).
-- One PDF often carries a whole order, so each barcode gets its own row, and each is held by at
-- most one live listing: the database's guard against selling a ticket twice, next to the
-- contract's commitUsed (decision A). Rows are server-only, like the HMAC column on listings.

create table public.listing_barcodes (
  listing_id text not null references public.listings (id) on delete cascade,
  barcode_hmac text not null check (barcode_hmac ~ '^[0-9a-f]{64}$'),
  format text not null,
  page smallint not null check (page > 0),
  -- False once the listing is cancelled or rejected: the ticket may then be listed again.
  -- A sold listing keeps its barcodes for good, whatever happens to the order.
  held boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (listing_id, barcode_hmac)
);

create unique index listing_barcodes_held_key on public.listing_barcodes (barcode_hmac) where held;

alter table public.listing_barcodes enable row level security; -- no policies: server only
revoke all on public.listing_barcodes from anon, authenticated;
grant all on public.listing_barcodes to service_role;

-- Holding follows the listing's status, whatever changes it (the seller withdraws, staff
-- reject, a demo reset). Reopening a listing whose barcode another listing took meanwhile fails
-- on the unique index, which is the point.
create function private.listing_barcodes_follow_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.listing_barcodes
     set held = new.status not in ('cancelled', 'rejected')
   where listing_id = new.id;
  return new;
end;
$$;
revoke execute on function private.listing_barcodes_follow_status() from public, anon, authenticated;

create trigger listings_barcodes_follow_status
  after update of status on public.listings
  for each row when (old.status is distinct from new.status)
  execute function private.listing_barcodes_follow_status();

-- What the checks found, safe for the seller and staff to read: reason codes, how many barcodes
-- and pages were read, and the tool that made the file. Never a barcode, never its HMAC.
alter table public.listings add column checks jsonb;
grant select (checks) on public.listings to anon, authenticated;
