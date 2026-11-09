-- NEAR HACKATHON: a hold paid from any chain through NEAR Intents (tasks/near-hackathon.md). It sits
-- next to the other holds and behaves like them (claim_listing, expire_payments, mark_payment_paid):
-- provider escrow, channel INTENTS, and what it needs in one column, since the rail is a team demo for
-- now and its shape may still change. Written by the server only, like every column of payments.
alter table public.payments
  drop constraint payments_channel_check,
  add constraint payments_channel_check check (channel in ('QRIS', 'USDC', 'INTENTS')),
  add column intent jsonb;

comment on column public.payments.intent is
  'NEAR Intents hold: the deposit address and swap status from 1Click, and the order terms that give its LummyIntentReceiver address.';
