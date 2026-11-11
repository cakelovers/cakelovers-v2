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
