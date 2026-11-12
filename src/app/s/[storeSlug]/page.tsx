import Link from "next/link"

// Entry screen. Both flows get equal visual/structural weight — neither
// is the "default" — per the approved UX/IA decision.
//
// The only dynamic data here is the storeSlug route param itself (used
// only to build two links, no fetch/cookies access), so there's nothing
// worth prerendering a static shell around — opt out of cacheComponents'
// prerendering rather than wrapping this in a Suspense boundary.
export const instant = false
export default async function StoreEntryPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>
}) {
  const { storeSlug } = await params

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <h1 className="text-center text-2xl font-semibold text-zinc-900">주문 방법을 선택해 주세요</h1>

      <div className="grid w-full gap-4 sm:grid-cols-2">
        <Link
          href={`/s/${storeSlug}/catalog`}
          className="flex flex-col items-start gap-2 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-400"
        >
          <span className="text-lg font-medium text-zinc-900">기존 케이크 주문</span>
          <span className="text-sm text-zinc-500">정해진 디자인 중에서 바로 선택하고, 바로 결제해요.</span>
        </Link>

        <Link
          href={`/s/${storeSlug}/custom`}
          className="flex flex-col items-start gap-2 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-400"
        >
          <span className="text-lg font-medium text-zinc-900">AI 오더메이드 케이크</span>
          <span className="text-sm text-zinc-500">원하는 디자인을 설명하고, 사장님의 수제 견적을 받아요.</span>
        </Link>
      </div>
    </div>
  )
}
