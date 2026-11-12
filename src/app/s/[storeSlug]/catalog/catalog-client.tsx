"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Script from "next/script"
import { ensureAnonymousSession } from "@/lib/supabase/ensure-session"

interface CatalogDesign {
  id: string
  label: string
  priceKrw: number
  imageUrl: string
}

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      payment: (opts: { customerKey: string }) => {
        requestPayment: (opts: Record<string, unknown>) => Promise<void>
      }
    }
  }
}

const MAX_CAKE_MESSAGE_LENGTH = 50

export default function CatalogOrderClient() {
  const { storeSlug } = useParams<{ storeSlug: string }>()
  const [designs, setDesigns] = useState<CatalogDesign[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cakeMessage, setCakeMessage] = useState("")
  const [pickupDate, setPickupDate] = useState("")
  const [pickupTime, setPickupTime] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [customerNote, setCustomerNote] = useState("")
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [tossReady, setTossReady] = useState(false)

  useEffect(() => {
    ensureAnonymousSession().catch((e) => setError(e instanceof Error ? e.message : "세션을 시작하지 못했습니다."))
    fetch(`/api/stores/${storeSlug}/catalog-designs`)
      .then((res) => res.json())
      .then((body) => setDesigns(body.designs ?? []))
      .catch(() => setError("디자인을 불러오지 못했습니다."))
  }, [storeSlug])

  const selected = designs?.find((d) => d.id === selectedId) ?? null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!selected) return setError("디자인을 선택해 주세요.")
    if (!pickupDate || !pickupTime) return setError("픽업 날짜와 시간을 선택해 주세요.")
    if (!name || !phone) return setError("이름과 전화번호를 입력해 주세요.")
    if (!consent) return setError("개인정보처리방침에 동의해 주세요.")
    if (!tossReady || !window.TossPayments) return setError("결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.")

    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
    if (!clientKey) return setError("결제 모듈이 설정되지 않았습니다. 매장에 문의해 주세요.")

    setSubmitting(true)

    const orderId = crypto.randomUUID()
    const form = new FormData()
    form.set("orderId", orderId)
    form.set("catalogDesignId", selected.id)
    form.set("cakeMessage", cakeMessage)
    form.set("pickupDate", pickupDate)
    form.set("pickupTime", pickupTime)
    form.set("name", name)
    form.set("phone", phone)
    form.set("customerNote", customerNote)
    form.set("privacyConsentAccepted", "true")

    try {
      const res = await fetch(`/api/stores/${storeSlug}/orders/catalog`, { method: "POST", body: form })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error?.message ?? "주문을 제출하지 못했습니다.")
        setSubmitting(false)
        return
      }

      const tossPayments = window.TossPayments(clientKey)
      const payment = tossPayments.payment({ customerKey: orderId })
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: body.priceKrw },
        orderId: body.orderId,
        orderName: selected.label,
        successUrl: `${window.location.origin}/s/${storeSlug}/catalog/complete`,
        failUrl: `${window.location.origin}/s/${storeSlug}/catalog/complete`,
      })
    } catch (err) {
      console.error(err)
      setError("결제 진행 중 문제가 발생했습니다. 다시 시도해 주세요.")
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Script src="https://js.tosspayments.com/v2/standard" onLoad={() => setTossReady(true)} />

      <h1 className="text-xl font-semibold text-zinc-900">기존 케이크 주문</h1>

      {designs === null ? (
        <p className="text-sm text-zinc-500">디자인을 불러오는 중...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {designs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedId(d.id)}
              className={`overflow-hidden rounded-lg border text-left ${
                selectedId === d.id ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.imageUrl} alt={d.label} className="h-32 w-full object-cover" />
              <div className="p-2">
                <p className="text-sm font-medium text-zinc-900">{d.label}</p>
                <p className="text-sm text-zinc-500">{d.priceKrw.toLocaleString()}원</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700">케이크 문구 (선택)</label>
          <input
            value={cakeMessage}
            onChange={(e) => setCakeMessage(e.target.value.slice(0, MAX_CAKE_MESSAGE_LENGTH))}
            placeholder="예: Happy Birthday!"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-zinc-400">
            {cakeMessage.length}/{MAX_CAKE_MESSAGE_LENGTH}자 — 디자인은 고정이며, 문구만 바꿀 수 있어요.
          </p>
          {cakeMessage && (
            <p className="mt-2 rounded-md bg-zinc-50 p-2 text-sm text-zinc-600">미리보기: &ldquo;{cakeMessage}&rdquo;</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700">픽업 날짜</label>
            <input
              type="date"
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">픽업 시간</label>
            <input
              type="time"
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700">이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">전화번호</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700">추가 메모 (선택)</label>
          <textarea
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          개인정보처리방침에 동의합니다.
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "결제 진행 중..." : selected ? `${selected.priceKrw.toLocaleString()}원 결제하기` : "결제하기"}
        </button>
      </form>
    </div>
  )
}
