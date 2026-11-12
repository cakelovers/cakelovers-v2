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
