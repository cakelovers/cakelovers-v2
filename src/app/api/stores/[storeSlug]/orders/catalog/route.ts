import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getActiveStoreBySlug } from "@/lib/get-store"
import { getOrCreateCustomer } from "@/lib/get-or-create-customer"
import { isPickupSlotValid } from "@/lib/pickup"
import { initialStatusFor } from "@/lib/order-status"
import { errorResponse } from "@/lib/api-error"

const MAX_CAKE_MESSAGE_LENGTH = 50
const MAX_CUSTOMER_NOTE_LENGTH = 500

interface CatalogDesignRow {
  id: string
  label: string
  price_krw: number
}

function readField(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  return typeof value === "string" ? value : null
}

// Flow A (기존 케이크 주문). Design is fixed and price is authoritative —
// no pricing_pending step. This route only creates the order at
// payment_pending; the client then launches the Toss Payments checkout
// widget with the returned price, and /payments/confirm finalizes it.
// cake_message is the one thing the customer can still customize — never
// trusted from the client beyond length; the design/price always come
// from the server-resolved catalog row, never from the request body.
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
  const catalogDesignId = readField(formData, "catalogDesignId")
  const cakeMessageRaw = readField(formData, "cakeMessage")?.trim() ?? ""
  const pickupDate = readField(formData, "pickupDate")
  const pickupTime = readField(formData, "pickupTime")
  const name = readField(formData, "name")?.trim() ?? ""
  const phone = readField(formData, "phone")?.trim() ?? ""
  const customerNote = readField(formData, "customerNote")?.trim() ?? ""
  const privacyConsentAccepted = readField(formData, "privacyConsentAccepted") === "true"

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!orderId || !UUID_PATTERN.test(orderId)) {
    return errorResponse(400, "invalid_order_id", "주문 번호가 없거나 올바르지 않습니다.")
  }
  if (!catalogDesignId || !UUID_PATTERN.test(catalogDesignId)) {
    return errorResponse(400, "missing_catalog_design", "디자인을 선택해 주세요.")
  }
  if (cakeMessageRaw.length > MAX_CAKE_MESSAGE_LENGTH) {
    return errorResponse(400, "cake_message_too_long", `케이크 메시지는 ${MAX_CAKE_MESSAGE_LENGTH}자 이하로 입력해 주세요.`)
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

  const store = await getActiveStoreBySlug(storeSlug)
  if (!store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  if (!(await isPickupSlotValid(store.id, pickupDate, pickupTime))) {
    return errorResponse(400, "pickup_slot_unavailable", "선택하신 픽업 시간은 더 이상 이용할 수 없습니다. 다른 시간을 선택해 주세요.")
  }

  // Never trust the client for the design's label or price — both
  // resolved here, from the database, at submission time.
  const serviceRole = createServiceRoleClient()
  const { data: design, error: designError } = await serviceRole
    .from("store_catalog_designs")
    .select("id, label, price_krw")
    .eq("id", catalogDesignId)
    .eq("store_id", store.id)
    .eq("is_enabled", true)
    .maybeSingle<CatalogDesignRow>()

  if (designError) {
    console.error("[orders/catalog] design lookup failed", designError)
    return errorResponse(500, "order_create_failed", "주문을 제출하지 못했습니다. 다시 시도해 주세요.")
  }
  if (!design) {
    return errorResponse(400, "catalog_design_unavailable", "선택하신 디자인을 더 이상 주문할 수 없습니다. 다시 선택해 주세요.")
  }

  // Idempotent replay: this exact order may already have been submitted
  // (a retry after a dropped response, or a double-tap race).
  const { data: existingOrder } = await supabase.from("orders").select("id").eq("id", orderId).maybeSingle()
  if (existingOrder) {
    return NextResponse.json({ orderId: existingOrder.id, priceKrw: design.price_krw })
  }

  const customerResult = await getOrCreateCustomer(supabase, store.id, user.id, name, phone)
  if ("error" in customerResult) {
    return errorResponse(500, "customer_create_failed", customerResult.error)
  }

  const { error: orderInsertError } = await supabase.from("orders").insert({
    id: orderId,
    store_id: store.id,
    customer_id: customerResult.customerId,
    order_type: "catalog",
    status: initialStatusFor("catalog"),
    catalog_design_id: design.id,
    catalog_design_label: design.label,
    price_krw: design.price_krw,
    cake_message: cakeMessageRaw || null,
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    customer_note: customerNote || null,
    privacy_consent_given_at: new Date().toISOString(),
  })

  if (orderInsertError) {
    if (orderInsertError.code === "23505") {
      return NextResponse.json({ orderId, priceKrw: design.price_krw })
    }
    console.error("[orders/catalog] insert failed", orderInsertError)
    return errorResponse(500, "order_create_failed", "주문을 제출하지 못했습니다. 다시 시도해 주세요.")
  }

  // priceKrw is returned so the client can immediately launch the Toss
  // checkout widget with the authoritative amount — never the client's
  // own copy of the design's price.
  return NextResponse.json({ orderId, priceKrw: design.price_krw })
}
