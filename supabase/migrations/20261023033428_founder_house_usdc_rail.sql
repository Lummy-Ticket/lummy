-- Founder House: the payment rail follows the show, and USDC payments sit next to QRIS ones.
-- A show in Indonesia (country ID) is paid in rupiah by QRIS; a show abroad is paid in USDC from the
-- buyer's own wallet into LummyEscrow (tasks/founder-house-usdc.md). Existing rows keep ID and IDR.
-- Tried on 22 Oct 2026 inside a transaction that rolled back, applied 23 Oct 2026.
alter table public.events
  add column country text not null default 'ID' check (country ~ '^[A-Z]{2}$'),
  add column currency text not null default 'IDR' check (currency in ('IDR', 'USDC'));

-- A USDC hold is a payments row like a QRIS one, so holding, releasing and expiring seats work the
-- same way: provider escrow, channel USDC, and the wallet, listing and authorisation it is for.
alter table public.payments
  drop constraint payments_provider_check,
  add constraint payments_provider_check check (provider in ('xendit', 'escrow')),
  drop constraint payments_channel_check,
  add constraint payments_channel_check check (channel in ('QRIS', 'USDC')),
  add column payer_wallet text check (payer_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  add column onchain_listing_id text,
  add column auth_nonce text unique;

alter table public.orders
  add column rail text check (rail in ('simulated', 'chain', 'qris', 'usdc')),
  add column buyer_wallet text check (buyer_wallet ~ '^0x[0-9a-fA-F]{40}$');
