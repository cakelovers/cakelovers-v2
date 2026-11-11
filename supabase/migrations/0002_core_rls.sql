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
