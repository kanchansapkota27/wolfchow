import { useState, useEffect, useRef } from 'react'
import { Button } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import { ApiError } from '@wolfchow/api-client'
import type { Promotion, CreatePromotionInput, DiscountType, ActiveDay } from '@wolfchow/api-client'
import type { MenuItem } from '@wolfchow/types'

type DayName = ActiveDay
const ALL_DAYS: DayName[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DISCOUNT_LABELS: Record<DiscountType, string> = {
  percentage: '% Off',
  fixed: 'Fixed Amount',
  free_item: 'Free Item',
  bogo: 'Buy One Get One',
}

function formatDiscount(p: Promotion): string {
  if (p.discount_type === 'percentage') return `${p.discount_value}% off`
  if (p.discount_type === 'fixed') return `-$${(p.discount_value / 100).toFixed(2)}`
  if (p.discount_type === 'free_item') return 'Free item'
  return 'BOGO'
}

function randomCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

// ── Create/Edit Modal ─────────────────────────────────────────────────────────

interface PromoModalProps {
  initial?: Promotion
  onSave: (data: CreatePromotionInput) => Promise<void>
  onClose: () => void
}

const ITEM_TYPES: DiscountType[] = ['free_item', 'bogo']

function PromoModal({ initial, onSave, onClose }: PromoModalProps) {
  const api = useApi()
  const [form, setForm] = useState<CreatePromotionInput>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    discount_type: initial?.discount_type ?? 'percentage',
    discount_value: initial?.discount_value ?? 10,
    free_item_id: initial?.free_item_id ?? undefined,
    promo_code: initial?.promo_code ?? '',
    auto_apply: initial?.auto_apply ?? false,
    minimum_order_amount: initial?.minimum_order_amount ?? undefined,
    usage_limit: initial?.usage_limit ?? undefined,
    start_time: initial?.start_time ?? '',
    end_time: initial?.end_time ?? '',
    active_days: initial?.active_days ?? undefined,
  })
  const [allItems, setAllItems] = useState<MenuItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fetchedItems = useRef(false)

  const needsItem = ITEM_TYPES.includes(form.discount_type)

  useEffect(() => {
    if (!needsItem || fetchedItems.current) return
    fetchedItems.current = true
    setItemsLoading(true)
    void api.admin.listItems().then(setAllItems).finally(() => setItemsLoading(false))
  }, [needsItem, api])

  const discountLabel = form.discount_type === 'percentage' ? '%' : '$'

  function toggleDay(day: DayName) {
    const days = form.active_days ?? []
    setForm({ ...form, active_days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (needsItem && !form.free_item_id) {
      setError('Please select the item for this promotion type.')
      return
    }
    if (!form.auto_apply && !form.promo_code?.trim()) {
      setError('Enter a promo code, or enable auto-apply.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...form,
        discount_value: needsItem ? 0 : form.discount_value,
        free_item_id: needsItem ? form.free_item_id : undefined,
        promo_code: form.auto_apply ? undefined : form.promo_code || undefined,
        minimum_order_amount: form.minimum_order_amount || undefined,
        usage_limit: form.usage_limit || undefined,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        active_days: form.active_days?.length ? form.active_days : undefined,
      })
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Promo code already exists')
      } else if (err instanceof ApiError && err.status === 402) {
        setError('Promotions feature is not available on your current plan')
      } else {
        setError('Failed to save promotion')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-label={initial ? 'Edit promotion' : 'Create promotion'}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">{initial ? 'Edit promotion' : 'Create promotion'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">Discount type</span>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(DISCOUNT_LABELS) as Array<[DiscountType, string]>).map(([type, label]) => (
                <label
                  key={type}
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${form.discount_type === type ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-700'}`}
                >
                  <input
                    type="radio"
                    name="discount_type"
                    value={type}
                    checked={form.discount_type === type}
                    onChange={() => setForm({ ...form, discount_type: type, free_item_id: undefined })}
                    className="text-indigo-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Discount value — hidden for free_item / bogo (value is implicit) */}
          {!needsItem && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discount value ({discountLabel})
              </label>
              <input
                type="number"
                min={0}
                max={form.discount_type === 'percentage' ? 100 : undefined}
                step={form.discount_type === 'fixed' ? 0.01 : 1}
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
                required
                className="border border-gray-200 rounded-md px-3 py-2 text-sm w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                aria-label="Discount value"
              />
            </div>
          )}

          {/* Item picker — shown for free_item / bogo */}
          {needsItem && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.discount_type === 'bogo' ? 'BOGO item (buy one, get one free)' : 'Free item to give'}
              </label>
              {itemsLoading ? (
                <p className="text-sm text-gray-400">Loading items…</p>
              ) : allItems.length === 0 ? (
                <p className="text-sm text-amber-600">No menu items found. Add items to your menu first.</p>
              ) : (
                <select
                  value={form.free_item_id ?? ''}
                  onChange={(e) => setForm({ ...form, free_item_id: e.target.value || undefined })}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  aria-label="Select item"
                >
                  <option value="">— Select an item —</option>
                  {allItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {!item.has_variants ? ` — ${(item.price / 100).toFixed(2)}` : ' (variants)'}
                    </option>
                  ))}
                </select>
              )}
              {form.discount_type === 'bogo' && (
                <p className="mt-1 text-xs text-gray-400">
                  Customers who add this item get a second one free.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.auto_apply ?? false}
                onChange={(e) => setForm({ ...form, auto_apply: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600"
                aria-label="Auto-apply promotion"
              />
              <span className="text-sm text-gray-700">Auto-apply (no code required)</span>
            </label>
          </div>
          {!form.auto_apply && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Promo code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.promo_code ?? ''}
                  onChange={(e) => setForm({ ...form, promo_code: e.target.value.toUpperCase() })}
                  maxLength={20}
                  className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  aria-label="Promo code"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, promo_code: randomCode() })}
                  className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-md px-2"
                >
                  Generate random
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min order ($) <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.minimum_order_amount ?? ''}
                onChange={(e) => setForm({ ...form, minimum_order_amount: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usage limit <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="number"
                min={1}
                value={form.usage_limit ?? ''}
                onChange={(e) => setForm({ ...form, usage_limit: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                aria-label="Usage limit"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date/time</label>
              <input
                type="datetime-local"
                value={form.start_time?.slice(0, 16) ?? ''}
                onChange={(e) => setForm({ ...form, start_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End date/time</label>
              <input
                type="datetime-local"
                value={form.end_time?.slice(0, 16) ?? ''}
                onChange={(e) => setForm({ ...form, end_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">Active days <span className="text-gray-400 font-normal">(leave empty = all days)</span></span>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map((day) => (
                <label key={day} className={`flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer text-xs font-medium ${(form.active_days ?? []).includes(day) ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'}`}>
                  <input
                    type="checkbox"
                    checked={(form.active_days ?? []).includes(day)}
                    onChange={() => toggleDay(day)}
                    className="sr-only"
                    aria-label={day}
                  />
                  {day}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
            <Button loading={saving} type="submit">{initial ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Promo card ────────────────────────────────────────────────────────────────

interface PromoCardProps {
  promo: Promotion
  freeItemName?: string
  onToggle: (id: string) => Promise<void>
  onEdit: (p: Promotion) => void
  onDelete: (id: string) => Promise<void>
  onDeactivate: (id: string) => Promise<void>
}

function PromoCard({ promo, freeItemName, onToggle, onEdit, onDelete, onDeactivate }: PromoCardProps) {
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const usageText =
    promo.usage_limit !== null
      ? `${promo.usage_count}/${promo.usage_limit} used`
      : promo.usage_count > 0
      ? `${promo.usage_count} used`
      : 'Unlimited'

  return (
    <div className={`bg-white rounded-xl border p-4 space-y-3 ${promo.active ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{promo.title}</h3>
          {promo.description && <p className="text-xs text-gray-500 mt-0.5">{promo.description}</p>}
          {freeItemName && (
            <p className="text-xs text-indigo-600 mt-0.5">
              {promo.discount_type === 'bogo' ? 'BOGO: ' : 'Free: '}
              <span className="font-medium">{freeItemName}</span>
            </p>
          )}
        </div>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 whitespace-nowrap">
          {formatDiscount(promo)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span>{promo.auto_apply ? '⚡ Auto-apply' : `🎟 ${promo.promo_code}`}</span>
        <span>{usageText}</span>
        {promo.start_time && <span>From {new Date(promo.start_time).toLocaleDateString()}</span>}
        {promo.end_time && <span>Until {new Date(promo.end_time).toLocaleDateString()}</span>}
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={promo.active}
            disabled={toggling}
            onChange={async () => { setToggling(true); await onToggle(promo.id); setToggling(false) }}
            className="w-4 h-4 rounded text-indigo-600"
            aria-label={`Toggle ${promo.title}`}
          />
          <span className="text-xs text-gray-600">{promo.active ? 'Active' : 'Inactive'}</span>
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(promo)}
            className="text-xs text-indigo-600 hover:text-indigo-800"
            aria-label={`Edit ${promo.title}`}
          >
            Edit
          </button>
          {promo.usage_count > 0 ? (
            <button
              onClick={async () => { await onDeactivate(promo.id) }}
              className="text-xs text-amber-600 hover:text-amber-800"
              aria-label={`Deactivate ${promo.title}`}
            >
              Deactivate
            </button>
          ) : confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={async () => { setDeleting(true); await onDelete(promo.id); setDeleting(false) }}
                disabled={deleting}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-40"
              >
                Confirm
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-500 hover:text-red-700"
              aria-label={`Delete ${promo.title}`}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Promotions page ──────────────────────────────────────────────────────

export function Promotions() {
  const api = useApi()
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [itemsMap, setItemsMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [planEnabled, setPlanEnabled] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editPromo, setEditPromo] = useState<Promotion | null>(null)

  useEffect(() => {
    void Promise.all([
      api.admin.listPromotions().then(setPromotions),
      api.admin.listItems().then((items) => {
        const map: Record<string, string> = {}
        for (const item of items) map[item.id] = item.name
        setItemsMap(map)
      }),
    ]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(data: CreatePromotionInput) {
    try {
      const promo = await api.admin.createPromotion(data)
      setPromotions((prev) => [promo, ...prev])
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        const body = err.body as { error?: string }
        if (body?.error === 'feature_locked') setPlanEnabled(false)
      }
      throw err
    }
  }

  async function handleUpdate(data: CreatePromotionInput) {
    if (!editPromo) return
    const updated = await api.admin.updatePromotion(editPromo.id, data)
    setPromotions((prev) => prev.map((p) => p.id === updated.id ? updated : p))
  }

  async function handleToggle(id: string) {
    const result = await api.admin.togglePromotion(id)
    setPromotions((prev) => prev.map((p) => p.id === id ? { ...p, active: result.active } : p))
  }

  async function handleDelete(id: string) {
    await api.admin.deletePromotion(id)
    setPromotions((prev) => prev.filter((p) => p.id !== id))
  }

  async function handleDeactivate(id: string) {
    const result = await api.admin.togglePromotion(id)
    if (result.active) await api.admin.togglePromotion(id)
    setPromotions((prev) => prev.map((p) => p.id === id ? { ...p, active: false } : p))
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>

  if (!planEnabled) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="bg-white rounded-xl border border-amber-200 p-8 text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <h2 className="text-lg font-semibold text-gray-900">Promotions not available on your plan</h2>
          <p className="text-gray-500 text-sm">Upgrade your plan to create discount codes, auto-apply promotions, and BOGO offers.</p>
          <Button onClick={() => { /* navigate to plan upgrade */ }}>Upgrade plan</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Promotions ({promotions.length})</h2>
        <Button onClick={() => setShowCreate(true)}>Create promotion</Button>
      </div>

      {promotions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          No promotions yet
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {promotions.map((promo) => (
            <PromoCard
              key={promo.id}
              promo={promo}
              freeItemName={promo.free_item_id ? itemsMap[promo.free_item_id] : undefined}
              onToggle={handleToggle}
              onEdit={setEditPromo}
              onDelete={handleDelete}
              onDeactivate={handleDeactivate}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <PromoModal onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editPromo && (
        <PromoModal initial={editPromo} onSave={handleUpdate} onClose={() => setEditPromo(null)} />
      )}
    </div>
  )
}
