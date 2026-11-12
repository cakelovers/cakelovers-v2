import { NextResponse } from "next/server"
import { requireStoreMember } from "@/lib/admin/require-store-member"
import { errorResponse } from "@/lib/api-error"
import { ORDER_STATUSES, VALID_STATUS_TRANSITIONS, type OrderStatus } from "@/lib/order-status"

// Generic staff-driven status transition (paid→making→ready→completed,
// or a cancellation from most states, and Flow B's manual
// payment_pending→paid once the owner has confirmed the bank transfer
// themselves). Validated against the same VALID_STATUS_TRANSITIONS table
// the customer-facing routes use, then written with an .eq(current
// status) guard so two staff members clicking at once can't race each
// other into an invalid state.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string; orderId: string }> }
) {
  const { storeSlug, orderId } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  let body: { status?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "요청 형식이 올바르지 않습니다.")
  }

  const nextStatus = body.status
  if (typeof nextStatus !== "string" || !ORDER_STATUSES.includes(nextStatus as OrderStatus)) {
    return errorResponse(400, "invalid_status", "올바른 상태가 아닙니다.")
  }

  const { data: order, error: orderError } = await auth.supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("store_id", auth.store.id)
    .maybeSingle<{ id: string; status: OrderStatus }>()

  if (orderError) {
    return errorResponse(500, "order_load_failed", "주문을 불러오지 못했습니다.")
  }
  if (!order) {
    return errorResponse(404, "order_not_found", "주문을 찾을 수 없습니다.")
  }

  const allowedNext = VALID_STATUS_TRANSITIONS[order.status]
  if (!allowedNext.includes(nextStatus as OrderStatus)) {
    return errorResponse(
      409,
      "invalid_transition",
      `'${order.status}' 상태에서 '${nextStatus}'로 변경할 수 없습니다.`
    )
  }

  const { error: updateError, data: updated } = await auth.supabase
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id, status")
    .maybeSingle()

  if (updateError || !updated) {
    console.error("[admin/orders/status] update failed", updateError)
    return errorResponse(409, "status_update_failed", "상태를 변경하지 못했습니다 — 다른 작업과 충돌했을 수 있습니다. 새로고침 후 다시 시도해 주세요.")
  }

  return NextResponse.json({ order: updated })
}
