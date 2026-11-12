import { Suspense } from "react"
import AdminOrderDetailClient from "./order-detail-client"

export default function AdminOrderDetailPage() {
  return (
    <Suspense fallback={<p className="p-10 text-sm text-zinc-500">불러오는 중...</p>}>
      <AdminOrderDetailClient />
    </Suspense>
  )
}
