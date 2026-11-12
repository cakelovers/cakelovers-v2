import { Suspense } from "react"
import AdminSettingsClient from "./settings-client"

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<p className="p-10 text-sm text-zinc-500">불러오는 중...</p>}>
      <AdminSettingsClient />
    </Suspense>
  )
}
