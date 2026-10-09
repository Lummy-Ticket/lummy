-- Who can reach what, checked as each role: anon, a buyer, the seller, a stranger, an admin.
-- Run the whole file in one go (Supabase SQL editor, or MCP execute_sql). The report comes
-- back as an error on purpose: raising it is what rolls back everything the file created,
-- whichever client runs it. Every line of the report should start with "ok".
begin;
create temp table t_out (n serial, line text) on commit drop;
grant insert, select on t_out to anon, authenticated;
grant usage on sequence t_out_n_seq to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.id', '{"full_name":"Pembeli Uji"}'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.id', '{"full_name":"Penjual Uji","role":"admin"}'),
  ('33333333-3333-3333-3333-333333333333', 'u3@test.id', '{}'),
  ('44444444-4444-4444-4444-444444444444', 'ad@test.id', '{}');
update public.profiles set role = 'admin' where id = '44444444-4444-4444-4444-444444444444';
insert into public.listings (id, event_id, tier_id, seller_id, seller_name, ask_price, face_value, quantity, status)
  values ('ls-review', 'ev-sos', 't-sos-fest', '22222222-2222-2222-2222-222222222222', 'Penjual Uji', 800000, 750000, 1, 'review');
insert into public.orders (id, listing_id, event_id, buyer_id, seller_id, event_title, event_date, tier_name, seller_name, quantity, amount)
  values ('or-test', 'ls-1', 'ev-coldplay', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Coldplay', now() + interval '30 days', 'CAT 1', 'Penjual Uji', 1, 2800000);
insert into public.disputes (order_id, reason, note_en) values ('or-test', 'GATE_DENIED', 'test');
insert into public.ktp_assets (listing_id, owner_id, path, sha256, access_open_at, purge_after)
  values ('ls-review', '22222222-2222-2222-2222-222222222222', 'x/ktp.jpg', 'abc', now() + interval '1 day', now() + interval '3 days');
insert into public.listing_barcodes (listing_id, barcode_hmac, format, page) values ('ls-review', repeat('c', 64), 'QRCode', 1);

-- Runs p_sql as p_role (and as user p_uid, via the JWT claims auth.uid() reads) and
-- records whether the single value it returns, or DENIED, matches p_expect.
create function pg_temp.probe(p_role text, p_uid text, p_label text, p_sql text, p_expect text) returns void
language plpgsql as $$
declare got text;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
    execute p_sql into got;
    got := coalesce(got, 'null');
  exception when insufficient_privilege then got := 'DENIED';
  end;
  reset role;
  insert into t_out(line) values ((case when got = p_expect then 'ok    ' else 'FAIL  ' end) || p_label || ' -> ' || got || case when got = p_expect then '' else ' (expected ' || p_expect || ')' end);
end $$;

-- Real shows get added next to the 7 seed ones, so the seed is a floor, not a total.
select pg_temp.probe('anon', null, 'anon: reads the catalogue, at least the 7 seed events', 'select (count(*) >= 7)::text from public.catalogue_events', 'true');
select pg_temp.probe('anon', null, 'anon: WTF is tomorrow 14:00 WIB', $q$select (starts_at = ((((now() at time zone 'Asia/Jakarta')::date + 1) + time '14:00') at time zone 'Asia/Jakarta'))::text from public.catalogue_events where id = 'ev-wtf'$q$, 'true');
-- The catalogue's price and count follow the buyable rule for every show, whatever is listed,
-- and the seed's edited and duplicate listings (still on sale, still flagged) are left out.
select pg_temp.probe('anon', null, 'anon: catalogue counts only buyable listings, flagged ones left out', $q$
  with buyable as (
    select event_id, min(ask_price) as low, count(*) as n from public.listings
    where status = 'active' and not barcode_duplicate and (cleared_at is not null or (not pdf_suspicious and forgery_score < 60))
    group by event_id
  )
  select (
    not exists (
      select 1 from public.catalogue_events c left join buyable b on b.event_id = c.id
      where c.listing_count <> coalesce(b.n, 0) or c.from_price <> coalesce(b.low, 0)
    )
    and exists (
      select 1 from public.listings
      where status = 'active' and cleared_at is null and (barcode_duplicate or pdf_suspicious or forgery_score >= 60)
    )
  )::text$q$, 'true');
-- Counted by status, not in total: real listings come and go, so a fixed total breaks.
select pg_temp.probe('anon', null, 'anon: sees live listings only, not the review one', $q$select (count(*) filter (where status <> 'active' or id = 'ls-review'))::text from public.listings$q$, '0');
select pg_temp.probe('anon', null, 'anon: ticket_path column', 'select ticket_path from public.listings limit 1', 'DENIED');
select pg_temp.probe('anon', null, 'anon: orders', 'select count(*)::text from public.orders', 'DENIED');
select pg_temp.probe('anon', null, 'anon: profiles', 'select count(*)::text from public.profiles', 'DENIED');
select pg_temp.probe('anon', null, 'anon: insert event', $q$insert into public.events (id,title,category,starts_at,venue,city) values ('ev-x','x','Music',now(),'x','x') returning id$q$, 'DENIED');
select pg_temp.probe('anon', null, 'anon: ktp_assets', 'select count(*)::text from public.ktp_assets', 'DENIED');

select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: own order visible', 'select count(*)::text from public.orders', '1');
select pg_temp.probe('authenticated', '22222222-2222-2222-2222-222222222222', 'seller: order visible', 'select count(*)::text from public.orders', '1');
select pg_temp.probe('authenticated', '33333333-3333-3333-3333-333333333333', 'stranger: no orders', 'select count(*)::text from public.orders', '0');
select pg_temp.probe('authenticated', '44444444-4444-4444-4444-444444444444', 'admin: order visible', $q$select count(*)::text from public.orders where id = 'or-test'$q$, '1');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: dispute visible', 'select count(*)::text from public.disputes', '1');
select pg_temp.probe('authenticated', '33333333-3333-3333-3333-333333333333', 'stranger: no disputes', 'select count(*)::text from public.disputes', '0');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: cannot see seller review listing', $q$select count(*)::text from public.listings where id = 'ls-review'$q$, '0');
select pg_temp.probe('authenticated', '22222222-2222-2222-2222-222222222222', 'seller: sees own review listing', $q$select count(*)::text from public.listings where id = 'ls-review'$q$, '1');
select pg_temp.probe('authenticated', '44444444-4444-4444-4444-444444444444', 'admin: sees review listing', $q$select count(*)::text from public.listings where id = 'ls-review'$q$, '1');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: sees only own profile', 'select count(*)::text from public.profiles', '1');
select pg_temp.probe('authenticated', '44444444-4444-4444-4444-444444444444', 'admin: sees all 4 test profiles', $q$select count(*)::text from public.profiles where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444')$q$, '4');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: make self admin', $q$update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111' returning id::text$q$, 'DENIED');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: mark self KYC verified', $q$update public.profiles set kyc = 'verified' returning id::text$q$, 'DENIED');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: edit own phone', $q$with u as (update public.profiles set phone = '0812' returning 1) select count(*)::text from u$q$, '1');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: edit other phone', $q$with u as (update public.profiles set phone = '0812' where id = '22222222-2222-2222-2222-222222222222' returning 1) select count(*)::text from u$q$, '0');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: insert order', $q$insert into public.orders (buyer_id,event_title,event_date,tier_name,seller_name,quantity,amount) values ('11111111-1111-1111-1111-111111111111','x',now(),'x','x',1,1) returning id$q$, 'DENIED');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: set own escrow to Released', $q$update public.orders set escrow_status = 'Released' returning id$q$, 'DENIED');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: file dispute directly', $q$insert into public.disputes (order_id, reason) values ('or-test','NO_SHOW') returning order_id$q$, 'DENIED');
select pg_temp.probe('authenticated', '22222222-2222-2222-2222-222222222222', 'seller: read ktp_assets', 'select count(*)::text from public.ktp_assets', 'DENIED');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: add own alert', $q$insert into public.alert_subscriptions (event_id) values ('ev-sos') returning event_id$q$, 'ev-sos');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: add alert for someone else', $q$insert into public.alert_subscriptions (user_id, event_id) values ('22222222-2222-2222-2222-222222222222','ev-sos') returning event_id$q$, 'DENIED');
select pg_temp.probe('authenticated', '22222222-2222-2222-2222-222222222222', 'seller: sees no one else alerts', 'select count(*)::text from public.alert_subscriptions', '0');
-- Seats are claimed and handed back by the server only, after it has checked the buyer.
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: claim seats directly', $q$select (public.claim_listing('ls-2', 1)).id$q$, 'DENIED');
select pg_temp.probe('anon', null, 'anon: release seats directly', $q$select public.release_listing('ls-2', 1)::text$q$, 'DENIED');

-- Barcodes held by listings are server only, whoever asks: the listing's own seller and staff too.
select pg_temp.probe('anon', null, 'anon: listing_barcodes', 'select count(*)::text from public.listing_barcodes', 'DENIED');
select pg_temp.probe('authenticated', '22222222-2222-2222-2222-222222222222', 'seller: read own listing_barcodes', 'select count(*)::text from public.listing_barcodes', 'DENIED');
select pg_temp.probe('authenticated', '44444444-4444-4444-4444-444444444444', 'admin: read listing_barcodes', 'select count(*)::text from public.listing_barcodes', 'DENIED');
select pg_temp.probe('authenticated', '22222222-2222-2222-2222-222222222222', 'seller: hold a barcode directly', $q$insert into public.listing_barcodes (listing_id, barcode_hmac, format, page) values ('ls-review', repeat('d', 64), 'QRCode', 1) returning listing_id$q$, 'DENIED');
-- What the ticket check found is read with the listing; the barcode keys never are.
select pg_temp.probe('authenticated', '22222222-2222-2222-2222-222222222222', 'seller: read own listing checks', $q$select count(*)::text from (select checks from public.listings where id = 'ls-review') x$q$, '1');
select pg_temp.probe('anon', null, 'anon: read barcode_hmac', 'select count(barcode_hmac)::text from public.listings', 'DENIED');

-- QRIS holds and the public ledger's progress are written by the server only (docs/09 §6, §7).
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: read payments directly', 'select count(*)::text from public.payments', 'DENIED');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: mark own ledger record final', $q$update public.orders set ledger_status = 'Released' returning id$q$, 'DENIED');
select pg_temp.probe('authenticated', '11111111-1111-1111-1111-111111111111', 'buyer: reads own ledger columns', $q$select count(*)::text from (select ledger_id, ledger_status from public.orders) x$q$, '1');

insert into t_out(line)
  select (case when role = 'member' then 'ok    ' else 'FAIL  ' end) || 'signup metadata cannot set role -> ' || role::text
  from public.profiles where id = '22222222-2222-2222-2222-222222222222';

do $$ begin raise exception E'RLS CHECK\n%', (select string_agg(line, E'\n' order by n) from t_out); end $$;
