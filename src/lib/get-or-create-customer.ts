import type { SupabaseClient } from "@supabase/supabase-js"

// Runs on the customer's own session (RLS-authorized), not service-role —
// both order-creation routes call this with the client from
// createClient() (src/lib/supabase/server.ts).
export async function getOrCreateCustomer(
  supabase: SupabaseClient,
  storeId: string,
  authUserId: string,
  name: string,
  phone: string
): Promise<{ customerId: string } | { error: string }> {
  const { data: existing, error: existingError } = await supabase
    .from("customers")
    .select("id")
    .eq("store_id", storeId)
    .eq("auth_user_id", authUserId)
    .maybeSingle()

  if (existingError) {
    return { error: "고객 정보를 확인하지 못했습니다. 다시 시도해 주세요." }
  }
  if (existing) {
    return { customerId: existing.id }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("customers")
    .insert({ store_id: storeId, auth_user_id: authUserId, name, phone: phone || null })
    .select("id")
    .single()

  if (insertError || !inserted) {
    return { error: "고객 정보를 생성하지 못했습니다. 다시 시도해 주세요." }
  }
  return { customerId: inserted.id }
}
