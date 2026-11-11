-- ============================================================================
-- 0006_payment_settings.sql — Flow B (AI 오더메이드) manual bank-transfer details
-- ============================================================================
-- Flow A doesn't use this table at all — its payment is a real gateway
-- transaction (payment_provider/payment_transaction_id on orders, 0003),
-- confirmed automatically via webhook. Flow B keeps the manual workflow:
-- the store owner enters a quote, the customer transfers to the account
-- below, the owner confirms manually.
--
-- Schema + RLS-enabled-with-no-policies here, policies below.
-- SAFE TO RE-RUN.
-- ============================================================================

create table if not exists store_payment_settings (
  store_id               uuid primary key references stores(id) on delete cascade,
  bank_name              text,
  bank_account_number    text,
  bank_account_holder    text,
  payment_instructions   text,
  payment_deadline_hours integer not null default 24,
  updated_at             timestamptz not null default now()
);

comment on table store_payment_settings is 'Flow B only. Bank-transfer details shown to the customer once the store owner enters a quote. Public/customer-facing reads go through the service-role client, same convention as the rest of this schema.';

alter table store_payment_settings enable row level security;

drop policy if exists "members can view their store's payment settings" on store_payment_settings;
create policy "members can view their store's payment settings"
on store_payment_settings for select
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can upsert their store's payment settings" on store_payment_settings;
create policy "members can upsert their store's payment settings"
on store_payment_settings for insert
to authenticated
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can update their store's payment settings" on store_payment_settings;
create policy "members can update their store's payment settings"
on store_payment_settings for update
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
)
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);
