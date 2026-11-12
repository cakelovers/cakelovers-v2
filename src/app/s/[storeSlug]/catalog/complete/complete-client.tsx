"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"

type Result = { ok: true } | { ok: false; message: string }

// Toss redirects the browser back here after checkout with
// {orderId, paymentKey, amount} as query params (success) or an error
// code (failure). This page's only job is to call /payments/confirm,
// which is the actual trust boundary (re-verifies amount against the
// order's own stored price before ever touching Toss's confirm API) —
// nothing here is treated as already paid just because Toss redirected.
export default function CatalogCompleteClient() {
  const { storeSlug } = useParams<{ storeSlug: string }>()
  const searchParams = useSearchParams()
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    const orderId = searchParams.get("orderId")
    const paymentKey = searchParams.get("paymentKey")
    const amountRaw = searchParams.get("amount")
    const failureMessage = searchParams.get("message")

    if (failureMessage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading this result from the redirect URL *is* the synchronization this effect exists for
      setResult({ ok: false, message: failureMessage })
      return
    }
    if (!orderId || !paymentKey || !amountRaw) {
      setResult({ ok: false, message: "결제 정보가 올바르지 않습니다." })
      return
    }

    fetch(`/api/stores/${storeSlug}/payments/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, paymentKey, amount: Number(amountRaw) }),
    })
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) {
          setResult({ ok: false, message: body?.error?.message ?? "결제를 확인하지 못했습니다." })
          return
        }
        setResult({ ok: true })
      })
      .catch(() => setResult({ ok: false, message: "결제 확인 중 문제가 발생했습니다." }))
  }, [searchParams, storeSlug])

  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      {result === null && <p className="text-sm text-zinc-500">결제를 확인하는 중입니다...</p>}
      {result?.ok === true && (
        <>
          <h1 className="text-xl font-semibold text-zinc-900">주문이 완료되었습니다</h1>
          <p className="text-sm text-zinc-500">결제가 정상적으로 처리되었어요. 픽업 시간에 맞춰 준비해 드릴게요.</p>
        </>
      )}
      {result?.ok === false && (
        <>
          <h1 className="text-xl font-semibold text-red-600">결제를 완료하지 못했습니다</h1>
          <p className="text-sm text-zinc-500">{result.message}</p>
        </>
      )}
    </div>
  )
}
