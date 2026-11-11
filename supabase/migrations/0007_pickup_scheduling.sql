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
