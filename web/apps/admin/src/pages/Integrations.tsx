import { useState, useEffect, useRef } from 'react'
import { Button } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import type { Restaurant, BrandColors } from '@wolfchow/types'

const WIDGET_CDN = 'https://widget.wolfchow.com/widget.js'

const SOCIAL_PLATFORMS = [
  { key: 'google_business', label: 'Google Business' },
  { key: 'facebook',        label: 'Facebook' },
  { key: 'instagram',       label: 'Instagram' },
  { key: 'tiktok',          label: 'TikTok' },
  { key: 'yelp',            label: 'Yelp' },
  { key: 'tripadvisor',     label: 'Tripadvisor' },
]

const DELIVERY_PLATFORMS = [
  { key: 'doordash',  label: 'DoorDash' },
  { key: 'ubereats',  label: 'Uber Eats' },
  { key: 'grubhub',   label: 'Grubhub' },
]

type DarkMode = 'light' | 'dark' | 'auto'

function isValidUrl(s: string): boolean {
  if (!s) return true
  try { new URL(s); return true } catch { return false }
}

function previewSrc(slug: string, colors: BrandColors, dark: DarkMode): string {
  const params = new URLSearchParams()
  if (colors.primary)   params.set('primary',   colors.primary)
  if (colors.secondary) params.set('secondary', colors.secondary)
  if (colors.accent)    params.set('accent',    colors.accent)
  if (colors.text)      params.set('text',      colors.text)
  params.set('dark', dark)
  return `https://widget.wolfchow.com/preview/${slug}?${params.toString()}`
}

// ── Embed code card ───────────────────────────────────────────────────────────

function EmbedCard({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)
  const code = `<script src="${WIDGET_CDN}" data-restaurant="${slug}"></script>`

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Embed code</h3>
      <pre className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">{code}</pre>
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-md px-3 py-1"
          aria-label="Copy embed code"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </section>
  )
}

// ── Brand colours ─────────────────────────────────────────────────────────────

interface BrandColorsProps {
  initial: BrandColors
  onSave: (colors: BrandColors) => void
}

function BrandColorsSection({ initial, onSave }: BrandColorsProps) {
  const [colors, setColors] = useState<BrandColors>(initial)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(key: keyof BrandColors, value: string) {
    const next = { ...colors, [key]: value }
    setColors(next)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => onSave(next), 300)
  }

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Brand colours</h3>
      <div className="grid grid-cols-2 gap-4">
        {(Object.keys({ primary: '', secondary: '', accent: '', text: '' }) as Array<keyof BrandColors>).map((key) => (
          <label key={key} className="flex items-center gap-3">
            <input
              type="color"
              value={colors[key] ?? '#6366f1'}
              onChange={(e) => handleChange(key, e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
              aria-label={`${key} colour`}
            />
            <span className="text-sm text-gray-700 capitalize">{key}</span>
          </label>
        ))}
      </div>
    </section>
  )
}

// ── Dark mode radio ───────────────────────────────────────────────────────────

function DarkModeSection({ value, onChange }: { value: DarkMode; onChange: (v: DarkMode) => void }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Dark mode default</h3>
      <div className="flex gap-4">
        {(['light', 'dark', 'auto'] as DarkMode[]).map((mode) => (
          <label key={mode} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 capitalize">
            <input
              type="radio"
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
              className="text-indigo-600"
              aria-label={`Dark mode ${mode}`}
            />
            {mode}
          </label>
        ))}
      </div>
    </section>
  )
}

// ── Link row (delivery / social) ──────────────────────────────────────────────

interface LinkRowProps {
  label: string
  linkKey: string
  initial: string
  onSave: (key: string, url: string) => Promise<void>
}

function LinkRow({ label, linkKey, initial, onSave }: LinkRowProps) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!isValidUrl(value)) { setError('Invalid URL'); return }
    setError('')
    setSaving(true)
    try {
      await onSave(linkKey, value)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      <div className="flex gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError('') }}
          placeholder="https://…"
          className={`flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 ${error ? 'border-red-300 focus:ring-red-400' : 'border-gray-200'}`}
          aria-label={`${label} URL`}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-md px-2 disabled:opacity-40"
        >
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  )
}

// ── Google Maps ───────────────────────────────────────────────────────────────

function GoogleMapsSection() {
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState('')

  function handleApply() {
    setPreview(code)
  }

  const srcMatch = /<iframe[^>]+src="([^"]+)"/.exec(preview)
  const iframeSrc = srcMatch?.[1] ?? ''

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Google Maps embed</h3>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your Google Maps <iframe> embed code here"
        rows={3}
        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
        aria-label="Google Maps embed code"
      />
      <Button onClick={handleApply} variant="ghost" type="button">Preview</Button>
      {iframeSrc && (
        <iframe
          src={iframeSrc}
          className="w-full h-48 rounded-lg border border-gray-100"
          title="Google Maps preview"
          aria-label="Google Maps preview"
        />
      )}
    </section>
  )
}

// ── Main Integrations page ────────────────────────────────────────────────────

export function Integrations() {
  const api = useApi()
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [loading, setLoading] = useState(true)
  const [colors, setColors] = useState<BrandColors>({})
  const [darkMode, setDarkMode] = useState<DarkMode>('auto')

  useEffect(() => {
    void api.admin.getRestaurant().then((r) => {
      setRestaurant(r)
      setColors(r.brand_colors ?? {})
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSaveColors(c: BrandColors) {
    setColors(c)
    await api.admin.saveIntegrations({ brand_colors: c })
  }

  async function handleSaveDelivery(key: string, url: string) {
    const updated = { ...(restaurant?.delivery_links ?? {}), [key]: url }
    await api.admin.saveIntegrations({ delivery_links: updated })
    if (restaurant) setRestaurant({ ...restaurant, delivery_links: updated })
  }

  async function handleSaveSocial(key: string, url: string) {
    const updated = { ...(restaurant?.social_links ?? {}), [key]: url }
    await api.admin.saveIntegrations({ social_links: updated })
    if (restaurant) setRestaurant({ ...restaurant, social_links: updated })
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>
  if (!restaurant) return <div className="p-8 text-gray-500">Failed to load</div>

  const iframeSrc = previewSrc(restaurant.slug, colors, darkMode)

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <h2 className="text-base font-semibold text-gray-900">Integrations & widget</h2>

      <EmbedCard slug={restaurant.slug} />

      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Widget preview</h3>
          <a href={iframeSrc} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800">
            Open full preview ↗
          </a>
        </div>
        <iframe
          src={iframeSrc}
          title="Widget preview"
          aria-label="Widget preview"
          className="w-full h-72 rounded-lg border border-gray-100"
        />
      </section>

      <BrandColorsSection initial={colors} onSave={handleSaveColors} />

      <DarkModeSection value={darkMode} onChange={setDarkMode} />

      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Delivery partners</h3>
        {DELIVERY_PLATFORMS.map(({ key, label }) => (
          <LinkRow
            key={key}
            label={label}
            linkKey={key}
            initial={restaurant.delivery_links[key] ?? ''}
            onSave={handleSaveDelivery}
          />
        ))}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Social links</h3>
        {SOCIAL_PLATFORMS.map(({ key, label }) => (
          <LinkRow
            key={key}
            label={label}
            linkKey={key}
            initial={restaurant.social_links[key] ?? ''}
            onSave={handleSaveSocial}
          />
        ))}
      </section>

      <GoogleMapsSection />
    </div>
  )
}
