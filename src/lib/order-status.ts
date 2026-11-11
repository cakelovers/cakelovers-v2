// Shared order status machine — ONE pipeline, two entry paths. order_type
// decides which transitions are reachable and whether payment confirmation
// is automatic (Flow A, gateway webhook) or manual (Flow B, store owner).

export const ORDER_STATUSES = [
  "pricing_pending", // Flow B only — store owner hasn't quoted yet
  "payment_pending", // Flow A starts here directly (price already fixed)
  "paid",
  "making",
  "ready",
  "completed",
  "cancelled",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]
export type OrderType = "catalog" | "custom"

// The initial status an order is created at, by flow.
export function initialStatusFor(orderType: OrderType): OrderStatus {
  return orderType === "catalog" ? "payment_pending" : "pricing_pending"
}

export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pricing_pending: ["payment_pending", "cancelled"],
  payment_pending: ["paid", "cancelled"],
  paid: ["making", "payment_pending", "cancelled"],
  making: ["ready", "paid", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
}

export const STATUS_LABELS_KO: Record<OrderStatus, string> = {
  pricing_pending: "견적 대기",
  payment_pending: "결제 대기",
  paid: "결제 완료",
  making: "제작 중",
  ready: "픽업 대기",
  completed: "완료",
  cancelled: "취소",
}
