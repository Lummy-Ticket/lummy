-- Lummy Ticket: who can reach what (docs/09 §3.2).
-- Two layers, both required: GRANT decides whether a role can touch a table or column at
-- all, RLS decides which rows. Nothing here lets a browser write escrow state, evidence
-- or verdicts; those go through server routes with the service role.

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.tiers enable row level security;
alter table public.listings enable row level security;
alter table public.orders enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_replies enable row level security;
alter table public.event_requests enable row level security;
alter table public.alert_subscriptions enable row level security;
alter table public.ktp_assets enable row level security; -- no policies: server only

-- Start from nothing, then open exactly what the app needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant usage on schema private to anon, authenticated, service_role;
revoke execute on all functions in schema private from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.is_order_party(text) to anon, authenticated, service_role;

-- Catalogue: public.
grant select on public.events, public.tiers, public.catalogue_events to anon, authenticated;
create policy events_read on public.events for select to anon, authenticated using (true);
create policy tiers_read on public.tiers for select to anon, authenticated using (true);

-- Listings: live ones for everyone, plus a seller's own and everything for admins.
-- Column grants keep the ticket file, barcode HMAC and AI internals server-side.
grant select (
  id, event_id, tier_id, seller_id, seller_name, ask_price, face_value, quantity, splittable,
  gate_ktp, status, late_listing, autofilled, forgery_score, pdf_suspicious, barcode_duplicate,
  views, created_at
) on public.listings to anon, authenticated;
create policy listings_read on public.listings for select to anon, authenticated using (
  status = 'active'
  or seller_id = (select auth.uid())
  or (select private.is_admin())
);

-- Profiles: your own, and admins see everyone. You may edit your contact and payout
-- details, never your role or KYC result.
grant select on public.profiles to authenticated;
grant update (full_name, phone, payout_bank, payout_number, alert_channel) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid()) or (select private.is_admin())
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Orders and claims: the two parties and admins read; only the server writes.
grant select on public.orders, public.disputes, public.dispute_replies to authenticated;
create policy orders_read on public.orders for select to authenticated using (
  buyer_id = (select auth.uid())
  or seller_id = (select auth.uid())
  or (select private.is_admin())
);
create policy disputes_read on public.disputes for select to authenticated using (
  (select private.is_order_party(order_id)) or (select private.is_admin())
);
create policy dispute_replies_read on public.dispute_replies for select to authenticated using (
  (select private.is_order_party(order_id)) or (select private.is_admin())
);

-- Event requests: the submitter sees their own, admins see the queue. Filed by the server,
-- since the forgery score must not come from the browser.
grant select on public.event_requests to authenticated;
create policy event_requests_read on public.event_requests for select to authenticated using (
  submitted_by = (select auth.uid()) or (select private.is_admin())
);

-- Alerts: each user manages their own waitlist rows directly.
grant select, delete on public.alert_subscriptions to authenticated;
grant insert (event_id, tier_id) on public.alert_subscriptions to authenticated;
create policy alerts_read on public.alert_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy alerts_insert on public.alert_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy alerts_delete on public.alert_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
