import { NextResponse } from "next/server"
import { requireStoreMember } from "@/lib/admin/require-store-member"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { errorResponse } from "@/lib/api-error"
import { looksLikeHeic, normalizeToJpeg } from "@/lib/storage/normalize-image"

export const maxDuration = 60

const IMAGE_BUCKET = "catalog-designs"
const SIGNED_URL_TTL_SECONDS = 3600
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const MAX_LABEL_LENGTH = 50

// Admin catalog management. Unlike the public GET
// (/api/stores/[storeSlug]/catalog-designs), this lists every design
// including disabled ones, and signs their image URLs the same way.
export async function GET(_request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  const { data: rows, error } = await auth.supabase
    .from("store_catalog_designs")
    .select("id, label, image_path, price_krw, is_enabled, sort_order")
    .eq("store_id", auth.store.id)
    .order("sort_order")

  if (error) {
    console.error("[admin/catalog-designs] list failed", error)
    return errorResponse(500, "catalog_designs_load_failed", "디자인 목록을 불러오지 못했습니다.")
  }

  const serviceRole = createServiceRoleClient()
  const designs = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: signed } = await serviceRole.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(row.image_path, SIGNED_URL_TTL_SECONDS)
      return { ...row, imageUrl: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json({ designs })
}

// Creates a new catalog design. image_path/price_krw are the
// authoritative Flow A fields (see 0003_catalog_designs.sql) — the image
// is normalized the same way customer-uploaded reference photos are
// (same reason: never trust the browser's own encoding), and the row is
// written on the staff member's own session so the insert RLS policy
// (0004_catalog_designs_rls.sql) is the actual boundary, not this check.
export async function POST(request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse(400, "invalid_form_data", "요청 형식이 올바르지 않습니다.")
  }

  const label = formData.get("label")
  const priceRaw = formData.get("priceKrw")
  const sortOrderRaw = formData.get("sortOrder")
  const file = formData.get("file")

  if (typeof label !== "string" || !label.trim() || label.trim().length > MAX_LABEL_LENGTH) {
    return errorResponse(400, "invalid_label", `디자인 이름을 1~${MAX_LABEL_LENGTH}자로 입력해 주세요.`)
  }
  const priceKrw = Number(priceRaw)
  if (!Number.isInteger(priceKrw) || priceKrw <= 0) {
    return errorResponse(400, "invalid_price", "가격을 올바르게 입력해 주세요.")
  }
  const sortOrder = Number.isInteger(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0

  if (!(file instanceof File) || file.size === 0) {
    return errorResponse(400, "missing_file", "디자인 이미지가 필요합니다.")
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse(400, "image_too_large", "이미지 용량이 너무 큽니다 — 4MB 이하로 첨부해 주세요.")
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer())
  const declaredType = file.type.toLowerCase()
  const plausiblyImage =
    declaredType === "" ||
    (declaredType.startsWith("image/") && declaredType !== "image/svg+xml") ||
    looksLikeHeic(inputBuffer)
  if (!plausiblyImage) {
    return errorResponse(400, "invalid_image_type", "이미지는 JPEG, PNG, WebP 또는 HEIC 형식이어야 합니다.")
  }

  let normalized
  try {
    normalized = await normalizeToJpeg(inputBuffer)
  } catch (error) {
    console.error("[admin/catalog-designs] normalization failed", error)
    return errorResponse(400, "invalid_image_type", "지원하지 않는 이미지 형식입니다.")
  }

  const imagePath = `${auth.store.id}/${crypto.randomUUID()}.${normalized.extension}`
  const serviceRole = createServiceRoleClient()
  const { error: uploadError } = await serviceRole.storage
    .from(IMAGE_BUCKET)
    .upload(imagePath, normalized.buffer, { contentType: normalized.contentType })

  if (uploadError) {
    console.error("[admin/catalog-designs] upload failed", uploadError)
    return errorResponse(502, "image_upload_failed", "이미지를 저장하지 못했습니다. 다시 시도해 주세요.")
  }

  const { data: inserted, error: insertError } = await auth.supabase
    .from("store_catalog_designs")
    .insert({
      store_id: auth.store.id,
      label: label.trim(),
      image_path: imagePath,
      price_krw: priceKrw,
      sort_order: sortOrder,
    })
    .select("id, label, image_path, price_krw, is_enabled, sort_order")
    .single()

  if (insertError || !inserted) {
    console.error("[admin/catalog-designs] insert failed", insertError)
    await serviceRole.storage.from(IMAGE_BUCKET).remove([imagePath])
    return errorResponse(500, "design_create_failed", "디자인을 등록하지 못했습니다. 다시 시도해 주세요.")
  }

  return NextResponse.json({ design: inserted })
}
