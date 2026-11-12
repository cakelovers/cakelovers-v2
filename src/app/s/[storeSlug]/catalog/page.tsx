import { Suspense } from "react"
import CatalogOrderClient from "./catalog-client"

export default function CatalogOrderPage() {
  return (
    <Suspense fallback={<p className="p-10 text-sm text-zinc-500">불러오는 중...</p>}>
      <CatalogOrderClient />
    </Suspense>
  )
}
