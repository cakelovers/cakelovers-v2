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
