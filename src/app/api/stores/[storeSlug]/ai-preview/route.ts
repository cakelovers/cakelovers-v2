import { NextResponse } from "next/server"
import { APIError, APIConnectionTimeoutError } from "openai"
import { generateCakePreview } from "@/lib/openai/generate-cake-preview"
import { checkRateLimit, getClientKey, RATE_LIMIT_MAX_REQUESTS_PER_WINDOW } from "@/lib/ai/rate-limit"
import { errorResponse } from "@/lib/api-error"

const MIN_DESCRIPTION_LENGTH = 10
const MAX_DESCRIPTION_LENGTH = 500

// Stateless text-to-image endpoint for Flow B (AI 오더메이드). No Supabase
// reads/writes here — nothing generated here is persisted until the
// customer's eventually-selected candidate is submitted with the order.
// Rate-limited per client IP: this calls a paid OpenAI endpoint, and the
// customer-facing UI explicitly invites repeated regeneration (the AI
// preview is "mood reference only"), so an enforced cap is what actually
// keeps that invitation from becoming an open bill — the UI's remaining-
// count display reads from this same limit, not a separate number.
export async function POST(request: Request) {
  const clientKey = getClientKey(request)
  const { allowed, remaining } = checkRateLimit(clientKey)
  if (!allowed) {
    return errorResponse(
      429,
      "rate_limited",
      `지금은 미리보기 생성 한도(시간당 ${RATE_LIMIT_MAX_REQUESTS_PER_WINDOW}회)에 도달했어요 — 잠시 후 다시 시도해 주세요.`
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "요청 형식이 올바르지 않습니다.")
  }

  const description = (body as { description?: unknown } | null)?.description
  if (typeof description !== "string") {
    return errorResponse(400, "invalid_description", "디자인 설명이 필요합니다.")
  }

  const trimmed = description.trim()
  if (trimmed.length < MIN_DESCRIPTION_LENGTH) {
    return errorResponse(400, "description_too_short", `케이크 설명을 ${MIN_DESCRIPTION_LENGTH}자 이상 입력해 주세요.`)
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return errorResponse(400, "description_too_long", `설명은 ${MAX_DESCRIPTION_LENGTH}자 이하로 입력해 주세요.`)
  }

  try {
    const result = await generateCakePreview(trimmed)
    return NextResponse.json({ ...result, remaining })
  } catch (error) {
    if (error instanceof APIConnectionTimeoutError) {
      return errorResponse(504, "timeout", "미리보기 생성 시간이 너무 오래 걸렸습니다. 다시 시도해 주세요.")
    }
    if (error instanceof APIError) {
      console.error("[ai-preview] OpenAI API error", error.status, error.message)
      if (error.status === 429) {
        return errorResponse(429, "upstream_rate_limited", "지금은 미리보기 서비스가 혼잡합니다 — 잠시 후 다시 시도해 주세요.")
      }
      if (error.status === 400) {
        return errorResponse(400, "rejected_prompt", "이 설명으로는 미리보기를 생성할 수 없습니다 — 다르게 표현해 보세요.")
      }
      return errorResponse(502, "upstream_error", "지금은 미리보기를 생성할 수 없습니다. 다시 시도해 주세요.")
    }
    console.error("[ai-preview] unexpected error", error)
    return errorResponse(500, "unknown_error", "문제가 발생했습니다. 다시 시도해 주세요.")
  }
}
