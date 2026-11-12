"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// Staff sign-in. There is no self-serve staff signup anywhere in this
// app — a store_members row has to be created directly in Supabase
// (by a developer/operator) before a given auth user can see anything
// under /admin for that store. This page only authenticates; it does
// not grant access on its own.
export default function AdminLoginPage() {
  const router = useRouter()
  const [storeSlug, setStoreSlug] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    setSubmitting(false)

    if (signInError) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.")
      return
    }

    router.push(`/admin/${storeSlug.trim()}/orders`)
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-zinc-900">사장님 로그인</h1>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700">매장 URL (slug)</label>
          <input
            required
            value={storeSlug}
            onChange={(e) => setStoreSlug(e.target.value)}
            placeholder="my-store"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700">이메일</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700">비밀번호</label>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  )
}
