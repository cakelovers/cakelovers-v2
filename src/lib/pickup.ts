import { createServiceRoleClient } from "@/lib/supabase/service-role"

interface PickupDayRow {
  weekday: number
  is_enabled: boolean
  opening_time: string | null
  closing_time: string | null
  min_lead_hours: number | null
}

// Validates a requested pickup date/time against the store's own
// configured weekday hours and minimum lead time. Re-run here at
// submission time (not just trusted from whatever the picker UI offered)
// since a stale page or a direct API call could still submit a slot
// that's since become unavailable.
export async function isPickupSlotValid(
  storeId: string,
  pickupDate: string, // "YYYY-MM-DD"
  pickupTime: string // "HH:MM"
): Promise<boolean> {
  const serviceRole = createServiceRoleClient()
  const weekday = new Date(`${pickupDate}T00:00:00`).getDay()

  const { data: day } = await serviceRole
    .from("store_pickup_day_settings")
    .select("weekday, is_enabled, opening_time, closing_time, min_lead_hours")
    .eq("store_id", storeId)
    .eq("weekday", weekday)
    .maybeSingle<PickupDayRow>()

  if (!day || !day.is_enabled || !day.opening_time || !day.closing_time) return false

  if (pickupTime < day.opening_time.slice(0, 5) || pickupTime >= day.closing_time.slice(0, 5)) {
    return false
  }

  const leadHours = day.min_lead_hours ?? 24
  const requestedAt = new Date(`${pickupDate}T${pickupTime}:00`)
  const earliestAllowed = new Date(Date.now() + leadHours * 60 * 60 * 1000)

  return requestedAt >= earliestAllowed
}
