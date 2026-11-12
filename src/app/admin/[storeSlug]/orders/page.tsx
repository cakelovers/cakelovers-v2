import { Suspense } from "react"
import AdminOrdersClient from "./orders-client"

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<p className="p-10 text-sm text-zinc-500">불러오는 중...</p>}>
      <AdminOrdersClient />
    </Suspense>
  )
}
