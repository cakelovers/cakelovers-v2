import { NextResponse } from "next/server"
import { requireStoreMember } from "@/lib/admin/require-store-member"
import { errorResponse } from "@/lib/api-error"

const MAX_LABEL_LENGTH = 50

// Edits a catalog design's label/price/sort order, or toggles
// is_enabled. No DELETE here — see 0004_catalog_designs_rls.sql:
// disabling is the only supported removal path, so a design already
// referenced by a past order (via its immutable label/price snapshot on
// that order) keeps resolving.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string; designId: string }> }
) {
  const { storeSlug, designId } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  let body: { label?: unknown; priceKrw?: unknown; sortOrder?: unknown; isEnabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "요청 형식이 올바르지 않습니다.")
  }

  const update: Record<string, unknown> = {}

  if (body.label !== undefined) {
    if (typeof body.label !== "string" || !body.label.trim() || body.label.trim().length > MAX_LABEL_LENGTH) {
      return errorResponse(400, "invalid_label", `디자인 이름을 1~${MAX_LABEL_LENGTH}자로 입력해 주세요.`)
    }
    update.label = body.label.trim()
  }
  if (body.priceKrw !== undefined) {
    if (typeof body.priceKrw !== "number" || !Number.isInteger(body.priceKrw) || body.priceKrw <= 0) {
      return errorResponse(400, "invalid_price", "가격을 올바르게 입력해 주세요.")
    }
    update.price_krw = body.priceKrw
  }
  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder !== "number" || !Number.isInteger(body.sortOrder)) {
      return errorResponse(400, "invalid_sort_order", "순서 값이 올바르지 않습니다.")
    }
    update.sort_order = body.sortOrder
  }
  if (body.isEnabled !== undefined) {
    if (typeof body.isEnabled !== "boolean") {
      return errorResponse(400, "invalid_is_enabled", "값이 올바르지 않습니다.")
    }
    update.is_enabled = body.isEnabled
  }

  if (Object.keys(update).length === 0) {
    return errorResponse(400, "empty_update", "변경할 내용이 없습니다.")
  }

  const { data: updated, error } = await auth.supabase
    .from("store_catalog_designs")
    .update(update)
    .eq("id", designId)
    .eq("store_id", auth.store.id)
    .select("id, label, image_path, price_krw, is_enabled, sort_order")
    .maybeSingle()

  if (error || !updated) {
    console.error("[admin/catalog-designs/detail] update failed", error)
    return errorResponse(500, "design_update_failed", "디자인을 수정하지 못했습니다.")
  }

  return NextResponse.json({ design: updated })
}
