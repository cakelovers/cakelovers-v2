import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getActiveStoreBySlug } from "@/lib/get-store"
import { errorResponse } from "@/lib/api-error"

const PREVIEW_BUCKET = "ai-previews"
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Flow B only. Uploads the customer's selected AI preview (a base64 data
// URL) separately from the final order submission, same reason as
// reference-images/save — keeps the final /orders/custom request small
// regardless of image size.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> }
) {
  const { storeSlug } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return errorResponse(401, "not_authenticated", "세션이 만료되었습니다. 페이지를 새로고침한 후 다시 시도해 주세요.")
  }

  let body: { orderId?: unknown; previewImage?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "요청 형식이 올바르지 않습니다.")
  }

  const { orderId, previewImage } = body
  if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
    return errorResponse(400, "invalid_order_id", "주문 번호가 없거나 올바르지 않습니다.")
  }
  if (typeof previewImage !== "string" || !previewImage.startsWith("data:image/")) {
    return errorResponse(400, "invalid_preview_image", "미리보기 이미지가 올바르지 않습니다.")
  }

  const store = await getActiveStoreBySlug(storeSlug)
  if (!store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  const match = previewImage.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!match) {
    return errorResponse(400, "invalid_preview_image", "미리보기 이미지가 올바르지 않습니다.")
  }
  const [, ext, base64] = match
  const buffer = Buffer.from(base64, "base64")
  const storagePath = `${store.id}/${orderId}/preview.${ext}`

  const serviceRole = createServiceRoleClient()
  const { error: uploadError } = await serviceRole.storage
    .from(PREVIEW_BUCKET)
    .upload(storagePath, buffer, { contentType: `image/${ext}`, upsert: true })

  if (uploadError) {
    console.error("[ai-preview/save] upload failed", uploadError)
    return errorResponse(502, "preview_upload_failed", "선택한 디자인을 저장하지 못했습니다. 다시 시도해 주세요.")
  }

  return NextResponse.json({ storagePath })
}
