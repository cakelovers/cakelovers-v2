import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getActiveStoreBySlug } from "@/lib/get-store"
import { errorResponse } from "@/lib/api-error"

const IMAGE_BUCKET = "catalog-designs"
const SIGNED_URL_TTL_SECONDS = 3600

interface CatalogDesignRow {
  id: string
  label: string
  image_path: string
  price_krw: number
}

// Public — Flow A's Browse screen. Only enabled designs, ordered for
// display. Images live in a private bucket, so each row gets a signed URL
// rather than exposing the raw storage path.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> }
) {
  const { storeSlug } = await params
  const store = await getActiveStoreBySlug(storeSlug)

  if (!store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  const serviceRole = createServiceRoleClient()

  const { data: rows, error } = await serviceRole
    .from("store_catalog_designs")
    .select("id, label, image_path, price_krw")
    .eq("store_id", store.id)
    .eq("is_enabled", true)
    .order("sort_order")
    .returns<CatalogDesignRow[]>()

  if (error) {
    console.error("[catalog-designs] lookup failed", error)
    return errorResponse(500, "catalog_designs_load_failed", "인기 디자인을 불러오지 못했습니다.")
  }

  const designs = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: signed } = await serviceRole.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(row.image_path, SIGNED_URL_TTL_SECONDS)
      return {
        id: row.id,
        label: row.label,
        priceKrw: row.price_krw,
        imageUrl: signed?.signedUrl ?? null,
      }
    })
  )

  return NextResponse.json({
    designs: designs.filter((d) => d.imageUrl !== null),
  })
}
