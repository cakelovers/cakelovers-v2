import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse } from "@/lib/api-error"

// Customer-facing order status lookup. Runs on the customer's own
// session — RLS ("customers can view their own orders",
// 0002_core_rls.sql) is what actually scopes this to the caller's own
// order, not the .eq("id", orderId) alone. A customer trying another
// customer's orderId gets the same 404 as a non-existent one.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storeSlug: string; orderId: string }> }
) {
  const { orderId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return errorResponse(401, "not_authenticated", "세션이 만료되었습니다. 페이지를 새로고침한 후 다시 시도해 주세요.")
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_type, status, pickup_date, pickup_time, catalog_design_label, price_krw, quoted_price_krw, created_at"
    )
    .eq("id", orderId)
    .maybeSingle()

  if (error) {
    console.error("[stores/orders/detail] lookup failed", error)
    return errorResponse(500, "order_load_failed", "주문을 불러오지 못했습니다.")
  }
  if (!order) {
    return errorResponse(404, "order_not_found", "주문을 찾을 수 없습니다.")
  }

  return NextResponse.json({ order })
}
