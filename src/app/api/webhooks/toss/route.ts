import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { fetchTossPaymentByOrderId } from "@/lib/toss"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface OrderRow {
  id: string
  store_id: string
  order_type: string
  status: string
  price_krw: number | null
}

// Toss's server-to-server fallback for the one gap /payments/confirm
// can't cover on its own: a customer who completes payment at Toss but
// loses the connection (or closes the tab) before the client-side confirm
// call fires, leaving the order stuck at payment_pending forever even
// though Toss was actually paid.
//
// Toss does not document a webhook-body signature scheme as of this
// writing, so this route treats the webhook strictly as a wake-up call —
// it never trusts the delivered payload's own status/amount fields.
// Instead it re-fetches the payment from Toss's own API with our secret
// key (the real trust boundary, same as /payments/confirm) and only acts
// on that authoritative result. Every delivery is logged to
// payment_webhook_events regardless of outcome, for later reconciliation.
//
// Always responds 2xx once the payload is at least readable, so Toss
// doesn't retry-storm a delivery whose order turned out to be
// unresolvable — those are logged for manual follow-up instead.
export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ received: true, error: "invalid_json" }, { status: 200 })
  }

  const eventType = typeof (payload as { eventType?: unknown })?.eventType === "string"
    ? (payload as { eventType: string }).eventType
    : "unknown"

  const data = (payload as { data?: Record<string, unknown> })?.data ?? {}
  const orderId = typeof data.orderId === "string" ? data.orderId : null

  const serviceRole = createServiceRoleClient()

  if (!orderId || !UUID_PATTERN.test(orderId)) {
    console.error("[webhooks/toss] payload missing a usable orderId", { eventType })
    await serviceRole.from("payment_webhook_events").insert({
      event_type: eventType,
      payment_key: typeof data.paymentKey === "string" ? data.paymentKey : null,
      raw_payload: payload as object,
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const { data: order } = await serviceRole
    .from("orders")
    .select("id, store_id, order_type, status, price_krw")
    .eq("id", orderId)
    .maybeSingle<OrderRow>()

  if (!order || order.order_type !== "catalog") {
    console.error("[webhooks/toss] webhook for unknown/non-catalog order", { orderId, eventType })
    await serviceRole.from("payment_webhook_events").insert({
      order_id: order?.id ?? null,
      store_id: order?.store_id ?? null,
      event_type: eventType,
      raw_payload: payload as object,
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  let payment
  try {
    payment = await fetchTossPaymentByOrderId(orderId)
  } catch (error) {
    console.error("[webhooks/toss] re-verification against Toss failed", error)
    await serviceRole.from("payment_webhook_events").insert({
      order_id: order.id,
      store_id: order.store_id,
      event_type: eventType,
      raw_payload: payload as object,
    })
    // Ask Toss to retry — we genuinely couldn't verify anything yet.
    return NextResponse.json({ received: false, error: "verification_failed" }, { status: 502 })
  }

  await serviceRole.from("payment_webhook_events").insert({
    order_id: order.id,
    store_id: order.store_id,
    event_type: eventType,
    payment_key: payment?.paymentKey ?? null,
    toss_status: payment?.status ?? null,
    raw_payload: payload as object,
  })

  if (!payment) {
    console.error("[webhooks/toss] Toss has no payment on record for this orderId", { orderId })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // Already resolved (confirmed earlier by /payments/confirm, or a
  // duplicate webhook delivery) — nothing to do.
  if (order.status !== "payment_pending") {
    return NextResponse.json({ received: true, status: order.status }, { status: 200 })
  }

  if (payment.status !== "DONE") {
    // IN_PROGRESS / CANCELED / etc. — not a paid state, leave the order
    // as-is; a later webhook delivery (or the client confirm call) will
    // settle it.
    return NextResponse.json({ received: true, tossStatus: payment.status }, { status: 200 })
  }

  if (order.price_krw !== payment.totalAmount) {
    console.error("[webhooks/toss] amount mismatch — not updating order", {
      orderId,
      expected: order.price_krw,
      tossAmount: payment.totalAmount,
    })
    return NextResponse.json({ received: true, error: "amount_mismatch" }, { status: 200 })
  }

  const { error: updateError } = await serviceRole
    .from("orders")
    .update({
      status: "paid",
      payment_provider: "toss",
      payment_transaction_id: payment.paymentKey,
      payment_method: payment.method,
      paid_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "payment_pending") // same concurrency guard as /payments/confirm

  if (updateError) {
    console.error("[webhooks/toss] order update failed", updateError)
    return NextResponse.json({ received: false, error: "order_update_failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true, status: "paid" }, { status: 200 })
}
