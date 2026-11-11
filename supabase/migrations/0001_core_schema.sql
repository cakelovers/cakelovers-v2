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
