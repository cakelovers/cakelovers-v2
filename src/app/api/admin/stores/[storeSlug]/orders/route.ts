import { NextResponse } from "next/server"
import { requireStoreMember } from "@/lib/admin/require-store-member"
import { errorResponse } from "@/lib/api-error"
import type { OrderStatus } from "@/lib/order-status"

// Staff order list. RLS ("members can view their store's orders",
// 0002_core_rls.sql) is what actually scopes this to the caller's own
// store — the .eq("store_id", ...) below is belt-and-suspenders, not the
// real boundary.
export async function GET(request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  const url = new URL(request.url)
  const statusFilter = url.searchParams.get("status") as OrderStatus | null

  let query = auth.supabase
    .from("orders")
    .select(
      "id, order_type, status, pickup_date, pickup_time, cake_message, catalog_design_label, price_krw, description, quoted_price_krw, customer_id, created_at"
    )
    .eq("store_id", auth.store.id)
    .order("created_at", { ascending: false })

  if (statusFilter) {
    query = query.eq("status", statusFilter)
  }

  const { data: orders, error } = await query

  if (error) {
    console.error("[admin/orders] list failed", error)
    return errorResponse(500, "orders_load_failed", "주문 목록을 불러오지 못했습니다.")
  }

  return NextResponse.json({ orders: orders ?? [] })
}
