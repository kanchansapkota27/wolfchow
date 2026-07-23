import { useState } from 'react'
import { Image } from 'lucide-react'
import type { Restaurant } from '@wolfchow/types'
import { useApi } from '../../lib/api'
import { Card } from './Card'
import { SectionHeader } from './SectionHeader'

const OPTIONS: Array<{ value: Restaurant['menu_image_display']; label: string; description: string }> = [
  { value: 'both', label: 'Both', description: 'Show photos on mobile and desktop' },
  { value: 'desktop', label: 'Desktop only', description: 'Hide photos on small screens' },
  { value: 'mobile', label: 'Mobile only', description: 'Hide photos on desktop' },
  { value: 'off', label: 'Off', description: 'Never show item photos' },
]

export function MenuImageDisplayCard({ restaurant, onSave }: { restaurant: Restaurant; onSave: () => void }) {
  const api = useApi()
  const [value, setValue] = useState<Restaurant['menu_image_display']>(restaurant.menu_image_display)
  const [saving, setSaving] = useState(false)

  async function handleChange(next: Restaurant['menu_image_display']) {
    setValue(next)
    setSaving(true)
    try {
      await api.admin.patchRestaurant({ menu_image_display: next })
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionHeader icon={Image} label="Menu item photos" />
      <p className="mb-4 text-xs text-gray-500">
        Choose where item photos appear in your ordering widget.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50"
          >
            <input
              type="radio"
              name="menu_image_display"
              value={opt.value}
              checked={value === opt.value}
              disabled={saving}
              onChange={() => void handleChange(opt.value)}
              className="mt-0.5"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">{opt.label}</div>
              <div className="text-xs text-gray-500">{opt.description}</div>
            </div>
          </label>
        ))}
      </div>
    </Card>
  )
}
