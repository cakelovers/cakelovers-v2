import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getActiveStoreBySlug } from "@/lib/get-store"
import { errorResponse } from "@/lib/api-error"
import { looksLikeHeic, normalizeToJpeg } from "@/lib/storage/normalize-image"

// Node.js is already the default runtime (no edge declared anywhere in
// this app), which is what sharp/heic-convert require — an explicit
// `export const runtime = "nodejs"` here would be redundant and, as of
// Next.js's cacheComponents mode (enabled in next.config.ts), is actually
// rejected as an incompatible route segment config.
export const maxDuration = 60

const REFERENCE_BUCKET = "reference-images"
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Flow B only. Each photo uploads individually (not bundled into the final
// order submission) to stay well clear of serverless body-size limits.
// This route only returns the resulting storage path; order submission
// later records {order_id, storage_path, position} rows (migration 0005).
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

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse(400, "invalid_form_data", "요청 형식이 올바르지 않습니다.")
  }

  const orderId = formData.get("orderId")
  const positionRaw = formData.get("position")
  const file = formData.get("file")

  if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
    return errorResponse(400, "invalid_order_id", "주문 번호가 없거나 올바르지 않습니다.")
  }

  const position = Number(positionRaw)
  if (!Number.isInteger(position) || position < 1 || position > 3) {
    return errorResponse(400, "invalid_position", "참고 사진 위치가 올바르지 않습니다.")
  }

  if (!(file instanceof File) || file.size === 0) {
    return errorResponse(400, "missing_file", "참고 사진 파일이 필요합니다.")
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse(400, "reference_too_large", "사진 용량이 너무 큽니다 — 4MB 이하로 첨부해 주세요.")
  }

  const store = await getActiveStoreBySlug(storeSlug)
  if (!store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer())
  const declaredType = file.type.toLowerCase()
  const plausiblyImage =
    declaredType === "" ||
    (declaredType.startsWith("image/") && declaredType !== "image/svg+xml") ||
    looksLikeHeic(inputBuffer)

  if (!plausiblyImage) {
    return errorResponse(400, "invalid_reference_type", "참고 사진은 JPEG, PNG, WebP 또는 HEIC 형식이어야 합니다.")
  }

  let normalized
  try {
    normalized = await normalizeToJpeg(inputBuffer)
  } catch (error) {
    console.error("[reference-images/save] normalization failed", error)
    return errorResponse(400, "invalid_reference_type", "지원하지 않는 사진 형식입니다. JPEG 또는 PNG 파일을 선택해 주세요.")
  }

  const storagePath = `${store.id}/${orderId}/${position}.${normalized.extension}`

  const serviceRole = createServiceRoleClient()
  const { error: uploadError } = await serviceRole.storage
    .from(REFERENCE_BUCKET)
    .upload(storagePath, normalized.buffer, { contentType: normalized.contentType, upsert: true })

  if (uploadError) {
    console.error("[reference-images/save] upload failed", uploadError)
    return errorResponse(502, "reference_upload_failed", "참고 사진을 저장하지 못했습니다. 다시 시도해 주세요.")
  }

  return NextResponse.json({ storagePath, position })
}
