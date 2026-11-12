import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

export interface AdminStore {
  id: string
  timezone: string
}

export type RequireStoreMemberResult =
  | { ok: true; supabase: SupabaseClient; store: AdminStore; userId: string }
  | { ok: false; status: number; code: string; message: string }

// Admin routes run on the staff member's own session (not service-role):
// the "members can view their own store" RLS policy (0002_core_rls.sql)
// is what actually decides whether this slug resolves for this user, so
// a non-member gets the same "not found" as a non-existent slug — no
// membership check is duplicated in application code, RLS is the one
// source of truth for it.
export async function requireStoreMember(storeSlug: string): Promise<RequireStoreMemberResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, status: 401, code: "not_authenticated", message: "로그인이 필요합니다." }
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, timezone")
    .eq("slug", storeSlug)
    .maybeSingle<AdminStore>()

  if (storeError) {
    return { ok: false, status: 500, code: "store_lookup_failed", message: "매장 정보를 불러오지 못했습니다." }
  }
  if (!store) {
    return { ok: false, status: 404, code: "store_not_found", message: "매장을 찾을 수 없거나 접근 권한이 없습니다." }
  }

  return { ok: true, supabase, store, userId: user.id }
}
