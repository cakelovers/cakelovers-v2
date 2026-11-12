import { getEnv } from "@/lib/env"

export interface TossPayment {
  paymentKey: string
  orderId: string
  status: string // "DONE" | "CANCELED" | "IN_PROGRESS" | ...
  totalAmount: number
  method: string | null
}

function tossAuthHeader(): string {
  return `Basic ${Buffer.from(`${getEnv().TOSS_SECRET_KEY}:`).toString("base64")}`
}

// The authoritative re-check. Toss's webhook payload is only a trigger to
// look again — this is the actual source of truth, fetched server-to-
// server with our own secret key, never the webhook body's own status
// field. Used by both the webhook route and anywhere else that needs to
// confirm a payment's real state.
export async function fetchTossPaymentByOrderId(orderId: string): Promise<TossPayment | null> {
  const res = await fetch(`https://api.tosspayments.com/v1/payments/orders/${orderId}`, {
    headers: { Authorization: tossAuthHeader() },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(`[toss] payment lookup failed (${res.status}): ${body?.message ?? "unknown error"}`)
  }
  return res.json()
}
