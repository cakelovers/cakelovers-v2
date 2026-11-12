import { Suspense } from "react"
import CustomOrderClient from "./custom-client"

export default function CustomOrderPage() {
  return (
    <Suspense fallback={<p className="p-10 text-sm text-zinc-500">불러오는 중...</p>}>
      <CustomOrderClient />
    </Suspense>
  )
}
