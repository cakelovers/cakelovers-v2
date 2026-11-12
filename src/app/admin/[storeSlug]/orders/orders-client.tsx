"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { STATUS_LABELS_KO, ORDER_STATUSES, type OrderStatus } from "@/lib/order-status"

interface OrderListRow {
  id: string
  order_type: "catalog" | "custom"
  status: OrderStatus
  pickup_date: string
  pickup_time: string
  catalog_design_label: string | null
  price_krw: number | null
  quoted_price_krw: number | null
  created_at: string
}

export default function AdminOrdersClient() {
  const { storeSlug } = useParams<{ storeSlug: string }>()
  const [orders, setOrders] = useState<OrderListRow[] | null>(null)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("")
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const url = new URL(`/api/admin/stores/${storeSlug}/orders`, window.location.origin)
    if (statusFilter) url.searchParams.set("status", statusFilter)

    const res = await fetch(url.toString())
    const body = await res.json()

    if (!res.ok) {
      setError(body?.error?.message ?? "주문 목록을 불러오지 못했습니다.")
      setOrders([])
      return
    }

    setError(null)
    setOrders(body.orders)
  }, [storeSlug, statusFilter])

  useEffect(() => {
    // Intentional data-fetch-on-mount effect; load()'s setState calls only
    // run after its internal awaits resolve, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">주문 관리</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "")}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        >
          <option value="">전체 상태</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS_KO[s]}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {orders === null ? (
        <p className="text-sm text-zinc-500">불러오는 중...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-zinc-500">해당하는 주문이 없습니다.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-2">유형</th>
                <th className="px-4 py-2">내용</th>
                <th className="px-4 py-2">픽업</th>
                <th className="px-4 py-2">금액</th>
                <th className="px-4 py-2">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/${storeSlug}/orders/${o.id}`} className="block">
                      {o.order_type === "catalog" ? "기존 케이크" : "AI 오더메이드"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/${storeSlug}/orders/${o.id}`} className="block">
                      {o.catalog_design_label ?? "커스텀 디자인"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {o.pickup_date} {o.pickup_time}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {(o.price_krw ?? o.quoted_price_krw)?.toLocaleString() ?? "-"}원
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                      {STATUS_LABELS_KO[o.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
