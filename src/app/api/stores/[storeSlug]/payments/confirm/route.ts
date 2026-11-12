import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getActiveStoreBySlug } from "@/lib/get-store"
import { errorResponse } from "@/lib/api-error"
import { getEnv } from "@/lib/env"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface OrderRow {
  id: string
  store_id: string
  order_type: string
  status: string
  price_krw: number | null
}

// Flow A only. Called by the client immediately after Toss Payments'
// checkout widget redirects back with {paymentKey, orderId, amount}. This
// route is the actual point of trust — it re-verifies the amount against
// our own stored price_krw (never the client-supplied `amount` alone)
// before calling Toss's own confirm API, so a tampered client request
// can't charge a different amount than what the order was created for.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> }
) {
  const { storeSlug } = await params

  let body: { orderId?: unknown; paymentKey?: unknown; amount?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "요청 형식이 올바르지 않습니다.")
  }

  const { orderId, paymentKey, amount } = body
  if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
    return errorResponse(400, "invalid_order_id", "주문 번호가 없거나 올바르지 않습니다.")
  }
  if (typeof paymentKey !== "string" || !paymentKey) {
    return errorResponse(400, "invalid_payment_key", "결제 정보가 올바르지 않습니다.")
  }
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return errorResponse(400, "invalid_amount", "결제 금액이 올바르지 않습니다.")
  }

  const store = await getActiveStoreBySlug(storeSlug)
  if (!store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  const serviceRole = createServiceRoleClient()
  const { data: order, error: orderError } = await serviceRole
    .from("orders")
    .select("id, store_id, order_type, status, price_krw")
    .eq("id", orderId)
    .eq("store_id", store.id)
    .maybeSingle<OrderRow>()

  if (orderError) {
    console.error("[payments/confirm] order lookup failed", orderError)
    return errorResponse(500, "payment_confirm_failed", "결제를 확인하지 못했습니다. 다시 시도해 주세요.")
  }
  if (!order || order.order_type !== "catalog") {
    return errorResponse(404, "order_not_found", "주문을 찾을 수 없습니다.")
  }

  // Already confirmed — idempotent replay (e.g. the customer refreshed
  // the success page).
  if (order.status === "paid" || order.status === "making" || order.status === "ready" || order.status === "completed") {
    return NextResponse.json({ orderId: order.id, status: order.status })
  }
  if (order.status !== "payment_pending") {
    return errorResponse(409, "invalid_order_state", "이 주문은 결제할 수 없는 상태입니다.")
  }

  // The real trust boundary: the order's own stored price, not the
  // client-reported amount, is what gets sent to Toss.
  if (order.price_krw !== amount) {
    console.error("[payments/confirm] amount mismatch", { orderId, expected: order.price_krw, received: amount })
    return errorResponse(400, "amount_mismatch", "결제 금액이 주문 금액과 일치하지 않습니다.")
  }

  const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${getEnv().TOSS_SECRET_KEY}:`).toString("base64")}`,
    },
    body: JSON.stringify({ paymentKey, orderId, amount: order.price_krw }),
  })

  const tossBody = await tossRes.json()

  if (!tossRes.ok) {
    console.error("[payments/confirm] Toss confirm failed", tossRes.status, tossBody)
    return errorResponse(502, "toss_confirm_failed", tossBody?.message ?? "결제 승인에 실패했습니다.")
  }

  const { error: updateError } = await serviceRole
    .from("orders")
    .update({
      status: "paid",
      payment_provider: "toss",
      payment_transaction_id: paymentKey,
      payment_method: typeof tossBody?.method === "string" ? tossBody.method : null,
      paid_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "payment_pending") // guards against a concurrent double-confirm

  if (updateError) {
    console.error("[payments/confirm] order status update failed", updateError)
    return errorResponse(500, "payment_confirm_failed", "결제는 완료되었지만 주문 상태 갱신에 실패했습니다. 매장에 문의해 주세요.")
  }

  return NextResponse.json({ orderId, status: "paid" })
}
