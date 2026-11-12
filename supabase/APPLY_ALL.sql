-- ===== 0001_core_schema.sql =====
-- ============================================================================
-- 0001_core_schema.sql — tenant root + customers + the unified orders table
-- ============================================================================
-- Multi-tenant from the start: every table below is store_id-scoped.
-- Guest customers authenticate via Supabase Anonymous Auth (no email/
-- password) so every RLS check has a real auth.uid() to key off.
--
-- orders is ONE table shared by both entry points (order_type discriminates),
-- not two parallel systems — see the column comments below for exactly which
-- fields belong to which flow and why the status machine branches.
--
-- Schema + RLS-enabled-with-no-policies here; policies added in the
-- follow-up 0002 migration.
--
-- SAFE TO RE-RUN: `create table if not exists`, guarded column adds.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists stores (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  timezone    text not null default 'Asia/Seoul',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table stores is 'Tenant root. Every other tenant-scoped table carries store_id referencing this.';
comment on column stores.slug is 'Public URL segment: /s/{slug}.';

alter table stores enable row level security;


create table if not exists store_members (
  id        uuid primary key default gen_random_uuid(),
  store_id  uuid not null references stores(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (store_id, user_id)
);

comment on table store_members is 'Links a Supabase auth user to the store(s) they manage as staff. The membership check every admin route and RLS policy relies on.';

alter table store_members enable row level security;


create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  phone         text,
  created_at    timestamptz not null default now(),
  unique (store_id, auth_user_id)
);

comment on column customers.auth_user_id is 'The guest''s anonymous-auth identity (see docs on Anonymous Auth) — this is what every customer-facing RLS policy keys off, not a stable "logged in" account.';

alter table customers enable row level security;


create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete restrict,

  -- Which entry point produced this order — NOT a separate table/system,
  -- just a discriminator that decides which optional column group below
  -- is populated, and which path the status machine takes (see
  -- order-status.ts equivalent in the app layer).
  order_type      text not null check (order_type in ('catalog', 'custom')),

  status          text not null,

  pickup_date     date not null,
  pickup_time     time not null,

  -- Flow A (catalog, order_type = 'catalog') — see 0003_catalog_designs.sql
  -- for catalog_design_id/catalog_design_label/price_krw, added there so
  -- this file doesn't need to know about store_catalog_designs yet.
  cake_message    text,  -- customer-editable lettering; null = no message

  -- Flow B (custom/AI, order_type = 'custom')
  description         text,
  ai_preview_path     text,
  ai_preview_prompt    text,
  quoted_price_krw    integer,  -- set by the store owner, Flow B only

  customer_note   text,
  privacy_consent_given_at timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table orders is 'One order pipeline shared by both entry points. order_type discriminates which optional column group applies and which status transitions are valid — see the application-layer order-status module, not a check constraint here, since the valid-transition set is richer than SQL can express cleanly.';
comment on column orders.cake_message is 'Null means "no message" — a valid, common, explicit choice for both flows, not a missing value.';

create index if not exists orders_store_id_idx on orders (store_id, created_at desc);
create index if not exists orders_customer_id_idx on orders (customer_id);

alter table orders enable row level security;

-- ===== 0002_core_rls.sql =====
-- ============================================================================
-- 0002_core_rls.sql — RLS policies for stores, store_members, customers, orders
-- ============================================================================
-- Convention used everywhere in this schema: staff (store_members) get
-- policies scoped to stores they belong to; customers get policies scoped
-- to their own anonymous-auth identity. Public, unauthenticated reads
-- (resolving a store slug, listing catalog designs) are NEVER done through
-- an anon RLS policy here — they go through the service-role client in the
-- API route layer instead, which is the actual security boundary for that
-- case. This keeps "what can an anonymous visitor read" an application-
-- layer decision, not a blanket table-level grant.
--
-- SAFE TO RE-RUN: each policy is dropped first if it already exists.
-- ============================================================================

drop policy if exists "members can view their own store" on stores;
create policy "members can view their own store"
on stores for select
to authenticated
using (
  id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can view their own membership rows" on store_members;
create policy "members can view their own membership rows"
on store_members for select
to authenticated
using (user_id = auth.uid());


drop policy if exists "customers can view their own row" on customers;
create policy "customers can view their own row"
on customers for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists "customers can insert their own row" on customers;
create policy "customers can insert their own row"
on customers for insert
to authenticated
with check (auth_user_id = auth.uid());

drop policy if exists "members can view their store's customers" on customers;
create policy "members can view their store's customers"
on customers for select
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
);


drop policy if exists "customers can view their own orders" on orders;
create policy "customers can view their own orders"
on orders for select
to authenticated
using (
  customer_id in (select id from customers where auth_user_id = auth.uid())
);

drop policy if exists "customers can insert their own orders" on orders;
create policy "customers can insert their own orders"
on orders for insert
to authenticated
with check (
  customer_id in (select id from customers where auth_user_id = auth.uid())
);

drop policy if exists "members can view their store's orders" on orders;
create policy "members can view their store's orders"
on orders for select
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can update their store's orders" on orders;
create policy "members can update their store's orders"
on orders for update
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
)
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

-- ===== 0003_catalog_designs.sql =====
-- ============================================================================
-- 0003_catalog_designs.sql — Flow A (기존 케이크 주문) catalog + payment columns
-- ============================================================================
-- price_krw here is AUTHORITATIVE — the real, fixed, charged amount for a
-- catalog design. This is a deliberate departure from the informational-
-- only "price adjustment" pattern used elsewhere for preset catalogs: Flow A
-- has real payment-gateway integration (see payment_provider/
-- payment_transaction_id below), so its price must be a real number the
-- checkout actually charges, not a display-only hint awaiting a manual
-- quote. Flow B (custom/AI) keeps the manual-quote model — quoted_price_krw
-- on orders, set by the store owner — because its price genuinely varies
-- by complexity and can't be fixed in advance.
--
-- Schema + RLS-enabled-with-no-policies here, policies in 0004.
-- SAFE TO RE-RUN.
-- ============================================================================

create table if not exists store_catalog_designs (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  label               text not null,
  image_path          text not null,
  price_krw           integer not null check (price_krw > 0),
  is_enabled          boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);

comment on table store_catalog_designs is 'Flow A (기존 케이크 주문): store-managed catalog of fixed designs with a real, authoritative price. Disabling (is_enabled = false) is the only supported removal path — orders snapshot their chosen design''s label/price at submission time, so disabling never rewrites order history.';

create index if not exists store_catalog_designs_store_idx
  on store_catalog_designs (store_id, sort_order);

alter table store_catalog_designs enable row level security;


alter table orders
  add column if not exists catalog_design_id     uuid references store_catalog_designs(id) on delete set null,
  add column if not exists catalog_design_label   text,
  add column if not exists price_krw              integer,
  add column if not exists payment_provider        text,
  add column if not exists payment_transaction_id  text,
  add column if not exists paid_at                 timestamptz;

comment on column orders.catalog_design_label is 'Immutable snapshot of the catalog design label at submission time — survives later renames/disables of the source store_catalog_designs row.';
comment on column orders.price_krw is 'Flow A only — the authoritative charged amount, snapshotted from store_catalog_designs.price_krw at submission time. Flow B never sets this; it uses quoted_price_krw instead (manually entered by the store owner, see 0001).';
comment on column orders.payment_transaction_id is 'The payment gateway''s own transaction/payment key, used to verify and reconcile the webhook callback (see payment webhook route). Flow A only.';

-- ===== 0004_catalog_designs_rls.sql =====
-- ============================================================================
-- 0004_catalog_designs_rls.sql — RLS policies for store_catalog_designs
-- ============================================================================
-- Staff manage their own store's catalog. No anon policy — the public
-- catalog listing (Browse screen) reads through the service-role client in
-- the API route layer instead, same convention as 0002. No DELETE policy —
-- designs are disabled via is_enabled, never removed, so an id already
-- referenced by a past order keeps resolving.
--
-- SAFE TO RE-RUN: each policy is dropped first if it already exists.
-- ============================================================================

drop policy if exists "members can view their store's catalog designs" on store_catalog_designs;
create policy "members can view their store's catalog designs"
on store_catalog_designs for select
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can insert their store's catalog designs" on store_catalog_designs;
create policy "members can insert their store's catalog designs"
on store_catalog_designs for insert
to authenticated
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can update their store's catalog designs" on store_catalog_designs;
create policy "members can update their store's catalog designs"
on store_catalog_designs for update
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
)
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

-- ===== 0005_reference_images.sql =====
-- ============================================================================
-- 0005_reference_images.sql — Flow B (AI 오더메이드) customer reference photos
-- ============================================================================
-- Up to 3 photos per order, customer-uploaded, reviewed by the store owner
-- during production — deliberately NOT passed into the AI generation
-- pipeline (see ai-preview route). A separate table, not a column on
-- orders, matching the 1-to-many shape; Flow A never has rows here since
-- its design is already fixed.
--
-- Schema + RLS-enabled-with-no-policies here, policies below in the same
-- file since this table's policy set is small.
-- SAFE TO RE-RUN.
-- ============================================================================

create table if not exists reference_images (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  order_id      uuid not null references orders(id) on delete cascade,
  storage_path  text not null,
  position      integer not null check (position between 1 and 3),
  created_at    timestamptz not null default now(),
  unique (order_id, position)
);

comment on table reference_images is 'Flow B only (AI 오더메이드). Customer-supplied photos reviewed by the store owner during production, not by the AI generation step — AI generation only ever sees the text description.';

alter table reference_images enable row level security;

drop policy if exists "customers can view their own order's reference images" on reference_images;
create policy "customers can view their own order's reference images"
on reference_images for select
to authenticated
using (
  order_id in (
    select o.id from orders o
    join customers c on c.id = o.customer_id
    where c.auth_user_id = auth.uid()
  )
);

drop policy if exists "customers can insert reference images for their own orders" on reference_images;
create policy "customers can insert reference images for their own orders"
on reference_images for insert
to authenticated
with check (
  order_id in (
    select o.id from orders o
    join customers c on c.id = o.customer_id
    where c.auth_user_id = auth.uid()
  )
);

drop policy if exists "members can view their store's reference images" on reference_images;
create policy "members can view their store's reference images"
on reference_images for select
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

-- ===== 0006_payment_settings.sql =====
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

-- ===== 0007_pickup_scheduling.sql =====
-- ============================================================================
-- 0007_pickup_scheduling.sql — shared pickup-slot configuration (both flows)
-- ============================================================================
-- Both Flow A and Flow B end with the same Pickup step, so this is shared
-- infrastructure, not duplicated per flow.
--
-- Schema + RLS-enabled-with-no-policies here, policies below.
-- SAFE TO RE-RUN.
-- ============================================================================

create table if not exists store_pickup_settings (
  store_id               uuid primary key references stores(id) on delete cascade,
  pickup_interval_minutes integer not null default 30 check (pickup_interval_minutes in (15, 30, 60))
);

create table if not exists store_pickup_day_settings (
  store_id        uuid not null references stores(id) on delete cascade,
  weekday         integer not null check (weekday between 0 and 6), -- 0=Sun..6=Sat
  is_enabled      boolean not null default false,
  opening_time    time,
  closing_time    time,
  min_lead_hours  integer,
  primary key (store_id, weekday)
);

alter table store_pickup_settings enable row level security;
alter table store_pickup_day_settings enable row level security;

drop policy if exists "members can view their store's pickup settings" on store_pickup_settings;
create policy "members can view their store's pickup settings"
on store_pickup_settings for select
to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can upsert their store's pickup settings" on store_pickup_settings;
create policy "members can upsert their store's pickup settings"
on store_pickup_settings for insert
to authenticated
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can update their store's pickup settings" on store_pickup_settings;
create policy "members can update their store's pickup settings"
on store_pickup_settings for update
to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()))
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can view their store's pickup day settings" on store_pickup_day_settings;
create policy "members can view their store's pickup day settings"
on store_pickup_day_settings for select
to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can upsert their store's pickup day settings" on store_pickup_day_settings;
create policy "members can upsert their store's pickup day settings"
on store_pickup_day_settings for insert
to authenticated
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can update their store's pickup day settings" on store_pickup_day_settings;
create policy "members can update their store's pickup day settings"
on store_pickup_day_settings for update
to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()))
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

-- ===== 0008_payment_method_and_webhook.sql =====
-- ============================================================================
-- 0008_payment_method_and_webhook.sql — payment_method + Toss webhook audit log
-- ============================================================================
-- payment_method: the human-facing method Toss actually charged with
-- ("카드", "계좌이체", ...), taken from Toss's own payment object (`method`)
-- at confirm/webhook time — never client-supplied. Distinct from
-- payment_provider (the gateway itself, e.g. "toss").
--
-- payment_webhook_events: append-only audit trail of every Toss webhook
-- delivery. The webhook route never trusts this table's data to decide
-- anything — it always re-fetches the authoritative payment from Toss's
-- own API before touching an order (see /api/webhooks/toss). This table
-- exists so a disputed or missed payment can be traced after the fact.
--
-- SAFE TO RE-RUN.
-- ============================================================================

alter table orders
  add column if not exists payment_method text;

comment on column orders.payment_method is 'Flow A only. The payment method Toss actually charged with (card/transfer/...), read from Toss''s own payment object at confirm/webhook time — never trusted from the client.';

-- A given Toss payment (paymentKey) must correspond to exactly one order.
-- Without this, nothing stops the same paymentKey from being recorded
-- against two different orders (e.g. a replayed confirm against a second
-- order id).
create unique index if not exists orders_payment_transaction_id_uidx
  on orders (payment_transaction_id)
  where payment_transaction_id is not null;


create table if not exists payment_webhook_events (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid references stores(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  event_type  text not null,
  payment_key text,
  toss_status text,
  raw_payload jsonb not null,
  created_at  timestamptz not null default now()
);

comment on table payment_webhook_events is 'Append-only audit log of every Toss webhook delivery, regardless of whether it resulted in an order update. Written by the service role only — the webhook route has no customer session to run as.';

create index if not exists payment_webhook_events_order_id_idx
  on payment_webhook_events (order_id);

alter table payment_webhook_events enable row level security;

drop policy if exists "members can view their store's webhook events" on payment_webhook_events;
create policy "members can view their store's webhook events"
on payment_webhook_events for select
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

-- ===== 0009_storage_buckets.sql =====
-- ============================================================================
-- 0009_storage_buckets.sql — private storage buckets for uploaded images
-- ============================================================================
-- Nothing in this codebase creates these buckets at runtime — every route
-- that touches them (catalog-designs, ai-preview/save,
-- reference-images/save, and the admin equivalents) assumes they already
-- exist and will fail with a storage "bucket not found" error otherwise.
-- All three are private (public = false): every read goes through a
-- service-role-issued signed URL, never a public bucket URL — same
-- convention as the rest of this schema's public/customer-facing reads.
--
-- SAFE TO RE-RUN: on conflict do nothing.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalog-designs', 'catalog-designs', false, 4194304, array['image/jpeg', 'image/png', 'image/webp']),
  ('ai-previews', 'ai-previews', false, 8388608, array['image/png', 'image/jpeg']),
  ('reference-images', 'reference-images', false, 4194304, array['image/jpeg'])
on conflict (id) do nothing;

