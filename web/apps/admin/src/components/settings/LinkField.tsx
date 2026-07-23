import { useState } from 'react'
import { cn } from '../../lib/utils'

export function LinkField({ label, initial, onSave }: {
  label: string
  initial: string
  onSave: (url: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (value && !/^https?:\/\/.+/.test(value)) { setError('Must be a valid URL'); return }
    setError(''); setSaving(true)
    try { await onSave(value); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    catch { setError('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <div className="flex gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError('') }}
          placeholder="https://…"
          className={cn(
            'flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400',
            error ? 'border-red-300' : 'border-gray-200',
          )}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-900 disabled:opacity-40"
        >
          {saved ? 'Saved!' : saving ? '…' : 'Save'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  )
}
