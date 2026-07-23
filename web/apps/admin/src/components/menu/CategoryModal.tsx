import { useState } from 'react'
import { X } from 'lucide-react'
import type { MenuCategory } from '@wolfchow/types'
import { ApiError } from '@wolfchow/api-client'

const FIELD = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400'

export function CategoryModal({ category, onClose, onSave }: {
  category: MenuCategory | null
  onClose: () => void
  onSave: (data: { name: string; active: boolean }) => Promise<void>
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [active, setActive] = useState(category?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), active })
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        const body = err.body as { error?: string; limit?: number }
        setError(body?.error === 'plan_limit_reached'
          ? `Category limit reached (${body.limit ?? 0}). Upgrade your plan to add more.`
          : 'This feature is not available on your current plan.')
      } else {
        setError(err instanceof ApiError ? String(err.message) : 'Save failed.')
      }
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-40 w-96 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{category ? 'Edit Category' : 'Add Category'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
          <input
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>
        <label className="mb-5 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-blue-500" />
          Active (visible to customers)
        </label>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : category ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </>
  )
}
