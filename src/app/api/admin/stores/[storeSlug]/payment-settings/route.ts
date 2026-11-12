import { NextResponse } from "next/server"
import { requireStoreMember } from "@/lib/admin/require-store-member"
import { errorResponse } from "@/lib/api-error"

const MAX_TEXT_LENGTH = 200
const MAX_INSTRUCTIONS_LENGTH = 1000

// Flow B only — the bank-transfer details shown to a customer once their
// order has been quoted (see 0006_payment_settings.sql). One row per
// store (store_id is the primary key), so writes are an upsert rather
// than a separate create/update split.
export async function GET(_request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  const { data: settings, error } = await auth.supabase
    .from("store_payment_settings")
    .select("bank_name, bank_account_number, bank_account_holder, payment_instructions, payment_deadline_hours")
    .eq("store_id", auth.store.id)
    .maybeSingle()

  if (error) {
    console.error("[admin/payment-settings] load failed", error)
    return errorResponse(500, "payment_settings_load_failed", "결제 설정을 불러오지 못했습니다.")
  }

  return NextResponse.json({ settings: settings ?? null })
}

export async function PUT(request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  let body: {
    bankName?: unknown
    bankAccountNumber?: unknown
    bankAccountHolder?: unknown
    paymentInstructions?: unknown
    paymentDeadlineHours?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "요청 형식이 올바르지 않습니다.")
  }

  const bankName = typeof body.bankName === "string" ? body.bankName.trim() : ""
  const bankAccountNumber = typeof body.bankAccountNumber === "string" ? body.bankAccountNumber.trim() : ""
  const bankAccountHolder = typeof body.bankAccountHolder === "string" ? body.bankAccountHolder.trim() : ""
  const paymentInstructions = typeof body.paymentInstructions === "string" ? body.paymentInstructions.trim() : ""
  const paymentDeadlineHours = Number(body.paymentDeadlineHours)

  if (!bankName || bankName.length > MAX_TEXT_LENGTH) {
    return errorResponse(400, "invalid_bank_name", `은행명을 1~${MAX_TEXT_LENGTH}자로 입력해 주세요.`)
  }
  if (!bankAccountNumber || bankAccountNumber.length > MAX_TEXT_LENGTH) {
    return errorResponse(400, "invalid_bank_account_number", "계좌번호를 올바르게 입력해 주세요.")
  }
  if (!bankAccountHolder || bankAccountHolder.length > MAX_TEXT_LENGTH) {
    return errorResponse(400, "invalid_bank_account_holder", "예금주명을 올바르게 입력해 주세요.")
  }
  if (paymentInstructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return errorResponse(400, "instructions_too_long", `안내 문구는 ${MAX_INSTRUCTIONS_LENGTH}자 이하로 입력해 주세요.`)
  }
  if (!Number.isInteger(paymentDeadlineHours) || paymentDeadlineHours <= 0) {
    return errorResponse(400, "invalid_deadline", "입금 기한(시간)을 올바르게 입력해 주세요.")
  }

  const { data: settings, error } = await auth.supabase
    .from("store_payment_settings")
    .upsert(
      {
        store_id: auth.store.id,
        bank_name: bankName,
        bank_account_number: bankAccountNumber,
        bank_account_holder: bankAccountHolder,
        payment_instructions: paymentInstructions || null,
        payment_deadline_hours: paymentDeadlineHours,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id" }
    )
    .select("bank_name, bank_account_number, bank_account_holder, payment_instructions, payment_deadline_hours")
    .single()

  if (error || !settings) {
    console.error("[admin/payment-settings] upsert failed", error)
    return errorResponse(500, "payment_settings_save_failed", "결제 설정을 저장하지 못했습니다.")
  }

  return NextResponse.json({ settings })
}
