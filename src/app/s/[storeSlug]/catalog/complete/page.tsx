import { Suspense } from "react"
import CatalogCompleteClient from "./complete-client"

export default function CatalogCompletePage() {
  return (
    <Suspense fallback={<p className="p-10 text-sm text-zinc-500">결제를 확인하는 중입니다...</p>}>
      <CatalogCompleteClient />
    </Suspense>
  )
}
