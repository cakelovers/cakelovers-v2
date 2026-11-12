"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { STATUS_LABELS_KO, VALID_STATUS_TRANSITIONS, type OrderStatus } from "@/lib/order-status"

interface OrderDetail {
  id: string
  order_type: "catalog" | "custom"
  status: OrderStatus
  pickup_date: string
  pickup_time: string
  cake_message: string | null
  catalog_design_label: string | null
  price_krw: number | null
  description: string | null
  aiPreviewUrl: string | null
  ai_preview_prompt: string | null
  quoted_price_krw: number | null
  customer_note: string | null
  payment_provider: string | null
  payment_method: string | null
  paid_at: string | null
  customer: { name: string; phone: string | null } | null
}

interface ReferenceImage {
  position: number
  imageUrl: string
}

export default function AdminOrderDetailClient() {
  const { storeSlug, orderId } = useParams<{ storeSlug: string; orderId: string }>()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [quoteInput, setQuoteInput] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/stores/${storeSlug}/orders/${orderId}`)
    const body = await res.json()
    if (!res.ok) {
      setError(body?.error?.message ?? "주문을 불러오지 못했습니다.")
      return
    }
    setError(null)
    setOrder(body.order)
    setReferenceImages(body.referenceImages ?? [])
  }, [storeSlug, orderId])

  useEffect(() => {
    // Intentional data-fetch-on-mount effect; load()'s setState calls only
    // run after its internal awaits resolve, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function submitQuote() {
    const quotedPriceKrw = Number(quoteInput)
    if (!Number.isInteger(quotedPriceKrw) || quotedPriceKrw <= 0) {
      setError("견적 금액을 올바르게 입력해 주세요.")
      return
    }
    setBusy(true)
    const res = await fetch(`/api/admin/stores/${storeSlug}/orders/${orderId}/quote`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotedPriceKrw }),
    })
    const body = await res.json()
    setBusy(false)
    if (!res.ok) {
      setError(body?.error?.message ?? "견적을 등록하지 못했습니다.")
      return
    }
    load()
  }

  async function transitionTo(nextStatus: OrderStatus) {
    setBusy(true)
    const res = await fetch(`/api/admin/stores/${storeSlug}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    })
    const body = await res.json()
    setBusy(false)
    if (!res.ok) {
      setError(body?.error?.message ?? "상태를 변경하지 못했습니다.")
      return
    }
    load()
  }

  if (error && !order) return <p className="p-10 text-sm text-red-600">{error}</p>
  if (!order) return <p className="p-10 text-sm text-zinc-500">불러오는 중...</p>

  const nextStatuses = VALID_STATUS_TRANSITIONS[order.status]

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">
          {order.order_type === "catalog" ? "기존 케이크 주문" : "AI 오더메이드 주문"}
        </h1>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700">
          {STATUS_LABELS_KO[order.status]}
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-2 rounded-lg border border-zinc-200 p-4 text-sm">
        <p>
          <span className="text-zinc-500">고객</span> {order.customer?.name ?? "-"} ({order.customer?.phone ?? "-"})
        </p>
        <p>
          <span className="text-zinc-500">픽업</span> {order.pickup_date} {order.pickup_time}
        </p>
        {order.customer_note && (
          <p>
            <span className="text-zinc-500">메모</span> {order.customer_note}
          </p>
        )}
      </section>

      {order.order_type === "catalog" ? (
        <section className="space-y-2 rounded-lg border border-zinc-200 p-4 text-sm">
          <p>
            <span className="text-zinc-500">디자인</span> {order.catalog_design_label}
          </p>
          <p>
            <span className="text-zinc-500">금액</span> {order.price_krw?.toLocaleString()}원
          </p>
          {order.cake_message && (
            <p>
              <span className="text-zinc-500">케이크 문구</span> &ldquo;{order.cake_message}&rdquo;
            </p>
          )}
          {order.payment_provider && (
            <p className="text-zinc-500">
              결제: {order.payment_provider} / {order.payment_method ?? "-"} / {order.paid_at ?? "미결제"}
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 text-sm">
          <p>
            <span className="text-zinc-500">고객 설명</span> {order.description}
          </p>

          <div>
            <p className="mb-1 text-zinc-500">
              AI 미리보기 — 분위기 참고용입니다. 실제 제작은 아래 고객 참고 사진을 기준으로 진행해 주세요.
            </p>
            {order.aiPreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={order.aiPreviewUrl} alt="AI 미리보기" className="h-40 w-40 rounded-md object-cover" />
            )}
          </div>

          {referenceImages.length > 0 && (
            <div>
              <p className="mb-1 text-zinc-500">고객 참고 사진 (제작 기준)</p>
              <div className="flex gap-2">
                {referenceImages.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.position}
                    src={img.imageUrl}
                    alt={`참고 사진 ${img.position}`}
                    className="h-40 w-40 rounded-md object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {order.status === "pricing_pending" ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs text-zinc-500">견적 금액 (원)</label>
                <input
                  value={quoteInput}
                  onChange={(e) => setQuoteInput(e.target.value)}
                  placeholder="45000"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={submitQuote}
                disabled={busy}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                견적 등록
              </button>
            </div>
          ) : (
            <p>
              <span className="text-zinc-500">견적 금액</span> {order.quoted_price_krw?.toLocaleString() ?? "-"}원
            </p>
          )}
        </section>
      )}

      {nextStatuses.length > 0 && (
        <section className="flex flex-wrap gap-2">
          {nextStatuses.map((s) => (
            <button
              key={s}
              onClick={() => transitionTo(s)}
              disabled={busy}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              {STATUS_LABELS_KO[s]}로 변경
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
