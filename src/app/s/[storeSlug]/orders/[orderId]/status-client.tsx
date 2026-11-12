"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { STATUS_LABELS_KO, type OrderStatus } from "@/lib/order-status"

interface OrderStatusRow {
  id: string
  order_type: "catalog" | "custom"
  status: OrderStatus
  pickup_date: string
  pickup_time: string
  catalog_design_label: string | null
  price_krw: number | null
  quoted_price_krw: number | null
}

interface PaymentSettings {
  bank_name: string
  bank_account_number: string
  bank_account_holder: string
  payment_instructions: string | null
  payment_deadline_hours: number
}

export default function OrderStatusClient() {
  const { storeSlug, orderId } = useParams<{ storeSlug: string; orderId: string }>()
  const [order, setOrder] = useState<OrderStatusRow | null>(null)
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/stores/${storeSlug}/orders/${orderId}`)
    const body = await res.json()
    if (!res.ok) {
      setError(body?.error?.message ?? "주문을 불러오지 못했습니다.")
      return
    }
    setError(null)
    setOrder(body.order)
  }, [storeSlug, orderId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    if (order?.order_type !== "custom" || order.status === "pricing_pending") return
    fetch(`/api/stores/${storeSlug}/payment-settings`)
      .then((res) => res.json())
      .then((body) => setPaymentSettings(body.settings ?? null))
      .catch(() => setPaymentSettings(null))
  }, [order, storeSlug])

  if (error) return <p className="p-10 text-sm text-red-600">{error}</p>
  if (!order) return <p className="p-10 text-sm text-zinc-500">불러오는 중...</p>

  const amount = order.price_krw ?? order.quoted_price_krw

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-16">
      <h1 className="text-xl font-semibold text-zinc-900">주문 상태</h1>

      <div className="rounded-lg border border-zinc-200 p-4 text-sm">
        <p className="mb-2">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
            {STATUS_LABELS_KO[order.status]}
          </span>
        </p>
        <p>
          <span className="text-zinc-500">주문</span> {order.catalog_design_label ?? "AI 오더메이드 케이크"}
        </p>
        <p>
          <span className="text-zinc-500">픽업</span> {order.pickup_date} {order.pickup_time}
        </p>
        {amount !== null && (
          <p>
            <span className="text-zinc-500">금액</span> {amount.toLocaleString()}원
          </p>
        )}
      </div>

      {order.order_type === "custom" && order.status === "pricing_pending" && (
        <p className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-600">
          사장님이 설명과 참고 사진을 확인하고 있어요. 견적이 등록되면 여기에서 입금 안내를 볼 수 있어요.
        </p>
      )}

      {order.order_type === "custom" && order.status === "payment_pending" && paymentSettings && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">아래 계좌로 입금해 주세요</p>
          <p>
            {paymentSettings.bank_name} {paymentSettings.bank_account_number} ({paymentSettings.bank_account_holder})
          </p>
          <p>입금 기한: 견적 등록 후 {paymentSettings.payment_deadline_hours}시간 이내</p>
          {paymentSettings.payment_instructions && <p>{paymentSettings.payment_instructions}</p>}
        </div>
      )}
    </div>
  )
}
