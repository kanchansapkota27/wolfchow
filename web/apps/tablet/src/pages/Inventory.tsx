import { useCallback, useEffect, useState } from 'react'
import { useApi } from '../lib/api'
import { useRealtime } from '../lib/realtime'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string
  name: string
  category_id: string
  availability_state: string
  restore_at: string | null
}

interface InventoryCategory {
  id: string
  name: string
  availability_state: string
  position: number
}

// ── Availability config ───────────────────────────────────────────────────────

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  available:    { label: 'In Stock',      cls: 'bg-green-800/60 text-green-300' },
  out_of_stock: { label: 'Out of Stock',  cls: 'bg-red-800/60 text-red-300' },
  unavailable:  { label: 'Unavailable',   cls: 'bg-gray-700 text-gray-400' },
  scheduled:    { label: 'Scheduled',     cls: 'bg-blue-800/60 text-blue-300' },
}

const TIMED_OPTIONS: Array<{ label: string; minutesFromNow: number | null }> = [
  { label: '1 hour',    minutesFromNow: 60 },
  { label: '2 hours',   minutesFromNow: 120 },
  { label: '4 hours',   minutesFromNow: 240 },
  { label: 'Rest of day', minutesFromNow: null },
]

function restOfDayIso(): string {
  const d = new Date()
  d.setHours(23, 59, 0, 0)
  return d.toISOString()
}

function minutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

// ── Live countdown ────────────────────────────────────────────────────────────

function useRestoreCountdown(restoreAt: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    if (!restoreAt) { setLabel(null); return }
    function update() {
      const ms = new Date(restoreAt!).getTime() - Date.now()
      if (ms <= 0) { setLabel('restoring…'); return }
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [restoreAt])
  return label
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({ item, onTap }: { item: InventoryItem; onTap: () => void }) {
  const countdown = useRestoreCountdown(item.restore_at)
  const badge = STATE_BADGE[item.availability_state] ?? { label: item.availability_state, cls: 'bg-gray-700 text-gray-400' }

  return (
    <button
      onClick={onTap}
      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-700/30 transition-colors"
    >
      <span className="text-sm text-gray-100">{item.name}</span>
      <div className="flex items-center gap-2">
        {countdown && (
          <span className="text-xs text-amber-400">{countdown}</span>
        )}
        <span className={['rounded-full px-2 py-0.5 text-xs font-medium', badge.cls].join(' ')}>
          {badge.label}
        </span>
      </div>
    </button>
  )
}

// ── Availability bottom sheet ─────────────────────────────────────────────────

interface SheetProps {
  name: string
  currentState: string
  onSelect: (state: string, restoreAt?: string | null) => Promise<void>
  onClose: () => void
}

function AvailabilitySheet({ name, currentState, onSelect, onClose }: SheetProps) {
  const [busy, setBusy] = useState(false)

  async function pick(state: string, restoreAt?: string | null) {
    setBusy(true)
    try { await onSelect(state, restoreAt); onClose() } finally { setBusy(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set availability"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-gray-800 p-6 shadow-2xl"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-600" />
        <p className="mb-4 text-base font-semibold text-gray-100">{name}</p>

        <div className="space-y-2">
          {/* In stock */}
          <button
            onClick={() => void pick('available', null)}
            disabled={busy}
            className={[
              'w-full rounded-xl py-3.5 text-sm font-medium transition-colors disabled:opacity-40',
              currentState === 'available'
                ? 'bg-green-700 text-white'
                : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
            ].join(' ')}
          >
            ✓ In Stock
          </button>

          {/* Out of stock - permanent */}
          <button
            onClick={() => void pick('out_of_stock', null)}
            disabled={busy}
            className={[
              'w-full rounded-xl py-3.5 text-sm font-medium transition-colors disabled:opacity-40',
              currentState === 'out_of_stock'
                ? 'bg-red-700 text-white'
                : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
            ].join(' ')}
          >
            ✕ Out of Stock
          </button>

          {/* Timed out-of-stock options */}
          {TIMED_OPTIONS.map(({ label, minutesFromNow }) => (
            <button
              key={label}
              onClick={() => void pick('out_of_stock', minutesFromNow === null ? restOfDayIso() : minutesIso(minutesFromNow))}
              disabled={busy}
              className="w-full rounded-xl bg-gray-700 py-3 text-sm text-gray-200 hover:bg-gray-600 disabled:opacity-40"
            >
              Out of Stock — {label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Main Inventory page ───────────────────────────────────────────────────────

export function Inventory() {
  const api = useApi()
  const { subscribe } = useRealtime()

  const [categories, setCategories] = useState<InventoryCategory[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)

  useEffect(() => {
    void api.orders.getInventory().then(({ categories: cats, items: itms }) => {
      setCategories(cats)
      setItems(itms)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [api])

  // Keep in sync with Realtime menu_availability_changed events
  useEffect(() => {
    return subscribe('menu_availability_changed', (_, payload) => {
      if (payload.item_id) {
        setItems((prev) => prev.map((it) =>
          it.id === payload.item_id
            ? { ...it, availability_state: payload.availability_state as string, restore_at: (payload.restore_at as string | null) ?? null }
            : it,
        ))
      }
      if (payload.category_id) {
        setCategories((prev) => prev.map((cat) =>
          cat.id === payload.category_id
            ? { ...cat, availability_state: payload.availability_state as string }
            : cat,
        ))
      }
    })
  }, [subscribe])

  const handleItemUpdate = useCallback(async (itemId: string, state: string, restoreAt?: string | null) => {
    const updated = await api.orders.patchInventoryItem(itemId, { availability_state: state, restore_at: restoreAt ?? null })
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, ...updated } : it))
  }, [api])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 text-sm">
        Loading inventory…
      </div>
    )
  }

  const itemsByCategory = new Map<string, InventoryItem[]>()
  for (const item of items) {
    const list = itemsByCategory.get(item.category_id) ?? []
    list.push(item)
    itemsByCategory.set(item.category_id, list)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-200">Inventory</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {categories.map((cat) => {
          const catItems = itemsByCategory.get(cat.id) ?? []
          const catBadge = STATE_BADGE[cat.availability_state] ?? { label: cat.availability_state, cls: 'bg-gray-700 text-gray-400' }

          return (
            <div key={cat.id} className="border-b border-gray-700/60">
              {/* Category header */}
              <div className="flex items-center justify-between bg-gray-800/60 px-4 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {cat.name}
                </span>
                <span className={['rounded-full px-2 py-0.5 text-xs font-medium', catBadge.cls].join(' ')}>
                  {catBadge.label}
                </span>
              </div>

              {/* Items */}
              {catItems.length === 0 ? (
                <p className="px-4 py-3 text-xs text-gray-500">No items</p>
              ) : (
                <div className="divide-y divide-gray-700/40">
                  {catItems.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onTap={() => setSelectedItem(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {categories.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-gray-500">
            No inventory items
          </div>
        )}
      </div>

      {/* Availability sheet */}
      {selectedItem && (
        <AvailabilitySheet
          name={selectedItem.name}
          currentState={selectedItem.availability_state}
          onSelect={(state, restoreAt) => handleItemUpdate(selectedItem.id, state, restoreAt)}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}
