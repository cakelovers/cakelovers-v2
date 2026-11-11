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
