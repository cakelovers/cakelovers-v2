import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getActiveStoreBySlug } from "@/lib/get-store"
import { getOrCreateCustomer } from "@/lib/get-or-create-customer"
import { isPickupSlotValid } from "@/lib/pickup"
import { initialStatusFor } from "@/lib/order-status"
import { errorResponse } from "@/lib/api-error"

const PREVIEW_BUCKET = "ai-previews"
const MIN_DESCRIPTION_LENGTH = 10
const MAX_DESCRIPTION_LENGTH = 500
const MAX_CUSTOMER_NOTE_LENGTH = 500
const MAX_REFERENCE_IMAGES = 3
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readField(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  return typeof value === "string" ? value : null
}

// Flow B (AI 오더메이드). Price is genuinely variable by complexity, so
// this order starts at pricing_pending — the store owner quotes it
// manually afterward. The AI preview and each reference photo were
// already uploaded separately (ai-preview/save, reference-images/save);
// this route only records the resulting storage paths, after confirming
// each one actually belongs to this store+order rather than trusting an
// arbitrary client-supplied path verbatim.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> }
) {
  const { storeSlug } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return errorResponse(401, "not_authenticated", "세션이 만료되었습니다. 페이지를 새로고침한 후 다시 시도해 주세요.")
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse(400, "invalid_form_data", "요청 형식이 올바르지 않습니다.")
  }

  const orderId = readField(formData, "orderId")
  const description = readField(formData, "description")?.trim() ?? ""
  const previewStoragePath = readField(formData, "previewStoragePath")
  const previewPrompt = readField(formData, "previewPrompt")
  const pickupDate = readField(formData, "pickupDate")
  const pickupTime = readField(formData, "pickupTime")
  const name = readField(formData, "name")?.trim() ?? ""
  const phone = readField(formData, "phone")?.trim() ?? ""
  const customerNote = readField(formData, "customerNote")?.trim() ?? ""
  const privacyConsentAccepted = readField(formData, "privacyConsentAccepted") === "true"

  if (!orderId || !UUID_PATTERN.test(orderId)) {
    return errorResponse(400, "invalid_order_id", "주문 번호가 없거나 올바르지 않습니다.")
  }
  if (description.length < MIN_DESCRIPTION_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) {
    return errorResponse(400, "invalid_description", "올바른 디자인 설명을 입력해 주세요.")
  }
  if (!previewStoragePath) {
    return errorResponse(400, "missing_preview", "주문을 제출하기 전에 AI 미리보기를 선택해 주세요.")
  }
  if (!previewPrompt) {
    return errorResponse(400, "missing_preview_prompt", "미리보기 프롬프트가 없습니다.")
  }
  if (!pickupDate || Number.isNaN(Date.parse(pickupDate))) {
    return errorResponse(400, "invalid_pickup_date", "올바른 픽업 날짜를 선택해 주세요.")
  }
  if (!pickupTime || !/^\d{2}:\d{2}$/.test(pickupTime)) {
    return errorResponse(400, "invalid_pickup_time", "올바른 픽업 시간을 선택해 주세요.")
  }
  if (!name) return errorResponse(400, "missing_name", "이름을 입력해 주세요.")
  if (!phone) return errorResponse(400, "missing_phone", "전화번호를 입력해 주세요.")
  if (customerNote.length > MAX_CUSTOMER_NOTE_LENGTH) {
    return errorResponse(400, "customer_note_too_long", `추가 메모는 ${MAX_CUSTOMER_NOTE_LENGTH}자 이하로 입력해 주세요.`)
  }
  if (!privacyConsentAccepted) {
    return errorResponse(400, "privacy_consent_required", "제출하기 전에 개인정보처리방침에 동의해 주세요.")
  }

  const referenceImagePaths: { position: number; storagePath: string }[] = []
  for (let position = 1; position <= MAX_REFERENCE_IMAGES; position++) {
    const value = readField(formData, `reference_${position}_path`)
    if (value) referenceImagePaths.push({ position, storagePath: value })
  }

  const store = await getActiveStoreBySlug(storeSlug)
  if (!store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  if (!(await isPickupSlotValid(store.id, pickupDate, pickupTime))) {
    return errorResponse(400, "pickup_slot_unavailable", "선택하신 픽업 시간은 더 이상 이용할 수 없습니다. 다른 시간을 선택해 주세요.")
  }

  if (!previewStoragePath.startsWith(`${store.id}/${orderId}/`)) {
    return errorResponse(400, "invalid_preview_data", "선택한 미리보기 이미지가 올바르지 않습니다.")
  }
  for (const { storagePath } of referenceImagePaths) {
    if (!storagePath.startsWith(`${store.id}/${orderId}/`)) {
      return errorResponse(400, "invalid_reference_data", "참고 사진 중 하나가 올바르지 않습니다.")
    }
  }

  const { data: existingOrder } = await supabase.from("orders").select("id").eq("id", orderId).maybeSingle()
  if (existingOrder) {
    return NextResponse.json({ orderId: existingOrder.id })
  }

  const customerResult = await getOrCreateCustomer(supabase, store.id, user.id, name, phone)
  if ("error" in customerResult) {
    return errorResponse(500, "customer_create_failed", customerResult.error)
  }

  const serviceRole = createServiceRoleClient()

  const { error: orderInsertError } = await supabase.from("orders").insert({
    id: orderId,
    store_id: store.id,
    customer_id: customerResult.customerId,
    order_type: "custom",
    status: initialStatusFor("custom"),
    description,
    ai_preview_path: previewStoragePath,
    ai_preview_prompt: previewPrompt,
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    customer_note: customerNote || null,
    privacy_consent_given_at: new Date().toISOString(),
  })

  if (orderInsertError) {
    if (orderInsertError.code === "23505") {
      return NextResponse.json({ orderId })
    }
    // Genuine failure, not a race — nothing will ever reference this
    // upload, so roll it back.
    await serviceRole.storage.from(PREVIEW_BUCKET).remove([previewStoragePath])
    console.error("[orders/custom] insert failed", orderInsertError)
    return errorResponse(500, "order_create_failed", "주문을 제출하지 못했습니다. 다시 시도해 주세요.")
  }

  if (referenceImagePaths.length > 0) {
    const { error: referenceInsertError } = await supabase.from("reference_images").insert(
      referenceImagePaths.map((row) => ({
        store_id: store.id,
        order_id: orderId,
        storage_path: row.storagePath,
        position: row.position,
      }))
    )
    if (referenceInsertError) {
      // Non-fatal: the order above is already complete and valid without
      // these rows, so log and move on rather than undo a successful order.
      console.error("[orders/custom] reference_images insert failed", referenceInsertError)
    }
  }

  return NextResponse.json({ orderId })
}
