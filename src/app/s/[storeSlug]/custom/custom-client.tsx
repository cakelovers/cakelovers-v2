"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { ensureAnonymousSession } from "@/lib/supabase/ensure-session"

const MIN_DESCRIPTION_LENGTH = 10
const MAX_DESCRIPTION_LENGTH = 500
const MAX_REFERENCE_IMAGES = 3

interface PreviewState {
  image: string // data URL
  prompt: string
  storagePath: string | null // set once uploaded via ai-preview/save
}

export default function CustomOrderClient() {
  const { storeSlug } = useParams<{ storeSlug: string }>()
  const orderId = useMemo(() => crypto.randomUUID(), [])

  const [description, setDescription] = useState("")
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)

  const [referenceFiles, setReferenceFiles] = useState<(File | null)[]>([null, null, null])
  const [referencePaths, setReferencePaths] = useState<(string | null)[]>([null, null, null])
  const [uploadingPosition, setUploadingPosition] = useState<number | null>(null)

  const [pickupDate, setPickupDate] = useState("")
  const [pickupTime, setPickupTime] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [customerNote, setCustomerNote] = useState("")
  const [consent, setConsent] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    ensureAnonymousSession().catch((e) => setError(e instanceof Error ? e.message : "세션을 시작하지 못했습니다."))
  }, [])

  async function generatePreview() {
    setError(null)
    if (description.trim().length < MIN_DESCRIPTION_LENGTH) {
      return setError(`케이크 설명을 ${MIN_DESCRIPTION_LENGTH}자 이상 입력해 주세요.`)
    }

    setGenerating(true)
    try {
      const res = await fetch(`/api/stores/${storeSlug}/ai-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error?.message ?? "미리보기를 생성하지 못했습니다.")
        return
      }
      setPreview({ image: body.image, prompt: body.prompt, storagePath: null })
      setRemaining(body.remaining ?? null)
    } finally {
      setGenerating(false)
    }
  }

  async function uploadReferenceFile(position: number, file: File) {
    setUploadingPosition(position)
    setError(null)
    try {
      const form = new FormData()
      form.set("orderId", orderId)
      form.set("position", String(position))
      form.set("file", file)
      const res = await fetch(`/api/stores/${storeSlug}/reference-images/save`, { method: "POST", body: form })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error?.message ?? "참고 사진을 업로드하지 못했습니다.")
        return
      }
      setReferenceFiles((prev) => prev.map((f, i) => (i === position - 1 ? file : f)))
      setReferencePaths((prev) => prev.map((p, i) => (i === position - 1 ? body.storagePath : p)))
    } finally {
      setUploadingPosition(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!preview) return setError("먼저 AI 미리보기를 생성해 주세요.")
    if (!pickupDate || !pickupTime) return setError("픽업 날짜와 시간을 선택해 주세요.")
    if (!name || !phone) return setError("이름과 전화번호를 입력해 주세요.")
    if (!consent) return setError("개인정보처리방침에 동의해 주세요.")

    setSubmitting(true)
    try {
      let previewStoragePath = preview.storagePath
      if (!previewStoragePath) {
        const res = await fetch(`/api/stores/${storeSlug}/ai-preview/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, previewImage: preview.image }),
        })
        const body = await res.json()
        if (!res.ok) {
          setError(body?.error?.message ?? "미리보기 저장에 실패했습니다.")
          return
        }
        previewStoragePath = body.storagePath
      }

      const form = new FormData()
      form.set("orderId", orderId)
      form.set("description", description.trim())
      form.set("previewStoragePath", previewStoragePath!)
      form.set("previewPrompt", preview.prompt)
      form.set("pickupDate", pickupDate)
      form.set("pickupTime", pickupTime)
      form.set("name", name)
      form.set("phone", phone)
      form.set("customerNote", customerNote)
      form.set("privacyConsentAccepted", "true")
      referencePaths.forEach((path, i) => {
        if (path) form.set(`reference_${i + 1}_path`, path)
      })

      const res = await fetch(`/api/stores/${storeSlug}/orders/custom`, { method: "POST", body: form })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error?.message ?? "주문을 제출하지 못했습니다.")
        return
      }
      setDone(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-900">요청이 접수되었습니다</h1>
        <p className="text-sm text-zinc-500">
          사장님이 설명과 참고 사진을 확인하고 견적을 보내드려요. 견적이 도착하면 안내된 계좌로 입금해 주시면 됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-4 py-10 sm:grid-cols-2">
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-zinc-900">AI 오더메이드 케이크</h1>

        <div>
          <label className="block text-sm font-medium text-zinc-700">원하는 케이크를 설명해 주세요</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
            rows={4}
            placeholder="예: 파스텔톤 장미 케이크, 상단에 작은 곰돌이 토퍼"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-zinc-400">{description.length}/{MAX_DESCRIPTION_LENGTH}자</p>
        </div>

        <button
          type="button"
          onClick={generatePreview}
          disabled={generating}
          className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          {generating ? "생성 중..." : preview ? "다시 생성하기" : "AI 미리보기 생성"}
        </button>

        <p className="rounded-md bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          AI 미리보기는 <strong>분위기 참고용</strong>이에요. 실제 제작은 사장님이 위 설명과{" "}
          <strong>아래에 업로드하신 참고 사진</strong>을 직접 보고 진행합니다.
          {remaining !== null && <> (시간당 미리보기 생성 {remaining}회 남음)</>}
        </p>

        <div>
          <label className="block text-sm font-medium text-zinc-700">
            참고 사진 (최대 {MAX_REFERENCE_IMAGES}장, 선택)
          </label>
          <p className="mt-0.5 text-xs text-zinc-400">AI 생성에는 쓰이지 않고, 사장님이 제작 시 직접 참고합니다.</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <label
                key={i}
                className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-zinc-300 text-xs text-zinc-400"
              >
                {referenceFiles[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={URL.createObjectURL(referenceFiles[i]!)}
                    alt={`참고 사진 ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : uploadingPosition === i + 1 ? (
                  "업로드 중..."
                ) : (
                  `+ 사진 ${i + 1}`
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) uploadReferenceFile(i + 1, file)
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="sticky top-4 space-y-3">
          <p className="text-sm font-medium text-zinc-700">미리보기</p>
          <div className="flex aspect-square items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.image} alt="AI 생성 미리보기" className="h-full w-full rounded-lg object-cover" />
            ) : (
              <p className="px-6 text-center text-sm text-zinc-400">설명을 입력하고 미리보기를 생성해 보세요</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="전화번호"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <textarea
              placeholder="추가 메모 (선택)"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              개인정보처리방침에 동의합니다.
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "제출 중..." : "요청 제출하고 견적 받기"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
