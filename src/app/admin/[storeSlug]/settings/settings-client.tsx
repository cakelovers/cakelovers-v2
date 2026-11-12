"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"

const WEEKDAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"]

interface CatalogDesign {
  id: string
  label: string
  price_krw: number
  is_enabled: boolean
  sort_order: number
  imageUrl: string | null
}

interface PaymentSettings {
  bank_name: string
  bank_account_number: string
  bank_account_holder: string
  payment_instructions: string | null
  payment_deadline_hours: number
}

interface DaySetting {
  weekday: number
  isEnabled: boolean
  openingTime: string | null
  closingTime: string | null
  minLeadHours: number | null
}

export default function AdminSettingsClient() {
  const { storeSlug } = useParams<{ storeSlug: string }>()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // --- Catalog designs ---
  const [designs, setDesigns] = useState<CatalogDesign[] | null>(null)
  const [newLabel, setNewLabel] = useState("")
  const [newPrice, setNewPrice] = useState("")
  const [newFile, setNewFile] = useState<File | null>(null)
  const [creatingDesign, setCreatingDesign] = useState(false)

  const loadDesigns = useCallback(async () => {
    const res = await fetch(`/api/admin/stores/${storeSlug}/catalog-designs`)
    const body = await res.json()
    if (res.ok) setDesigns(body.designs)
  }, [storeSlug])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDesigns()
  }, [loadDesigns])

  async function createDesign(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const priceKrw = Number(newPrice)
    if (!newLabel.trim()) return setError("디자인 이름을 입력해 주세요.")
    if (!Number.isInteger(priceKrw) || priceKrw <= 0) return setError("가격을 올바르게 입력해 주세요.")
    if (!newFile) return setError("이미지를 선택해 주세요.")

    setCreatingDesign(true)
    const form = new FormData()
    form.set("label", newLabel.trim())
    form.set("priceKrw", String(priceKrw))
    form.set("sortOrder", String(designs?.length ?? 0))
    form.set("file", newFile)

    const res = await fetch(`/api/admin/stores/${storeSlug}/catalog-designs`, { method: "POST", body: form })
    const body = await res.json()
    setCreatingDesign(false)
    if (!res.ok) {
      setError(body?.error?.message ?? "디자인을 등록하지 못했습니다.")
      return
    }
    setNewLabel("")
    setNewPrice("")
    setNewFile(null)
    loadDesigns()
  }

  async function toggleDesign(designId: string, isEnabled: boolean) {
    const res = await fetch(`/api/admin/stores/${storeSlug}/catalog-designs/${designId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled }),
    })
    if (res.ok) loadDesigns()
  }

  // --- Payment settings (Flow B) ---
  const [bankName, setBankName] = useState("")
  const [bankAccountNumber, setBankAccountNumber] = useState("")
  const [bankAccountHolder, setBankAccountHolder] = useState("")
  const [paymentInstructions, setPaymentInstructions] = useState("")
  const [paymentDeadlineHours, setPaymentDeadlineHours] = useState("24")
  const [savingPayment, setSavingPayment] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/stores/${storeSlug}/payment-settings`)
      .then((res) => res.json())
      .then((body) => {
        const s: PaymentSettings | null = body.settings
        if (!s) return
        setBankName(s.bank_name)
        setBankAccountNumber(s.bank_account_number)
        setBankAccountHolder(s.bank_account_holder)
        setPaymentInstructions(s.payment_instructions ?? "")
        setPaymentDeadlineHours(String(s.payment_deadline_hours))
      })
  }, [storeSlug])

  async function savePaymentSettings(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSavingPayment(true)
    const res = await fetch(`/api/admin/stores/${storeSlug}/payment-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankName,
        bankAccountNumber,
        bankAccountHolder,
        paymentInstructions,
        paymentDeadlineHours: Number(paymentDeadlineHours),
      }),
    })
    const body = await res.json()
    setSavingPayment(false)
    if (!res.ok) {
      setError(body?.error?.message ?? "결제 설정을 저장하지 못했습니다.")
      return
    }
    setNotice("결제 설정이 저장되었습니다.")
  }

  // --- Pickup settings (shared) ---
  const [pickupIntervalMinutes, setPickupIntervalMinutes] = useState(30)
  const [days, setDays] = useState<DaySetting[] | null>(null)
  const [savingPickup, setSavingPickup] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/stores/${storeSlug}/pickup-settings`)
      .then((res) => res.json())
      .then((body) => {
        setPickupIntervalMinutes(body.pickupIntervalMinutes)
        setDays(body.days)
      })
  }, [storeSlug])

  function updateDay(weekday: number, patch: Partial<DaySetting>) {
    setDays((prev) => prev?.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)) ?? prev)
  }

  async function savePickupSettings() {
    setError(null)
    if (!days) return
    for (const d of days) {
      if (d.isEnabled && (!d.openingTime || !d.closingTime)) {
        return setError(`${WEEKDAY_LABELS_KO[d.weekday]}요일 영업시간을 입력해 주세요.`)
      }
    }
    setSavingPickup(true)
    const res = await fetch(`/api/admin/stores/${storeSlug}/pickup-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickupIntervalMinutes, days }),
    })
    const body = await res.json()
    setSavingPickup(false)
    if (!res.ok) {
      setError(body?.error?.message ?? "픽업 설정을 저장하지 못했습니다.")
      return
    }
    setNotice("픽업 설정이 저장되었습니다.")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <h1 className="text-xl font-semibold text-zinc-900">매장 설정</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">기존 케이크 디자인 (Flow A)</h2>

        {designs === null ? (
          <p className="text-sm text-zinc-500">불러오는 중...</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {designs.map((d) => (
              <div key={d.id} className="overflow-hidden rounded-lg border border-zinc-200">
                {d.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.imageUrl} alt={d.label} className="h-28 w-full object-cover" />
                )}
                <div className="space-y-1 p-2 text-sm">
                  <p className="font-medium text-zinc-900">{d.label}</p>
                  <p className="text-zinc-500">{d.price_krw.toLocaleString()}원</p>
                  <button
                    onClick={() => toggleDesign(d.id, !d.is_enabled)}
                    className={`w-full rounded-md border px-2 py-1 text-xs ${
                      d.is_enabled ? "border-zinc-300 text-zinc-600" : "border-zinc-300 text-zinc-400"
                    }`}
                  >
                    {d.is_enabled ? "노출 중 (끄기)" : "비노출 (켜기)"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={createDesign} className="space-y-2 rounded-lg border border-zinc-200 p-4">
          <p className="text-sm font-medium text-zinc-700">새 디자인 추가</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="디자인 이름"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="가격 (원)"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            type="submit"
            disabled={creatingDesign}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {creatingDesign ? "등록 중..." : "디자인 등록"}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-zinc-900">입금 계좌 안내 (Flow B)</h2>
        <form onSubmit={savePaymentSettings} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="은행명"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="계좌번호"
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="예금주명"
              value={bankAccountHolder}
              onChange={(e) => setBankAccountHolder(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="입금 기한 (시간)"
              value={paymentDeadlineHours}
              onChange={(e) => setPaymentDeadlineHours(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <textarea
            placeholder="고객에게 보여줄 추가 안내 (선택)"
            value={paymentInstructions}
            onChange={(e) => setPaymentInstructions(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={savingPayment}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingPayment ? "저장 중..." : "결제 설정 저장"}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-zinc-900">픽업 가능 시간 (공통)</h2>

        <div>
          <label className="block text-sm font-medium text-zinc-700">픽업 간격</label>
          <select
            value={pickupIntervalMinutes}
            onChange={(e) => setPickupIntervalMinutes(Number(e.target.value))}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value={15}>15분</option>
            <option value={30}>30분</option>
            <option value={60}>60분</option>
          </select>
        </div>

        {days === null ? (
          <p className="text-sm text-zinc-500">불러오는 중...</p>
        ) : (
          <div className="space-y-2">
            {days.map((d) => (
              <div key={d.weekday} className="flex items-center gap-2 text-sm">
                <label className="flex w-16 items-center gap-1">
                  <input
                    type="checkbox"
                    checked={d.isEnabled}
                    onChange={(e) => updateDay(d.weekday, { isEnabled: e.target.checked })}
                  />
                  {WEEKDAY_LABELS_KO[d.weekday]}
                </label>
                <input
                  type="time"
                  value={d.openingTime ?? ""}
                  disabled={!d.isEnabled}
                  onChange={(e) => updateDay(d.weekday, { openingTime: e.target.value })}
                  className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-40"
                />
                <span className="text-zinc-400">~</span>
                <input
                  type="time"
                  value={d.closingTime ?? ""}
                  disabled={!d.isEnabled}
                  onChange={(e) => updateDay(d.weekday, { closingTime: e.target.value })}
                  className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-40"
                />
                <input
                  type="number"
                  min={0}
                  value={d.minLeadHours ?? 24}
                  disabled={!d.isEnabled}
                  onChange={(e) => updateDay(d.weekday, { minLeadHours: Number(e.target.value) })}
                  className="w-20 rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-40"
                  title="최소 준비 시간(시간)"
                />
                <span className="text-xs text-zinc-400">최소 준비시간(h)</span>
              </div>
            ))}
            <button
              onClick={savePickupSettings}
              disabled={savingPickup}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingPickup ? "저장 중..." : "픽업 설정 저장"}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
