import { NextResponse } from "next/server"
import { requireStoreMember } from "@/lib/admin/require-store-member"
import { errorResponse } from "@/lib/api-error"

// Flow B only. The store owner's manual quote — the one place
// quoted_price_krw is ever written. Moves the order from pricing_pending
// to payment_pending; the customer then transfers to the store's bank
// account (store_payment_settings) and the owner confirms the transfer
// manually via the status route below. Guarded by
// .eq("status", "pricing_pending") so a double-submit or a stale page
// can't silently re-quote an order that's already moved on.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string; orderId: string }> }
) {
  const { storeSlug, orderId } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  let body: { quotedPriceKrw?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "요청 형식이 올바르지 않습니다.")
  }

  const { quotedPriceKrw } = body
  if (typeof quotedPriceKrw !== "number" || !Number.isInteger(quotedPriceKrw) || quotedPriceKrw <= 0) {
    return errorResponse(400, "invalid_quote", "견적 금액을 올바르게 입력해 주세요.")
  }

  const { data: order, error: orderError } = await auth.supabase
    .from("orders")
    .select("id, order_type, status")
    .eq("id", orderId)
    .eq("store_id", auth.store.id)
    .maybeSingle()

  if (orderError) {
    return errorResponse(500, "order_load_failed", "주문을 불러오지 못했습니다.")
  }
  if (!order || order.order_type !== "custom") {
    return errorResponse(404, "order_not_found", "주문을 찾을 수 없습니다.")
  }
  if (order.status !== "pricing_pending") {
    return errorResponse(409, "invalid_order_state", "이미 견적이 입력된 주문입니다.")
  }

  const { error: updateError, data: updated } = await auth.supabase
    .from("orders")
    .update({ quoted_price_krw: quotedPriceKrw, status: "payment_pending" })
    .eq("id", orderId)
    .eq("status", "pricing_pending")
    .select("id, status, quoted_price_krw")
    .maybeSingle()

  if (updateError || !updated) {
    console.error("[admin/orders/quote] update failed", updateError)
    return errorResponse(500, "quote_failed", "견적을 등록하지 못했습니다. 다시 시도해 주세요.")
  }

  return NextResponse.json({ order: updated })
}
