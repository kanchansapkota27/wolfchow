import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@wolfchow/auth'
import { useApi } from '../lib/api'
import { useRealtime } from '../lib/realtime'

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

// ── State config ──────────────────────────────────────────────────────────────

const STATE_CFG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  available:    { label: 'In Stock',     bg: 'rgba(16,185,129,0.15)', color: '#34d399', border: 'rgba(16,185,129,0.3)' },
  out_of_stock: { label: 'Out of Stock', bg: 'rgba(239,68,68,0.15)',  color: '#f87171', border: 'rgba(239,68,68,0.3)' },
  unavailable:  { label: 'Unavailable',  bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)' },
  scheduled:    { label: 'Scheduled',    bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
}

function restOfDayIso(): string {
  const d = new Date(); d.setHours(23, 59, 0, 0); return d.toISOString()
}
function minutesIso(m: number): string {
  return new Date(Date.now() + m * 60_000).toISOString()
}
/** Saturday 23:59 local time of the current week (weeks run Sun–Sat elsewhere in this app). */
function endOfWeekIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + (6 - d.getDay()))
  d.setHours(23, 59, 0, 0)
  return d.toISOString()
}
/** "YYYY-MM-DDTHH:mm" in local time, for the datetime-local input's `min`. */
function nowLocalInputValue(): string {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

const TIMED_OPTIONS: Array<{ label: string; getIso: () => string }> = [
  { label: '1 hour', getIso: () => minutesIso(60) },
  { label: 'Rest of the day', getIso: restOfDayIso },
  { label: 'End of this week', getIso: endOfWeekIso },
]

// ── Countdown ─────────────────────────────────────────────────────────────────

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
  const cfg = STATE_CFG[item.availability_state] ?? STATE_CFG.unavailable

  return (
    <button
      onClick={onTap}
      className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors"
      style={{ borderBottom: '1px solid #1e293b' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#1e293b')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
    >
      <span className="text-sm font-medium text-white">{item.name}</span>
      <div className="flex items-center gap-2.5 shrink-0">
        {countdown && (
          <span className="text-xs font-medium" style={{ color: '#f59e0b' }}>⏱ {countdown}</span>
        )}
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
        >
          {cfg.label}
        </span>
      </div>
    </button>
  )
}

// ── Availability sheet ────────────────────────────────────────────────────────

interface SheetProps {
  name: string
  currentState: string
  canEdit: boolean
  onSelect: (state: string, restoreAt?: string | null) => Promise<void>
  onClose: () => void
}

function AvailabilitySheet({ name, currentState, canEdit, onSelect, onClose }: SheetProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customDate, setCustomDate] = useState('')

  async function pick(state: string, restoreAt?: string | null) {
    setBusy(true)
    setError(null)
    try {
      await onSelect(state, restoreAt)
      onClose()
    } catch {
      setError('Could not update availability. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set availability"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl p-6 shadow-2xl"
        style={{ background: '#0f172a', borderTop: '1px solid #1e293b' }}
      >
        <div className="mx-auto mb-5 h-1 w-12 rounded-full" style={{ background: '#334155' }} />
        <p className="mb-5 text-lg font-bold text-white">{name}</p>

        {error && (
          <p className="mb-4 rounded-xl px-3 py-2.5 text-sm font-medium" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
            {error}
          </p>
        )}

        {!canEdit ? (
          <p className="rounded-xl px-3 py-3 text-sm" style={{ background: '#1e293b', color: '#94a3b8' }}>
            You don't have permission to change item availability. Ask a manager to update your device's permissions.
          </p>
        ) : (
          <div className="space-y-2.5">
            {/* In stock */}
            <button
              onClick={() => void pick('available', null)}
              disabled={busy}
              className="w-full rounded-2xl py-4 text-sm font-bold transition-colors disabled:opacity-40"
              style={
                currentState === 'available'
                  ? { background: '#065f46', color: '#34d399', border: '1px solid #10b981' }
                  : { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }
              }
            >
              ✓ In Stock
            </button>

            {/* Out of stock — permanent */}
            <button
              onClick={() => void pick('out_of_stock', null)}
              disabled={busy}
              className="w-full rounded-2xl py-4 text-sm font-bold transition-colors disabled:opacity-40"
              style={
                currentState === 'out_of_stock'
                  ? { background: '#7f1d1d', color: '#f87171', border: '1px solid #ef4444' }
                  : { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }
              }
            >
              ✕ Out of Stock
            </button>

            {/* Timed out-of-stock */}
            <div className="pt-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>
                Out of stock until…
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TIMED_OPTIONS.map(({ label, getIso }) => (
                  <button
                    key={label}
                    onClick={() => void pick('out_of_stock', getIso())}
                    disabled={busy}
                    className="rounded-2xl py-3 text-sm font-medium transition-colors disabled:opacity-40"
                    style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>
                Or pick a date
              </p>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  aria-label="Out of stock until date"
                  value={customDate}
                  min={nowLocalInputValue()}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="flex-1 rounded-2xl px-3 py-3 text-sm"
                  style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' }}
                />
                <button
                  onClick={() => customDate && void pick('out_of_stock', new Date(customDate).toISOString())}
                  disabled={busy || !customDate}
                  className="rounded-2xl px-4 py-3 text-sm font-bold transition-colors disabled:opacity-40"
                  style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}
                >
                  Set
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function Inventory() {
  const api = useApi()
  const { subscribe } = useRealtime()
  const { hasPermission } = useAuth()
  const canEditInventory = hasPermission('inventory:write')

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
      <div className="flex h-full items-center justify-center flex-col gap-3" style={{ background: '#080d17' }}>
        <div className="h-10 w-10 animate-spin rounded-full border-4" style={{ borderColor: '#1e293b', borderTopColor: '#f97316' }} />
        <p className="text-sm" style={{ color: '#64748b' }}>Loading inventory…</p>
      </div>
    )
  }

  const itemsByCategory = new Map<string, InventoryItem[]>()
  for (const item of items) {
    const list = itemsByCategory.get(item.category_id) ?? []
    list.push(item)
    itemsByCategory.set(item.category_id, list)
  }

  // Categories with no items add nothing to check during service — don't
  // clutter the list with empty sections.
  const nonEmptyCategories = categories.filter((cat) => (itemsByCategory.get(cat.id) ?? []).length > 0)

  return (
    <div className="flex h-full flex-col" style={{ background: '#080d17' }}>
      {/* Page header */}
      <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: '#1e293b' }}>
        <p className="text-sm font-bold text-white">Inventory</p>
        <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
          {items.length} item{items.length !== 1 ? 's' : ''} across {nonEmptyCategories.length} categor{nonEmptyCategories.length !== 1 ? 'ies' : 'y'}
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {nonEmptyCategories.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2">
            <span className="text-4xl opacity-20">📦</span>
            <p className="text-sm" style={{ color: '#475569' }}>No inventory items</p>
          </div>
        ) : (
          nonEmptyCategories
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((cat) => {
              const catItems = itemsByCategory.get(cat.id) ?? []
              const catCfg = STATE_CFG[cat.availability_state] ?? STATE_CFG.unavailable

              return (
                <div key={cat.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  {/* Category header */}
                  <div
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ background: '#0f172a' }}
                  >
                    <span
                      className="text-xs font-black uppercase tracking-widest"
                      style={{ color: '#475569' }}
                    >
                      {cat.name}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{ background: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}` }}
                    >
                      {catCfg.label}
                    </span>
                  </div>

                  {catItems.map((item) => (
                    <ItemRow key={item.id} item={item} onTap={() => setSelectedItem(item)} />
                  ))}
                </div>
              )
            })
        )}
      </div>

      {selectedItem && (
        <AvailabilitySheet
          name={selectedItem.name}
          currentState={selectedItem.availability_state}
          canEdit={canEditInventory}
          onSelect={(state, restoreAt) => handleItemUpdate(selectedItem.id, state, restoreAt)}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}
