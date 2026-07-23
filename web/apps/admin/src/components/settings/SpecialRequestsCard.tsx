import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import type { Restaurant } from '@wolfchow/types'
import { useApi } from '../../lib/api'
import { Card } from './Card'
import { SectionHeader } from './SectionHeader'

export function SpecialRequestsCard({ restaurant, onSave }: { restaurant: Restaurant; onSave: () => void }) {
  const api = useApi()
  const [enabled, setEnabled] = useState(restaurant.special_requests_enabled)
  const [saving, setSaving] = useState(false)

  async function handleChange(next: boolean) {
    setEnabled(next)
    setSaving(true)
    try {
      await api.admin.patchRestaurant({ special_requests_enabled: next })
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionHeader icon={MessageSquare} label="Special requests" />
      <label className="flex cursor-pointer items-start gap-3" onClick={() => !saving && void handleChange(!enabled)}>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Allow special instructions"
          disabled={saving}
          className="relative mt-0.5 flex-shrink-0 border-0 bg-transparent p-0"
        >
          <div className={`h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-200'}`} />
          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
        <div>
          <div className="text-sm font-medium text-gray-900">Allow special instructions</div>
          <div className="mt-0.5 text-xs text-gray-500">
            Default for all items — customers can add a note like "no onions" at checkout.
            Override per item in the menu editor.
          </div>
        </div>
      </label>
    </Card>
  )
}
