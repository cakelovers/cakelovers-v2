import { Suspense } from "react"
import OrderStatusClient from "./status-client"

export default function OrderStatusPage() {
  return (
    <Suspense fallback={<p className="p-10 text-sm text-zinc-500">불러오는 중...</p>}>
      <OrderStatusClient />
    </Suspense>
  )
}
