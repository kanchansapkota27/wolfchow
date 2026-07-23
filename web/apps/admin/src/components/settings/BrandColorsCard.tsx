import { useState, useRef } from 'react'
import { Globe } from 'lucide-react'
import type { Restaurant, BrandColors } from '@wolfchow/types'
import { useApi } from '../../lib/api'
import { Card } from './Card'
import { SectionHeader } from './SectionHeader'

export function BrandColorsCard({ restaurant, onSave }: { restaurant: Restaurant; onSave: () => void }) {
  const api = useApi()
  const [colors, setColors] = useState<BrandColors>(restaurant.brand_colors ?? {})
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(key: keyof BrandColors, value: string) {
    const next = { ...colors, [key]: value }
    setColors(next)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      await api.admin.saveIntegrations({ brand_colors: next })
      onSave()
    }, 400)
  }

  return (
    <Card>
      <SectionHeader icon={Globe} label="Widget theme colors" />
      <p className="mb-4 text-xs text-gray-500">
        These colors are applied to your embedded ordering widget.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(['primary', 'secondary', 'accent', 'text'] as Array<keyof BrandColors>).map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-3">
            <input
              type="color"
              value={colors[key] ?? '#2563eb'}
              onChange={(e) => handleChange(key, e.target.value)}
              className="h-9 w-9 cursor-pointer rounded-lg border border-gray-200"
              aria-label={`${key} colour`}
            />
            <span className="text-sm capitalize text-gray-700">{key}</span>
          </label>
        ))}
      </div>
    </Card>
  )
}
