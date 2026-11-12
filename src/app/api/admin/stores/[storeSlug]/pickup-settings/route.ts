import { NextResponse } from "next/server"
import { requireStoreMember } from "@/lib/admin/require-store-member"
import { errorResponse } from "@/lib/api-error"

interface DaySetting {
  weekday: number
  isEnabled: boolean
  openingTime: string | null
  closingTime: string | null
  minLeadHours: number | null
}

const VALID_INTERVALS = [15, 30, 60]

// Shared by both flows (see 0007_pickup_scheduling.sql) — one interval
// setting plus one row per weekday (0=Sun..6=Sat). GET always returns
// exactly 7 day entries, filling in a disabled default for any weekday
// that has no row yet, so the admin UI never has to special-case "not
// configured yet" itself.
export async function GET(_request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  const [{ data: interval }, { data: days, error: daysError }] = await Promise.all([
    auth.supabase
      .from("store_pickup_settings")
      .select("pickup_interval_minutes")
      .eq("store_id", auth.store.id)
      .maybeSingle(),
    auth.supabase
      .from("store_pickup_day_settings")
      .select("weekday, is_enabled, opening_time, closing_time, min_lead_hours")
      .eq("store_id", auth.store.id),
  ])

  if (daysError) {
    console.error("[admin/pickup-settings] load failed", daysError)
    return errorResponse(500, "pickup_settings_load_failed", "픽업 설정을 불러오지 못했습니다.")
  }

  const byWeekday = new Map((days ?? []).map((d) => [d.weekday, d]))
  const fullWeek: DaySetting[] = Array.from({ length: 7 }, (_, weekday) => {
    const row = byWeekday.get(weekday)
    return {
      weekday,
      isEnabled: row?.is_enabled ?? false,
      openingTime: row?.opening_time ?? null,
      closingTime: row?.closing_time ?? null,
      minLeadHours: row?.min_lead_hours ?? 24,
    }
  })

  return NextResponse.json({
    pickupIntervalMinutes: interval?.pickup_interval_minutes ?? 30,
    days: fullWeek,
  })
}

export async function PUT(request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params
  const auth = await requireStoreMember(storeSlug)
  if (!auth.ok) return errorResponse(auth.status, auth.code, auth.message)

  let body: { pickupIntervalMinutes?: unknown; days?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "요청 형식이 올바르지 않습니다.")
  }

  const pickupIntervalMinutes = body.pickupIntervalMinutes
  if (typeof pickupIntervalMinutes !== "number" || !VALID_INTERVALS.includes(pickupIntervalMinutes)) {
    return errorResponse(400, "invalid_interval", "픽업 간격은 15, 30, 60분 중 하나여야 합니다.")
  }

  if (!Array.isArray(body.days) || body.days.length !== 7) {
    return errorResponse(400, "invalid_days", "요일별 설정이 올바르지 않습니다.")
  }

  const dayRows: Record<string, unknown>[] = []
  for (const raw of body.days as unknown[]) {
    const day = raw as Partial<DaySetting>
    if (
      typeof day.weekday !== "number" ||
      day.weekday < 0 ||
      day.weekday > 6 ||
      typeof day.isEnabled !== "boolean"
    ) {
      return errorResponse(400, "invalid_days", "요일별 설정이 올바르지 않습니다.")
    }
    if (day.isEnabled) {
      if (
        typeof day.openingTime !== "string" ||
        typeof day.closingTime !== "string" ||
        !/^\d{2}:\d{2}$/.test(day.openingTime) ||
        !/^\d{2}:\d{2}$/.test(day.closingTime) ||
        day.openingTime >= day.closingTime
      ) {
        return errorResponse(400, "invalid_day_hours", "영업시간을 올바르게 입력해 주세요.")
      }
    }
    const minLeadHours = typeof day.minLeadHours === "number" && day.minLeadHours >= 0 ? day.minLeadHours : 24

    dayRows.push({
      store_id: auth.store.id,
      weekday: day.weekday,
      is_enabled: day.isEnabled,
      opening_time: day.isEnabled ? day.openingTime : null,
      closing_time: day.isEnabled ? day.closingTime : null,
      min_lead_hours: minLeadHours,
    })
  }

  const [{ error: intervalError }, { error: daysError }] = await Promise.all([
    auth.supabase
      .from("store_pickup_settings")
      .upsert({ store_id: auth.store.id, pickup_interval_minutes: pickupIntervalMinutes }, { onConflict: "store_id" }),
    auth.supabase.from("store_pickup_day_settings").upsert(dayRows, { onConflict: "store_id,weekday" }),
  ])

  if (intervalError || daysError) {
    console.error("[admin/pickup-settings] save failed", intervalError ?? daysError)
    return errorResponse(500, "pickup_settings_save_failed", "픽업 설정을 저장하지 못했습니다.")
  }

  return NextResponse.json({ ok: true })
}
