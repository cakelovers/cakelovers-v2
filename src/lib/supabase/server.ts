import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getEnv } from "@/lib/env"

export async function createClient() {
  const env = getEnv()
  const cookieStore = await cookies()

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component that can't set cookies directly —
          // safe to ignore as long as middleware.ts is refreshing sessions.
        }
      },
    },
  })
}
