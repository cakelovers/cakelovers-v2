import { createServiceRoleClient } from "@/lib/supabase/service-role"

export interface StoreRow {
  id: string
  timezone: string
}

// Public, customer-facing store resolution — goes through the
// service-role client since there's no customer session to authorize an
// anon RLS policy against (see migration 0002's RLS convention notes).
export async function getActiveStoreBySlug(storeSlug: string): Promise<StoreRow | null> {
  const serviceRole = createServiceRoleClient()

  const { data } = await serviceRole
    .from("stores")
    .select("id, timezone")
    .eq("slug", storeSlug)
    .eq("is_active", true)
    .maybeSingle<StoreRow>()

  return data
}
