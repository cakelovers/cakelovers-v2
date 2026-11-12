import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getActiveStoreBySlug } from "@/lib/get-store"
import { errorResponse } from "@/lib/api-error"

// Public — Flow B only. Shown to a customer once their order has been
// quoted, so they know where to transfer to. Service-role read, same
// convention as catalog-designs/route.ts: there's no customer session to
// authorize an anon RLS policy against for a store-wide settings row.
export async function GET(_request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params
  const store = await getActiveStoreBySlug(storeSlug)
  if (!store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  const serviceRole = createServiceRoleClient()
  const { data: settings } = await serviceRole
    .from("store_payment_settings")
    .select("bank_name, bank_account_number, bank_account_holder, payment_instructions, payment_deadline_hours")
    .eq("store_id", store.id)
    .maybeSingle()

  return NextResponse.json({ settings: settings ?? null })
}
