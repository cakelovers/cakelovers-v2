import { NextResponse } from "next/server"
import { requireStoreMember } from "@/lib/admin/require-store-member"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { errorResponse } from "@/lib/api-error"

const AI_PREVIEW_BUCKET = "ai-previews"
const REFERENCE_BUCKET = "reference-images"
const SIGNED_URL_TTL_SECONDS = 3600

// Staff order detail. The order row itself is fetched on the staff
// member's own session so RLS decides access; signed URLs for any
// private-bucket images on it are then generated with the service role
// (storage access isn't RLS-gated the way table rows are) only after
// that RLS-authorized fetch has already proven the staff member may see
// this order.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storeSlug: string; orderId: string }> }
) {
  const { storeSlug, orderId } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  const { data: order, error: orderError } = await auth.supabase
    .from("orders")
    .select(
      "id, order_type, status, pickup_date, pickup_time, cake_message, catalog_design_label, price_krw, description, ai_preview_path, ai_preview_prompt, quoted_price_krw, customer_note, customer_id, payment_provider, payment_method, paid_at, created_at"
    )
    .eq("id", orderId)
    .eq("store_id", auth.store.id)
    .maybeSingle()

  if (orderError) {
    console.error("[admin/orders/detail] lookup failed", orderError)
    return errorResponse(500, "order_load_failed", "주문을 불러오지 못했습니다.")
  }
  if (!order) {
    return errorResponse(404, "order_not_found", "주문을 찾을 수 없습니다.")
  }

  const { data: customer } = await auth.supabase
    .from("customers")
    .select("name, phone")
    .eq("id", order.customer_id)
    .maybeSingle()

  const serviceRole = createServiceRoleClient()

  let aiPreviewUrl: string | null = null
  if (order.ai_preview_path) {
    const { data: signed } = await serviceRole.storage
      .from(AI_PREVIEW_BUCKET)
      .createSignedUrl(order.ai_preview_path, SIGNED_URL_TTL_SECONDS)
    aiPreviewUrl = signed?.signedUrl ?? null
  }

  const { data: referenceRows } = await auth.supabase
    .from("reference_images")
    .select("position, storage_path")
    .eq("order_id", orderId)
    .order("position")

  const referenceImages = await Promise.all(
    (referenceRows ?? []).map(async (row) => {
      const { data: signed } = await serviceRole.storage
        .from(REFERENCE_BUCKET)
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS)
      return { position: row.position, imageUrl: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json({
    order: { ...order, aiPreviewUrl, customer: customer ?? null },
    referenceImages: referenceImages.filter((r) => r.imageUrl !== null),
  })
}
