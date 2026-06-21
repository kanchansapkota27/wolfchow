import { useState, useEffect, useRef } from 'react'
import { Button } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import type { HoursRow, SchedulingConfig, SpecialClosure, CreateClosureInput } from '@wolfchow/api-client'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const CLOSURE_TYPES = ['full', 'partial', 'holiday', 'emergency', 'maintenance', 'special'] as const
type ClosureType = (typeof CLOSURE_TYPES)[number]

const CLOSURE_TYPE_LABELS: Record<ClosureType, string> = {
  full: 'Full Day',
  partial: 'Partial',
  holiday: 'Holiday',
  emergency: 'Emergency',
  maintenance: 'Maintenance',
  special: 'Special',
}

const CLOSURE_TYPE_COLORS: Record<ClosureType, string> = {
  full: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  holiday: 'bg-blue-100 text-blue-700',
  emergency: 'bg-red-200 text-red-800',
  maintenance: 'bg-gray-100 text-gray-700',
  special: 'bg-purple-100 text-purple-700',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOvernight(open: string, close: string): boolean {
  if (close === '00:00' && open > '00:00') return true
  return close < open
}

function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Hours row component ───────────────────────────────────────────────────────

interface DayRowProps {
  row: HoursRow
  onChange: (updated: HoursRow) => void
}

function DayRow({ row, onChange }: DayRowProps) {
  const overnight = isOvernight(row.open_time, row.close_time)

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-3 pr-4 w-28">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={row.active}
            onChange={(e) => onChange({ ...row, active: e.target.checked })}
            className="w-4 h-4 rounded text-indigo-600"
            aria-label={`${DAY_NAMES[row.day_of_week]} active`}
          />
          <span className={`text-sm font-medium ${row.active ? 'text-gray-900' : 'text-gray-400'}`}>
            {DAY_NAMES[row.day_of_week]}
          </span>
        </label>
      </td>
      <td className="py-3 pr-3">
        <input
          type="time"
          value={row.open_time}
          disabled={!row.active}
          onChange={(e) => onChange({ ...row, open_time: e.target.value })}
          className="border border-gray-200 rounded-md px-2 py-1 text-sm disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          aria-label={`${DAY_NAMES[row.day_of_week]} open time`}
        />
      </td>
      <td className="py-3 pr-3">
        <input
          type="time"
          value={row.close_time}
          disabled={!row.active}
          onChange={(e) => onChange({ ...row, close_time: e.target.value })}
          className="border border-gray-200 rounded-md px-2 py-1 text-sm disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          aria-label={`${DAY_NAMES[row.day_of_week]} close time`}
        />
      </td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={240}
            value={row.last_order_offset_minutes}
            disabled={!row.active}
            onChange={(e) => onChange({ ...row, last_order_offset_minutes: Number(e.target.value) })}
            className="border border-gray-200 rounded-md px-2 py-1 text-sm w-16 disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            aria-label={`${DAY_NAMES[row.day_of_week]} last order offset`}
          />
          <span className="text-xs text-gray-500">min</span>
        </div>
      </td>
      <td className="py-3">
        {row.active && overnight && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
            Overnight
          </span>
        )}
      </td>
    </tr>
  )
}

// ── Add Closure Modal ─────────────────────────────────────────────────────────

interface ClosureModalProps {
  onSave: (data: CreateClosureInput) => Promise<void>
  onClose: () => void
}

function ClosureModal({ onSave, onClose }: ClosureModalProps) {
  const [form, setForm] = useState<CreateClosureInput>({
    closure_type: 'full',
    date: new Date().toISOString().slice(0, 10),
    recurring: false,
  })
  const [partial, setPartial] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (partial && (!form.partial_open || !form.partial_close)) {
      setError('Partial closures require both open and close times')
      return
    }
    setSaving(true)
    try {
      await onSave(partial ? form : { ...form, partial_open: undefined, partial_close: undefined })
      onClose()
    } catch {
      setError('Failed to save closure')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-label="Add closure">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Add closure</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={form.closure_type}
              onChange={(e) => setForm({ ...form, closure_type: e.target.value as ClosureType })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {CLOSURE_TYPES.map((t) => (
                <option key={t} value={t}>{CLOSURE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={partial}
                onChange={(e) => setPartial(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600"
              />
              <span className="text-sm text-gray-700">Partial closure (restaurant open limited hours)</span>
            </label>
          </div>
          {partial && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Opens at</label>
                <input
                  type="time"
                  value={form.partial_open ?? ''}
                  onChange={(e) => setForm({ ...form, partial_open: e.target.value })}
                  required={partial}
                  className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  aria-label="Partial open time"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Closes at</label>
                <input
                  type="time"
                  value={form.partial_close ?? ''}
                  onChange={(e) => setForm({ ...form, partial_close: e.target.value })}
                  required={partial}
                  className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  aria-label="Partial close time"
                />
              </div>
            </div>
          )}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.recurring ?? false}
                onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600"
              />
              <span className="text-sm text-gray-700">Recurring annually</span>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={form.reason ?? ''}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              maxLength={500}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="e.g. Staff training day"
            />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
            <Button loading={saving} type="submit">Add closure</Button>
          </div>
        </form>
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
  const [loadingHours, setLoadingHours] = useState(true)
  const [savingHours, setSavingHours] = useState(false)
  const [savingScheduling, setSavingScheduling] = useState(false)
  const [showClosureModal, setShowClosureModal] = useState(false)
  const [deletingClosureId, setDeletingClosureId] = useState<string | null>(null)
  const [hoursSaved, setHoursSaved] = useState(false)
  const [schedSaved, setSchedSaved] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void Promise.all([
      api.admin.getHours(),
      api.admin.getScheduling(),
      api.admin.listClosures(),
      api.admin.getSchedulingPreview(),
    ]).then(([h, s, c, sl]) => {
      setHours(h)
      setScheduling(s)
      setClosures(c)
      setSlots(sl)
    }).finally(() => setLoadingHours(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateHoursRow(updated: HoursRow) {
    setHours((prev) => prev.map((r) => r.day_of_week === updated.day_of_week ? updated : r))
  }

  async function saveHours() {
    setSavingHours(true)
    try {
      const saved = await api.admin.putHours(hours)
      setHours(saved)
      setHoursSaved(true)
      setTimeout(() => setHoursSaved(false), 2000)
    } finally {
      setSavingHours(false)
    }
  }

  function onSchedulingChange(patch: Partial<SchedulingConfig>) {
    const next = { ...scheduling, ...patch }
    setScheduling(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await api.admin.patchScheduling(patch)
        const preview = await api.admin.getSchedulingPreview()
        setSlots(preview)
        setSchedSaved(true)
        setTimeout(() => setSchedSaved(false), 2000)
      } catch { /* silently ignore preview errors */ }
    }, 500)
  }

  async function handleAddClosure(data: CreateClosureInput) {
    const closure = await api.admin.createClosure(data)
    setClosures((prev) => [...prev, closure].sort((a, b) => a.date.localeCompare(b.date)))
  }

  async function handleDeleteClosure(id: string) {
    setDeletingClosureId(id)
    try {
      await api.admin.deleteClosure(id)
      setClosures((prev) => prev.filter((c) => c.id !== id))
    } finally {
      setDeletingClosureId(null)
    }
  }

  if (loadingHours) {
    return <div className="p-8 text-gray-500">Loading…</div>
  }

  return (
    <div className="p-8 max-w-4xl space-y-8">
      {/* Weekly hours */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Operating hours</h2>
          <div className="flex items-center gap-3">
            {hoursSaved && <span className="text-sm text-green-600">Saved</span>}
            <Button loading={savingHours} onClick={saveHours}>Save all hours</Button>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Day</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Opens</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Closes</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Last order</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody className="px-4">
              {hours.map((row) => (
                <DayRow key={row.day_of_week} row={row} onChange={updateHoursRow} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Scheduling config */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Scheduling configuration</h2>
          {schedSaved && <span className="text-sm text-green-600">Saved</span>}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
          <div className="flex items-center gap-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prep time (minutes)</label>
              <input
                type="number"
                min={5}
                max={120}
                value={scheduling.base_prep_minutes}
                onChange={(e) => onSchedulingChange({ base_prep_minutes: Number(e.target.value) })}
                aria-label="Prep time"
                className="border border-gray-200 rounded-md px-3 py-2 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-1">Slot interval</span>
              <div className="flex items-center gap-4">
                {([15, 30] as const).map((v) => (
                  <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="scheduling_interval"
                      value={v}
                      checked={scheduling.scheduling_interval === v}
                      onChange={() => onSchedulingChange({ scheduling_interval: v })}
                      className="text-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{v} min</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Future days allowed: <strong>{scheduling.future_days_allowed}</strong>
              </label>
              <input
                type="range"
                min={0}
                max={14}
                value={scheduling.future_days_allowed}
                onChange={(e) => onSchedulingChange({ future_days_allowed: Number(e.target.value) })}
                aria-label="Future days allowed"
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>0</span><span>7</span><span>14</span>
              </div>
            </div>
          </div>

          {/* Slot preview */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Next available slots (preview)</p>
            {slots.length === 0 ? (
              <p className="text-sm text-gray-400">No available slots</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.slice(0, 5).map((s) => (
                  <span key={s} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md">
                    {formatSlot(s)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Special closures */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Special closures</h2>
          <Button onClick={() => setShowClosureModal(true)}>Add closure</Button>
        </div>
        {closures.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
            No upcoming closures
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Date</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Type</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Reason</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Recurring</th>
                  <th className="py-2 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {closures.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 px-4 text-sm text-gray-900">{c.date}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CLOSURE_TYPE_COLORS[c.closure_type]}`}>
                        {CLOSURE_TYPE_LABELS[c.closure_type]}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{c.reason ?? '—'}</td>
                    <td className="py-3 px-4">
                      {c.recurring && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">Recurring</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => void handleDeleteClosure(c.id)}
                        disabled={deletingClosureId === c.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                        aria-label={`Delete closure ${c.date}`}
                      >
                        {deletingClosureId === c.id ? '…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showClosureModal && (
        <ClosureModal onSave={handleAddClosure} onClose={() => setShowClosureModal(false)} />
      )}
    </div>
  )
}
