import { useState, useEffect, useRef } from 'react'
import { CalendarDays, Clock, AlertTriangle, Plus, X } from 'lucide-react'
import { useApi } from '../lib/api'
import { ApiError } from '@wolfchow/api-client'
import type { HoursRow, SchedulingConfig, CreateClosureInput } from '@wolfchow/api-client'
import type { SpecialClosure } from '@wolfchow/api-client'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const CLOSURE_CATEGORIES = [
  { value: 'holiday', label: 'Public Holiday' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'special', label: 'Special Event' },
  { value: 'full', label: 'Full Closure' },
  { value: 'partial', label: 'Partial' },
] as const

type ClosureType = (typeof CLOSURE_CATEGORIES)[number]['value']

const CLOSURE_COLORS: Record<string, string> = {
  holiday: 'bg-blue-100 text-blue-700',
  emergency: 'bg-red-100 text-red-700',
  maintenance: 'bg-gray-100 text-gray-700',
  special: 'bg-purple-100 text-purple-700',
  full: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
}

function isOvernight(open: string, close: string): boolean {
  if (close === '00:00' && open > '00:00') return true
  return close < open
}

// ── Day row ───────────────────────────────────────────────────────────────────

function DayRow({ row, onChange, onApplyToAll }: { row: HoursRow; onChange: (r: HoursRow) => void; onApplyToAll: (r: HoursRow) => void }) {
  const overnight = row.active && isOvernight(row.open_time, row.close_time)

  return (
    <div className="flex items-center gap-4 border-b border-gray-100 py-4 last:border-0">
      {/* Checkbox + day name */}
      <label className="flex w-32 shrink-0 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={row.active}
          onChange={(e) => onChange({ ...row, active: e.target.checked })}
          className="h-5 w-5 rounded border-gray-300 text-blue-600 accent-blue-600"
          aria-label={`${DAY_NAMES[row.day_of_week]} active`}
        />
        <span className={`text-sm font-semibold ${row.active ? 'text-gray-900' : 'text-gray-400'}`}>
          {DAY_NAMES[row.day_of_week]}
        </span>
      </label>

      {/* Open time */}
      <div className="relative">
        <input
          type="time"
          value={row.open_time}
          disabled={!row.active}
          onChange={(e) => onChange({ ...row, open_time: e.target.value })}
          className="w-36 rounded-lg border border-gray-200 px-3 py-2 pr-8 text-sm font-medium text-gray-900 disabled:opacity-40 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          aria-label={`${DAY_NAMES[row.day_of_week]} open time`}
        />
        <Clock size={13} className="pointer-events-none absolute right-2.5 top-2.5 text-gray-400" />
      </div>

      <span className="text-gray-300">→</span>

      {/* Close time */}
      <div className="relative">
        <input
          type="time"
          value={row.close_time}
          disabled={!row.active}
          onChange={(e) => onChange({ ...row, close_time: e.target.value })}
          className="w-36 rounded-lg border border-gray-200 px-3 py-2 pr-8 text-sm font-medium text-gray-900 disabled:opacity-40 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          aria-label={`${DAY_NAMES[row.day_of_week]} close time`}
        />
        <Clock size={13} className="pointer-events-none absolute right-2.5 top-2.5 text-gray-400" />
      </div>

      {/* Last order offset */}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Last Order:</span>
        <input
          type="number"
          min={0}
          max={240}
          value={row.last_order_offset_minutes}
          disabled={!row.active}
          onChange={(e) => onChange({ ...row, last_order_offset_minutes: Number(e.target.value) })}
          className="w-14 rounded-lg border border-gray-200 px-2 py-2 text-center text-sm font-semibold text-gray-900 disabled:opacity-40 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          aria-label={`${DAY_NAMES[row.day_of_week]} last order offset`}
        />
        <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Min Before</span>
      </div>

      {overnight && (
        <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
          Overnight
        </span>
      )}

      {row.active && (
        <button
          type="button"
          onClick={() => onApplyToAll(row)}
          className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
          title={`Apply ${DAY_NAMES[row.day_of_week]}'s times to all days`}
        >
          Apply to all
        </button>
      )}
    </div>
  )
}

// ── Closure modal ─────────────────────────────────────────────────────────────

function ClosureModal({ onSave, onClose }: { onSave: (d: CreateClosureInput) => Promise<void>; onClose: () => void }) {
  const [tab, setTab] = useState<'full' | 'partial'>('full')
  const [category, setCategory] = useState<ClosureType>('holiday')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [partialOpen, setPartialOpen] = useState('')
  const [partialClose, setPartialClose] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) { setError('Date is required'); return }
    if (tab === 'partial' && (!partialOpen || !partialClose)) {
      setError('Open from and close at times are required')
      return
    }
    setSaving(true)
    try {
      await onSave({
        closure_type: tab === 'partial' ? 'partial' : category,
        date,
        reason: reason || undefined,
        recurring,
        ...(tab === 'partial' ? { partial_open: partialOpen, partial_close: partialClose } : {}),
      })
      onClose()
    } catch {
      setError('Failed to save closure')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal aria-label="Add Special Closure">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-bold text-gray-900">Add Special Closure</h3>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {/* Tabs */}
          <div className="mb-5 flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setTab('full')}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                tab === 'full' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Full Closure
            </button>
            <button
              type="button"
              onClick={() => setTab('partial')}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                tab === 'partial' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Partial / Hours Change
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'full' ? (
              <div>
                <label className="mb-1 block text-xs font-bold tracking-widest text-gray-500 uppercase">
                  Closure Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ClosureType)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {CLOSURE_CATEGORIES.filter((c) => c.value !== 'partial').map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold tracking-widest text-gray-500 uppercase">Open From</label>
                  <input
                    type="time"
                    value={partialOpen}
                    onChange={(e) => setPartialOpen(e.target.value)}
                    required={tab === 'partial'}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    aria-label="Partial open time"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold tracking-widest text-gray-500 uppercase">Close At</label>
                  <input
                    type="time"
                    value={partialClose}
                    onChange={(e) => setPartialClose(e.target.value)}
                    required={tab === 'partial'}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    aria-label="Partial close time"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-bold tracking-widest text-gray-500 uppercase">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold tracking-widest text-gray-500 uppercase">
                Reason (Internal)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Kitchen renovation"
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600"
              />
              <span className="text-sm text-gray-700">Repeat annually</span>
            </label>

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Adding…' : 'Add Closure'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Main Hours page ───────────────────────────────────────────────────────────

export function Hours() {
  const api = useApi()
  const [hours, setHours] = useState<HoursRow[]>([])
  const [scheduling, setScheduling] = useState<SchedulingConfig>({
    base_prep_minutes: 20,
    scheduling_interval: 15,
    future_days_allowed: 7,
  })
  const [closures, setClosures] = useState<SpecialClosure[]>([])
  const [slots, setSlots] = useState<string[]>([])
  const [schedulingLocked, setSchedulingLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingHours, setSavingHours] = useState(false)
  const [hoursSaved, setHoursSaved] = useState(false)
  const [showClosureModal, setShowClosureModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function load() {
      const [hoursResult, closuresResult] = await Promise.all([
        api.admin.getHours(),
        api.admin.listClosures(),
      ])
      setHours(hoursResult)
      setClosures(closuresResult)

      // Scheduling endpoints are gated by the scheduled_orders_enabled plan flag.
      // Fetch them independently so a 402 doesn't block hours/closures from loading.
      try {
        const [s, sl] = await Promise.all([
          api.admin.getScheduling(),
          api.admin.getSchedulingPreview(),
        ])
        setScheduling(s)
        setSlots(sl)
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          setSchedulingLocked(true)
        }
      }
    }
    void load().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateRow(updated: HoursRow) {
    setHours((prev) => prev.map((r) => r.day_of_week === updated.day_of_week ? updated : r))
  }

  function applyToAll(source: HoursRow) {
    setHours((prev) => prev.map((r) => ({
      ...r,
      open_time: source.open_time,
      close_time: source.close_time,
      last_order_offset_minutes: source.last_order_offset_minutes,
    })))
  }

  async function saveHours() {
    setSavingHours(true)
    try {
      const saved = await api.admin.putHours(hours)
      setHours(saved)
      setHoursSaved(true)
      setTimeout(() => setHoursSaved(false), 2000)
    } finally { setSavingHours(false) }
  }

  function onSchedulingChange(patch: Partial<SchedulingConfig>) {
    if (schedulingLocked) return
    const next = { ...scheduling, ...patch }
    setScheduling(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await api.admin.patchScheduling(patch)
        const preview = await api.admin.getSchedulingPreview()
        setSlots(preview)
      } catch { /* ignore */ }
    }, 500)
  }

  async function handleAddClosure(data: CreateClosureInput) {
    const closure = await api.admin.createClosure(data)
    setClosures((prev) => [...prev, closure].sort((a, b) => a.date.localeCompare(b.date)))
  }

  async function handleDeleteClosure(id: string) {
    setDeletingId(id)
    try { await api.admin.deleteClosure(id); setClosures((p) => p.filter((c) => c.id !== id)) }
    finally { setDeletingId(null) }
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Loading…</div>

  return (
    <div className="flex gap-6">
      {/* ── Left column: Weekly Schedule ── */}
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl border border-gray-200 bg-white">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <CalendarDays size={16} className="text-blue-500" />
              <span className="text-xs font-bold tracking-widest text-gray-700 uppercase">Weekly Schedule</span>
            </div>
            <button
              onClick={() => void saveHours()}
              disabled={savingHours}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold tracking-wider text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {hoursSaved ? '✓ SAVED' : savingHours ? 'SAVING…' : 'SAVE CHANGES'}
            </button>
          </div>

          {/* Day rows */}
          <div className="px-6">
            {hours.map((row) => (
              <DayRow key={row.day_of_week} row={row} onChange={updateRow} onApplyToAll={applyToAll} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Right column: Scheduling Config + Special Closures ── */}
      <div className="w-80 shrink-0 space-y-4">
        {/* Scheduling Config — hidden when feature is not in plan */}
        {!schedulingLocked && <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100">
              <Clock size={13} className="text-orange-500" />
            </div>
            <span className="text-sm font-bold text-gray-900">Scheduling Config</span>
          </div>

          {/* Base prep time */}
          <div className="mb-4">
            <label className="mb-2 block text-[10px] font-bold tracking-widest text-gray-400 uppercase">
              Base Prep Time (Min)
            </label>
            <input
              type="number"
              min={5}
              max={120}
              value={scheduling.base_prep_minutes}
              onChange={(e) => onSchedulingChange({ base_prep_minutes: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-center text-sm font-bold text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              aria-label="Base prep time"
            />
          </div>

          {/* Slot interval */}
          <div className="mb-4">
            <label className="mb-2 block text-[10px] font-bold tracking-widest text-gray-400 uppercase">
              Slot Interval
            </label>
            <div className="flex rounded-lg border border-gray-200">
              {([15, 30] as const).map((v, i) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onSchedulingChange({ scheduling_interval: v })}
                  className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                    i === 0 ? 'rounded-l-lg' : 'rounded-r-lg border-l border-gray-200'
                  } ${
                    scheduling.scheduling_interval === v
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {v}m
                </button>
              ))}
            </div>
          </div>

          {/* Future days slider */}
          <div className="mb-4">
            <label className="mb-2 block text-[10px] font-bold tracking-widest text-gray-400 uppercase">
              Future Days Allowed
            </label>
            <input
              type="range"
              min={0}
              max={14}
              value={scheduling.future_days_allowed}
              onChange={(e) => onSchedulingChange({ future_days_allowed: Number(e.target.value) })}
              className="w-full accent-blue-600"
              aria-label="Future days allowed"
            />
            <div className="mt-1 flex justify-between text-[10px] font-bold text-gray-400 uppercase">
              <span>Today:</span>
              <span className="text-blue-600">{scheduling.future_days_allowed} Days</span>
              <span>14 Days</span>
            </div>
          </div>

          {/* Slot preview */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <Clock size={13} className="text-blue-500" />
              <span className="text-[10px] font-bold tracking-widest text-blue-700 uppercase">
                Slot Preview (Today)
              </span>
            </div>
            {slots.length === 0 ? (
              <p className="text-xs text-blue-400">No slots available today</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {slots.slice(0, 4).map((s) => (
                  <span key={s} className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                    {new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>}

        {/* Special Closures */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={14} className="text-orange-500" />
              <span className="text-sm font-bold text-gray-900">Special Closures</span>
            </div>
            <button
              onClick={() => setShowClosureModal(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
              aria-label="Add closure"
            >
              <Plus size={14} />
            </button>
          </div>

          {closures.length === 0 ? (
            <p className="text-center text-xs text-gray-400">No upcoming closures</p>
          ) : (
            <div className="space-y-2">
              {closures.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900">{c.date}</p>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${CLOSURE_COLORS[c.closure_type] ?? 'bg-gray-100 text-gray-700'}`}>
                      {CLOSURE_CATEGORIES.find((x) => x.value === c.closure_type)?.label ?? c.closure_type}
                    </span>
                    {c.reason && <p className="mt-0.5 text-[10px] text-gray-500">{c.reason}</p>}
                  </div>
                  <button
                    onClick={() => void handleDeleteClosure(c.id)}
                    disabled={deletingId === c.id}
                    className="shrink-0 text-gray-300 hover:text-red-500 disabled:opacity-40"
                    aria-label="Delete closure"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showClosureModal && (
        <ClosureModal onSave={handleAddClosure} onClose={() => setShowClosureModal(false)} />
      )}
    </div>
  )
}
