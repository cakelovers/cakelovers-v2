import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getEnv } from "@/lib/env"

// Server-only. Bypasses Row Level Security entirely — use only in
// explicitly-reviewed code paths. Never import this file into
// client-facing code.
export function createServiceRoleClient() {
  const env = getEnv()
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
