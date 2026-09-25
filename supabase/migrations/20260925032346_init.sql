-- Lummy Ticket: schema (docs/09 §3).
-- Browsers only ever read, under RLS. Every write that moves money, escrow state or
-- evidence goes through a server route with the service role, which checks the caller
-- first. That is what keeps "the platform's own record" trustworthy in a dispute.

-- This project still has the old Supabase default that exposes every new table and
-- function in public to anon and authenticated. Turn it off, so exposure is always an
-- explicit grant in 0002_rls.sql.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Helpers used by policies and triggers. Not an exposed schema, so nothing here is
-- reachable through the Data API.
create schema if not exists private;
revoke all on schema private from public;

create type public.user_role as enum ('member', 'admin');
create type public.kyc_status as enum ('unverified', 'verified');
create type public.event_status as enum ('scheduled', 'postponed', 'cancelled');
create type public.listing_status as enum ('review', 'active', 'sold', 'rejected', 'cancelled');
-- Same order as the contract's enum minus None (reconcile #1 in docs/09).
create type public.escrow_status as enum ('Listed', 'Funded', 'DisputeWindow', 'Released', 'Refunded', 'Cancelled');
create type public.dispute_reason as enum ('GATE_DENIED', 'BARCODE_USED', 'NOT_DELIVERED', 'NOT_AS_LISTED', 'EVENT_CANCELLED', 'NO_SHOW');
create type public.remedy as enum ('REPLACEMENT', 'REFUND_PARTIAL', 'REFUND_FULL', 'RELEASE_SELLER');
create type public.seed_status as enum ('pending', 'approved', 'rejected');
create type public.alert_channel as enum ('email', 'whatsapp', 'telegram');

-- One row per auth user. Identity itself stays with the PSrE: no NIK, no KTP image here.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  role public.user_role not null default 'member',
  kyc public.kyc_status not null default 'unverified',
  phone text check (char_length(phone) <= 32),
  payout_bank text check (payout_bank in ('BCA', 'Mandiri', 'BNI', 'BRI')),
  payout_number text check (payout_number ~ '^[0-9]{6,20}$'),
  alert_channel public.alert_channel not null default 'email',
  created_at timestamptz not null default now()
);

create table public.events (
  id text primary key check (id ~ '^[a-z0-9-]{3,64}$'),
  title text not null,
  category text not null check (category in ('Music', 'Sports', 'Theater', 'Arts', 'Technology', 'Education', 'Food', 'Movies')),
  starts_at timestamptz not null,
  -- Demo only: when set, the show is always tomorrow at this hour, Jakarta time, so the
  -- last-minute listing rule can be shown on any day. catalogue_events resolves it.
  rolling_hour smallint check (rolling_hour between 0 and 23),
  venue text not null,
  city text not null,
  image_url text,
  featured boolean not null default false,
  status public.event_status not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table public.tiers (
  id text primary key check (id ~ '^[a-z0-9-]{3,64}$'),
  event_id text not null references public.events (id) on delete cascade,
  name text not null,
  face_value bigint not null check (face_value > 0), -- rupiah per ticket, the price-cap anchor
  sort smallint not null default 0
);
create index tiers_event_id_idx on public.tiers (event_id);

create table public.listings (
  id text primary key default ('ls-' || substr(md5(gen_random_uuid()::text), 1, 12)),
  event_id text not null references public.events (id),
  tier_id text not null references public.tiers (id),
  seller_id uuid references public.profiles (id) on delete set null,
  seller_name text not null,
  ask_price bigint not null, -- rupiah per ticket
  face_value bigint not null check (face_value > 0),
  quantity smallint not null check (quantity between 1 and 8),
  splittable boolean not null default false,
  gate_ktp boolean not null default false,
  status public.listing_status not null default 'review',
  late_listing boolean not null default false,
  autofilled boolean not null default false,
  forgery_score smallint not null default 0 check (forgery_score between 0 and 100),
  pdf_suspicious boolean not null default false,
  barcode_duplicate boolean not null default false,
  -- Server-only columns, never granted to anon or authenticated.
  ticket_path text,
  ticket_sha256 text,
  barcode_hmac text,
  extraction jsonb,
  forensics jsonb,
  views integer not null default 0 check (views >= 0),
  created_at timestamptz not null default now(),
  -- FR6: between 50% and 150% of face value, enforced here as well as in the app.
  constraint listings_price_band check (ask_price * 100 between face_value * 50 and face_value * 150)
);
create index listings_event_id_idx on public.listings (event_id);
create index listings_tier_id_idx on public.listings (tier_id);
create index listings_seller_id_idx on public.listings (seller_id);
-- One barcode, one live sale. A cancelled or rejected listing frees it, as the contract does.
create unique index listings_barcode_hmac_key on public.listings (barcode_hmac)
  where barcode_hmac is not null and status not in ('cancelled', 'rejected');

-- An order is the app side of one escrow. The contract is the source of truth for chain
-- orders; these columns mirror it after each transaction (task 3.4).
create table public.orders (
  id text primary key default ('or-' || substr(md5(gen_random_uuid()::text), 1, 12)),
  listing_id text references public.listings (id),
  event_id text references public.events (id),
  buyer_id uuid not null references public.profiles (id),
  seller_id uuid references public.profiles (id),
  -- Snapshot at purchase, so an order keeps what was bought even if the listing changes.
  event_title text not null,
  event_image text,
  event_date timestamptz not null,
  tier_name text not null,
  seller_name text not null,
  quantity smallint not null check (quantity between 1 and 8),
  amount bigint not null check (amount > 0), -- ticket subtotal in rupiah: what the escrow holds
  fee bigint not null default 0 check (fee >= 0), -- decision E: paid by the buyer, outside the escrow
  materai bigint not null default 0 check (materai >= 0),
  gate_ktp boolean not null default false,
  late_listing boolean not null default false,
  escrow_status public.escrow_status not null default 'Funded',
  disputed boolean not null default false,
  event_status public.event_status not null default 'scheduled',
  event_ended_at timestamptz,
  auto_released boolean not null default false,
  auto_refund_reason text check (auto_refund_reason in ('EVENT_CANCELLED', 'EVENT_POSTPONED')),
  -- The platform's own record of the handover, which settles "never handed over" claims.
  docs_letter_at timestamptz,
  docs_seller_id_at timestamptz,
  -- Chain mirror. Null for sample orders, which never show an address or a hash.
  chain_id integer,
  contract_address text check (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  onchain_listing_id text check (onchain_listing_id ~ '^0x[0-9a-f]{64}$'),
  onchain_price text,
  event_ends_at timestamptz,
  dispute_deadline timestamptz,
  tx_create text,
  tx_fund text,
  tx_handover text,
  tx_settle text,
  tx_withdrawals text[] not null default '{}',
  last_synced_block bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_buyer_id_idx on public.orders (buyer_id);
create index orders_seller_id_idx on public.orders (seller_id);
create index orders_listing_id_idx on public.orders (listing_id);
create index orders_event_id_idx on public.orders (event_id);
create unique index orders_onchain_listing_id_key on public.orders (onchain_listing_id) where onchain_listing_id is not null;

-- A claim is a thread: the filing, replies from both sides, then the verdict.
create table public.disputes (
  order_id text primary key references public.orders (id) on delete cascade,
  reason public.dispute_reason not null,
  -- Seeded demo notes carry both languages; a typed note is stored as written in both.
  note_en text not null default '',
  note_id text not null default '',
  evidence jsonb, -- capture metadata; the file sits in the private evidence bucket
  opened_at timestamptz not null default now(),
  verdict_remedy public.remedy,
  verdict_to_seller boolean,
  refund_amount bigint check (refund_amount >= 0),
  seller_penalty bigint check (seller_penalty >= 0),
  rationale_en text,
  rationale_id text,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  constraint disputes_verdict_whole check (
    (decided_at is null and verdict_remedy is null and verdict_to_seller is null)
    or (decided_at is not null and verdict_remedy is not null and verdict_to_seller is not null)
  )
);
create index disputes_decided_by_idx on public.disputes (decided_by);

create table public.dispute_replies (
  id bigint generated always as identity primary key,
  order_id text not null references public.disputes (order_id) on delete cascade,
  author_id uuid references public.profiles (id),
  from_seller boolean not null,
  note_en text not null default '',
  note_id text not null default '',
  evidence jsonb,
  created_at timestamptz not null default now()
);
create index dispute_replies_order_id_idx on public.dispute_replies (order_id, created_at);
create index dispute_replies_author_id_idx on public.dispute_replies (author_id);

-- New events wait for an admin. The seller's PDF only shows their own tier, so the full
-- tier table is completed from the organiser's official source (docs/02).
create table public.event_requests (
  id text primary key default ('req-' || substr(md5(gen_random_uuid()::text), 1, 12)),
  submitted_by uuid references public.profiles (id) on delete set null,
  submitter_name text not null,
  title text not null,
  starts_at timestamptz not null,
  venue text not null,
  city text not null,
  category text not null check (category in ('Music', 'Sports', 'Theater', 'Arts', 'Technology', 'Education', 'Food', 'Movies')),
  face_values jsonb not null default '[]'::jsonb, -- [{ "tier": text, "value": rupiah }]
  pdf_tier text not null,
  organizer_ref text not null default '',
  forgery_score smallint not null default 0 check (forgery_score between 0 and 100),
  pdf_suspicious boolean not null default false,
  status public.seed_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index event_requests_submitted_by_idx on public.event_requests (submitted_by);

create table public.alert_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id text not null references public.events (id) on delete cascade,
  tier_id text references public.tiers (id) on delete cascade, -- null: any new ticket for the event
  created_at timestamptz not null default now()
);
create unique index alert_subscriptions_once on public.alert_subscriptions (user_id, event_id, coalesce(tier_id, ''));
create index alert_subscriptions_event_id_idx on public.alert_subscriptions (event_id);
create index alert_subscriptions_tier_id_idx on public.alert_subscriptions (tier_id);

-- Gate KTP photos: metadata only, the image sits in the private ktp bucket. Staged at
-- listing time; the buyer's view opens at access_open_at and the file is purged after.
create table public.ktp_assets (
  id bigint generated always as identity primary key,
  listing_id text not null references public.listings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  bucket text not null default 'ktp',
  path text not null,
  sha256 text not null,
  access_open_at timestamptz not null,
  purge_after timestamptz not null,
  created_at timestamptz not null default now(),
  constraint ktp_assets_window check (purge_after > access_open_at)
);
create index ktp_assets_listing_id_idx on public.ktp_assets (listing_id);
create index ktp_assets_owner_id_idx on public.ktp_assets (owner_id);

-- The catalogue as the app reads it: rolling demo dates resolved, and the price and count
-- derived from what is actually buyable, so the card and the event page cannot disagree.
create view public.catalogue_events with (security_invoker = true) as
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
  coalesce(p.listing_count, 0) as listing_count
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

-- Helpers. SECURITY DEFINER so policies can look up roles and parties without recursing
-- through RLS; each one only ever answers about the calling user.
create function private.is_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

create function private.is_order_party(p_order_id text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid()))
  );
$$;

create function private.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  -- The display name is the only thing taken from user metadata. Never the role.
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.touch_updated_at() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function private.touch_updated_at();
