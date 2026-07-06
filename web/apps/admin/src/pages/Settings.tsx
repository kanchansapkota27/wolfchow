import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@wolfchow/ui'
import { ApiError } from '@wolfchow/api-client'
import type { Restaurant, BrandColors } from '@wolfchow/types'
import type { StripeStatus, PaymentMethods, TipsConfig, TaxConfig, AutomationConfig } from '@wolfchow/api-client'
import { COUNTRIES } from '@wolfchow/utils'
import { Zap, ShieldCheck, CreditCard, Store, Clock, Globe, Link2, User } from 'lucide-react'
import { cn } from '../lib/utils'
import { useApi } from '../lib/api'
import { usePlan } from '../lib/usePlan'
import { PlanLocked } from '../components/UpgradeModal'
import { sanitizeHtml } from '../lib/sanitize'

// ── Constants ──────────────────────────────────────────────────────────────────

const CUISINE_TYPES = [
  'American', 'Asian Fusion', 'BBQ', 'Bakery', 'Burgers', 'Cafe', 'Chinese',
  'Fast Food', 'Greek', 'Indian', 'Italian', 'Japanese', 'Mediterranean',
  'Mexican', 'Middle Eastern', 'Pizza', 'Sandwiches', 'Seafood', 'Steakhouse',
  'Sushi', 'Thai', 'Turkish', 'Vegan', 'Vietnamese',
]

const SERVICES = [
  { value: 'full_dine_in', label: 'Full Service Dine-in' },
  { value: 'self_dine_in', label: 'Self Service Dine-in' },
  { value: 'togo', label: 'Togo / Takeaway' },
]

const SOCIAL_PLATFORMS = [
  { key: 'google_business', label: 'Google Business' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'yelp', label: 'Yelp' },
  { key: 'tripadvisor', label: 'Tripadvisor' },
]

const DELIVERY_PLATFORMS = [
  { key: 'doordash', label: 'DoorDash' },
  { key: 'ubereats', label: 'Uber Eats' },
  { key: 'grubhub', label: 'Grubhub' },
]

const SK_RE = /^sk_(live|test)_/
const PK_RE = /^pk_(live|test)_/

const METHOD_LABELS: Record<string, string> = {
  card: 'Card',
  pickup: 'Pay on Pickup',
  delivery: 'Pay on Delivery',
}

// ── Form primitives ────────────────────────────────────────────────────────────

const FIELD_CLS = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400'
const READONLY_CLS = 'w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-500'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}



function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      <Icon size={16} className="text-blue-600" />
      <span className="text-xs font-bold tracking-widest text-gray-700 uppercase">{label}</span>
    </div>
  )
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <div className="relative mt-0.5 flex-shrink-0" onClick={() => onChange(!checked)}>
        <div className={cn(
          'h-5 w-9 rounded-full transition-colors',
          checked ? 'bg-blue-600' : 'bg-gray-200',
        )} />
        <div className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )} />
      </div>
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description && <div className="mt-0.5 text-xs text-gray-500">{description}</div>}
      </div>
    </label>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-gray-200 bg-white p-6', className)}>
      {children}
    </div>
  )
}

// ── Link field ────────────────────────────────────────────────────────────────

function LinkField({ label, initial, onSave }: {
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

// ── Brand colors card ─────────────────────────────────────────────────────────

function BrandColorsCard({ restaurant, onSave }: { restaurant: Restaurant; onSave: () => void }) {
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

// ── Restaurant Profile section ─────────────────────────────────────────────────

function RestaurantProfileContent({ restaurant, onSave }: {
  restaurant: Restaurant
  onSave: () => void
}) {
  const api = useApi()
  const { plan, upgradeMessage } = usePlan()
  const [displayName, setDisplayName] = useState(restaurant.display_name)
  const [businessName, setBusinessName] = useState(restaurant.business_name)
  const [address, setAddress] = useState<Record<string, string>>({
    line1: (restaurant.address as Record<string, string>).line1 ?? '',
    city: (restaurant.address as Record<string, string>).city ?? '',
    country: (restaurant.address as Record<string, string>).country ?? '',
  })
  const [cuisineSearch, setCuisineSearch] = useState('')
  const [cuisineType, setCuisineType] = useState(restaurant.cuisine_type ?? '')
  const [services, setServices] = useState<string[]>(restaurant.services_offered ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function save() {
    setError(null); setSuccess(false); setSaving(true)
    try {
      await api.admin.patchRestaurant({
        display_name: displayName,
        business_name: businessName,
        address,
        cuisine_type: cuisineType || undefined,
        services_offered: services,
      })
      setSuccess(true)
      onSave()
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadLogo(file: File) {
    setUploadError(null); setUploading(true); setUploadProgress(0)
    try {
      const { upload_url } = await api.admin.getLogoUploadUrl()
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('Upload failed')))
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.open('PUT', upload_url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })
      setPreviewUrl(URL.createObjectURL(file))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const filteredCuisines = CUISINE_TYPES.filter((c) =>
    c.toLowerCase().includes(cuisineSearch.toLowerCase()),
  )
  const displayLogoUrl = previewUrl ?? (restaurant.logo_r2_key ? `/r2/${restaurant.logo_r2_key}` : null)

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader icon={Store} label="Restaurant details" />
        <div className="space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</p>}
          {success && <p className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700">Changes saved.</p>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Display name">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className={FIELD_CLS} />
            </Field>
            <Field label="Business name">
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                className={FIELD_CLS} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Slug" hint="Contact support to change">
              <div className={READONLY_CLS}>{restaurant.slug}</div>
            </Field>
            <Field label="Timezone" hint="Contact support to change">
              <div className={READONLY_CLS}>{restaurant.timezone}</div>
            </Field>
            <Field label="Currency" hint="Contact support to change">
              <div className={READONLY_CLS}>{restaurant.currency}</div>
            </Field>
          </div>

          <Field label="Street address">
            <input value={address.line1} onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
              autoComplete="street-address" className={FIELD_CLS} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City">
              <input value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                autoComplete="address-level2" className={FIELD_CLS} />
            </Field>
            <Field label="Country">
              <select value={address.country}
                onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))}
                className={FIELD_CLS}>
                <option value="">— Select country —</option>
                {COUNTRIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Cuisine type">
            <input
              value={cuisineSearch || cuisineType}
              onChange={(e) => { setCuisineSearch(e.target.value); if (!e.target.value) setCuisineType('') }}
              placeholder="Search cuisine type…"
              className={FIELD_CLS}
              list="cuisine-options"
            />
            <datalist id="cuisine-options">
              {filteredCuisines.map((c) => <option key={c} value={c} />)}
            </datalist>
            {cuisineType && !cuisineSearch && (
              <p className="mt-1 text-xs text-gray-500">Selected: <span className="font-medium text-gray-700">{cuisineType}</span></p>
            )}
          </Field>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-gray-700">Services offered</legend>
            <div className="flex flex-wrap gap-2">
              {SERVICES.map(({ value, label }) => {
                const active = services.includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setServices((s) => active ? s.filter((x) => x !== value) : [...s, value])}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader icon={Store} label="Logo" />
        {uploadError && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</p>}
        {displayLogoUrl && (
          <img src={displayLogoUrl} alt="Logo" className="mb-4 h-16 w-16 rounded-lg border border-gray-200 object-contain" />
        )}
        <div
          role="button" tabIndex={0} aria-label="Upload logo"
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 text-sm text-gray-500 hover:border-blue-400 hover:bg-blue-50"
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void uploadLogo(f) }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        >
          {uploading ? (
            <div className="w-full">
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="mt-1 text-center text-xs">{uploadProgress}%</p>
            </div>
          ) : (
            <p>Drag and drop or <span className="text-blue-600">click to browse</span></p>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f) }} />
      </Card>

      <PlanLocked locked={plan?.feature_flags.custom_brand_color === false} upgradeMessage={upgradeMessage} label="Custom brand colors require a higher plan">
        <BrandColorsCard restaurant={restaurant} onSave={onSave} />
      </PlanLocked>

      <Card>
        <SectionHeader icon={Globe} label="Social links" />
        <div className="space-y-3">
          {SOCIAL_PLATFORMS.map(({ key, label }) => (
            <LinkField
              key={key}
              label={label}
              initial={(restaurant.social_links as Record<string, string>)[key] ?? ''}
              onSave={async (url) => {
                const updated = { ...(restaurant.social_links as Record<string, string>), [key]: url }
                await api.admin.saveIntegrations({ social_links: updated })
                onSave()
              }}
            />
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader icon={Link2} label="Delivery partners" />
        <div className="space-y-3">
          {DELIVERY_PLATFORMS.map(({ key, label }) => (
            <LinkField
              key={key}
              label={label}
              initial={(restaurant.delivery_links as Record<string, string>)[key] ?? ''}
              onSave={async (url) => {
                const updated = { ...(restaurant.delivery_links as Record<string, string>), [key]: url }
                await api.admin.saveIntegrations({ delivery_links: updated })
                onSave()
              }}
            />
          ))}
        </div>
      </Card>
    </div>
  )
}

function AdminProfileFields() {
  const api = useApi()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  async function saveProfile() {
    setError(null); setSuccess(false); setSaving(true)
    try {
      await api.admin.patchProfile({ name: name || undefined, phone: phone || undefined })
      setSuccess(true)
    } catch (err) { setError(err instanceof ApiError ? String(err.message) : 'Save failed.') }
    finally { setSaving(false) }
  }

  async function changePassword() {
    setPwError(null); setPwSuccess(false)
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return }
    if (newPw !== confirm) { setPwError('Passwords do not match.'); return }
    setPwSaving(true)
    try {
      await api.admin.changePassword({ current_password: current, new_password: newPw })
      setPwSuccess(true)
      setCurrent(''); setNewPw(''); setConfirm('')
    } catch (err) { setPwError(err instanceof ApiError ? String(err.message) : 'Password change failed.') }
    finally { setPwSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</p>}
        {success && <p className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700">Profile updated.</p>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLS} placeholder="Your name" />
          </Field>
          <Field label="Phone">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD_CLS} placeholder="+1 555 000 0000" />
          </Field>
        </div>
        <button type="button" disabled={saving} onClick={() => void saveProfile()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
      <div className="border-t border-gray-100 pt-5">
        <p className="mb-4 text-sm font-semibold text-gray-700">Change password</p>
        {pwError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{pwError}</p>}
        {pwSuccess && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700">Password changed.</p>}
        <div className="space-y-3">
          <Field label="Current password">
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={FIELD_CLS} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="New password">
              <input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={FIELD_CLS} />
            </Field>
            <Field label="Confirm new password">
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={FIELD_CLS} />
            </Field>
          </div>
          <button type="button" disabled={pwSaving} onClick={() => void changePassword()}
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60">
            {pwSaving ? 'Updating…' : 'Change password'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payments & Tipping section ─────────────────────────────────────────────────

function StripeKeyGuide({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Stripe restricted key setup guide"
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[88vh] overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">How to create a restricted Stripe key</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0" aria-label="Close">×</button>
        </div>

        <p className="text-sm text-gray-600">
          Use a <strong>restricted key</strong> instead of your full secret key. If it's ever leaked,
          an attacker can only interact with existing payments — they cannot access your balance,
          trigger payouts, or touch account settings.
        </p>

        <div>
          <h4 className="text-sm font-medium text-gray-800 mb-2">Steps</h4>
          <ol className="space-y-1.5 text-sm text-gray-700 list-decimal list-inside">
            <li>Open <strong>Stripe Dashboard → Developers → API keys</strong></li>
            <li>Click <strong>+ Create restricted key</strong></li>
            <li>Name it something like <em>"WolfChow POS"</em></li>
            <li>Set only the permissions listed below — leave everything else as <em>None</em></li>
            <li>Click <strong>Create key</strong> and paste it here</li>
          </ol>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-800 mb-2">Required permissions</h4>
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Resource</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Level</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-2 text-gray-800 font-medium">Payment Intents</td>
                <td className="px-3 py-2"><span className="text-amber-700 font-semibold">Write</span></td>
                <td className="px-3 py-2 text-gray-500">Create &amp; capture card payments</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-800 font-medium">Charges</td>
                <td className="px-3 py-2"><span className="text-blue-700 font-semibold">Read</span></td>
                <td className="px-3 py-2 text-gray-500">Verify charge status on orders</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-800 font-medium">Refunds</td>
                <td className="px-3 py-2"><span className="text-amber-700 font-semibold">Write</span></td>
                <td className="px-3 py-2 text-gray-500">Refund card on rejected orders</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm font-medium text-red-800 mb-1.5">Leave all of these as None:</p>
          <ul className="text-sm text-red-700 grid grid-cols-2 gap-x-4 gap-y-0.5 list-disc list-inside">
            <li>Payouts</li>
            <li>Balance</li>
            <li>Account settings</li>
            <li>Connected accounts</li>
            <li>Customers</li>
            <li>Products &amp; Prices</li>
            <li>Webhook endpoints</li>
            <li>Disputes</li>
          </ul>
        </div>

        <p className="text-xs text-gray-400">
          Worst case if leaked: an attacker could cancel or refund orders already in flight.
          They cannot move money out of your Stripe account.
        </p>

        <button
          onClick={onClose}
          className="w-full text-sm bg-gray-900 hover:bg-gray-800 text-white rounded-lg px-4 py-2"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

function StripeBlock({ status, onSave, onRemove }: {
  status: StripeStatus
  onSave: (data: { secret_key: string; publishable_key: string }) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [secretKey, setSecretKey] = useState('')
  const [publishableKey, setPublishableKey] = useState(status.publishable_key ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const connected = status.has_secret && !!status.publishable_key

  async function handleSave() {
    if (!SK_RE.test(secretKey)) { setError('Secret key must start with sk_live_ or sk_test_'); return }
    if (!PK_RE.test(publishableKey)) { setError('Publishable key must start with pk_live_ or pk_test_'); return }
    setSaving(true); setError('')
    try {
      await onSave({ secret_key: secretKey, publishable_key: publishableKey })
      setSecretKey('')
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 422
        ? 'Stripe rejected the key — please check it is correct'
        : 'Failed to save keys')
    } finally { setSaving(false) }
  }

  async function handleRemove() {
    setRemoving(true)
    try { await onRemove(); setPublishableKey(''); setConfirmRemove(false) }
    finally { setRemoving(false) }
  }

  return (
    <>
      {showGuide && <StripeKeyGuide onClose={() => setShowGuide(false)} />}
    <Card className="mb-4">
      <SectionHeader icon={CreditCard} label="Stripe Integration" />
      {connected ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 flex items-center justify-center rounded-full bg-green-500 text-white text-xs">✓</div>
            <div>
              <p className="text-sm font-semibold text-green-800">Connected to Stripe</p>
              <p className="text-xs text-green-600">Your restaurant can now accept card payments.</p>
            </div>
          </div>
          <span className="text-xs font-bold text-green-600 tracking-wider">LIVE</span>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Not connected — add your Stripe keys to accept card payments.
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold tracking-widest text-gray-500 uppercase">Publishable Key</label>
          <input type="text" value={publishableKey}
            onChange={(e) => { setPublishableKey(e.target.value); setError('') }}
            placeholder="pk_live_••••••••"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <label className="text-xs font-bold tracking-widest text-gray-500 uppercase">Secret Key</label>
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="w-4 h-4 rounded-full bg-gray-200 hover:bg-blue-100 hover:text-blue-700 text-gray-500 text-xs font-bold flex items-center justify-center leading-none transition-colors"
              title="How to create a minimal-permission restricted key"
              aria-label="Stripe key setup guide"
            >
              ?
            </button>
          </div>
          <input type="password" value={secretKey}
            onChange={(e) => { setSecretKey(e.target.value); setError('') }}
            placeholder="sk_live_••••••••"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <p className="mt-1 text-xs text-gray-400">ⓘ Your secret key is encrypted at rest and never shown again.</p>
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex items-center gap-3">
          <button onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60">
            {saving ? 'Verifying…' : saved ? '✓ Saved' : '⊟ Save & Verify Keys'}
          </button>
          {connected && !confirmRemove && (
            <button onClick={() => setConfirmRemove(true)} className="text-sm text-red-500 hover:text-red-700">Remove keys</button>
          )}
          {confirmRemove && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Remove?</span>
              <Button loading={removing} onClick={() => void handleRemove()}>Confirm</Button>
              <button onClick={() => setConfirmRemove(false)} className="text-sm text-gray-500">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </Card>
    </>
  )
}

function PaymentsTippingContent() {
  const api = useApi()
  const qc = useQueryClient()
  const [stripe, setStripe] = useState<StripeStatus>({ publishable_key: null, has_secret: false, updated_at: null })
  const [methods, setMethods] = useState<PaymentMethods>({ payment_methods: [], pickup_delivery_note: null })
  const [planAllowed, setPlanAllowed] = useState<string[] | null>(null)
  const [tips, setTips] = useState<TipsConfig>({ tips_enabled: false, tip_presets: [], allow_custom_tip: false, show_no_tip: false })
  const [tax, setTax] = useState<TaxConfig>({ tax_enabled: false, tax_rate: 0, tax_inclusive: false })
  const [loading, setLoading] = useState(true)
  const [tipsSaving, setTipsSaving] = useState(false)
  const [tipsSaved, setTipsSaved] = useState(false)
  const [taxSaving, setTaxSaving] = useState(false)
  const [taxSaved, setTaxSaved] = useState(false)
  const [taxError, setTaxError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    void Promise.all([
      api.admin.getStripeStatus(),
      api.admin.getPaymentMethods(),
      api.admin.getTips(),
      api.admin.getTax(),
    ]).then(([s, m, t, tx]) => {
      setStripe(s); setMethods(m); setNote(m.pickup_delivery_note ?? ''); setTips(t); setTax(tx)
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleToggleMethod(method: string, on: boolean) {
    const next = on ? [...methods.payment_methods, method] : methods.payment_methods.filter((m) => m !== method)
    try {
      const updated = await api.admin.patchPaymentMethods(next)
      setMethods((prev) => ({ ...prev, payment_methods: updated.payment_methods }))
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        const body = err.body as { allowed?: string[] }
        setPlanAllowed(body?.allowed ?? null)
      }
    }
  }

  async function handleSaveTips() {
    setTipsSaving(true)
    try {
      const updated = await api.admin.patchTips(tips)
      setTips(updated); setTipsSaved(true); setTimeout(() => setTipsSaved(false), 2000)
    } finally { setTipsSaving(false) }
  }

  async function handleSaveTax() {
    if (tax.tax_enabled && tax.tax_rate < 0) { setTaxError('Tax rate must be positive'); return }
    setTaxError(''); setTaxSaving(true)
    try {
      const updated = await api.admin.patchTax(tax)
      setTax(updated); setTaxSaved(true); setTimeout(() => setTaxSaved(false), 2000)
    } finally { setTaxSaving(false) }
  }

  void qc

  if (loading) return <div className="py-8 text-center text-sm text-gray-500">Loading…</div>

  const showNote = methods.payment_methods.includes('pickup') || methods.payment_methods.includes('delivery')
  const PRESET_OPTIONS = [0, 5, 10, 15, 20, 25]

  return (
    <div className="space-y-4">
      {/* Stripe */}
      <StripeBlock
        status={stripe}
        onSave={async (data) => { const s = await api.admin.saveStripeKeys(data); setStripe(s) }}
        onRemove={async () => { await api.admin.deleteStripeKeys(); setStripe({ publishable_key: null, has_secret: false, updated_at: null }) }}
      />

      {/* Payment methods */}
      <Card>
        <SectionHeader icon={CreditCard} label="Payment Methods" />
        {!stripe.has_secret && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            Card payments require Stripe keys. Pickup and delivery can be enabled without Stripe.
          </div>
        )}
        <div className="space-y-2">
          {(['card', 'pickup', 'delivery'] as const).map((method) => {
            const locked = planAllowed !== null && !planAllowed.includes(method)
            const enabled = methods.payment_methods.includes(method)
            return (
              <label key={method}
                className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3',
                  enabled ? 'border-blue-200 bg-blue-50' : 'border-gray-200',
                  locked && 'cursor-not-allowed opacity-50')}>
                <input type="checkbox" checked={enabled}
                  disabled={(method === 'card' && !stripe.has_secret) || locked}
                  onChange={(e) => void handleToggleMethod(method, e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600" />
                <span className="text-sm font-medium text-gray-800">{METHOD_LABELS[method]}</span>
                {locked && <span className="ml-auto text-xs text-gray-400">🔒 Higher plan</span>}
              </label>
            )
          })}
        </div>
        {showNote && (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Pickup/delivery note</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              onBlur={() => void api.admin.patchPickupNote(note || null).then(() =>
                setMethods((prev) => ({ ...prev, pickup_delivery_note: note || null }))
              )}
              rows={2} placeholder="e.g. Please wait at the front desk"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        )}
      </Card>

      {/* Tips */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <SectionHeader icon={CreditCard} label="Tips" />
          <div className="flex items-center gap-2">
            {tipsSaved && <span className="text-xs font-medium text-green-600">Saved</span>}
            <Button loading={tipsSaving} onClick={() => void handleSaveTips()}>Save</Button>
          </div>
        </div>
        <div className="space-y-4">
          <Toggle checked={tips.tips_enabled} onChange={(v) => setTips((t) => ({ ...t, tips_enabled: v }))}
            label="Enable tips" />
          {tips.tips_enabled && (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Tip presets</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_OPTIONS.map((v) => (
                    <label key={v} className="flex cursor-pointer items-center gap-1.5">
                      <input type="checkbox" checked={tips.tip_presets.includes(v)}
                        onChange={() => {
                          const next = tips.tip_presets.includes(v)
                            ? tips.tip_presets.filter((x) => x !== v)
                            : [...tips.tip_presets, v]
                          if (next.length <= 6) setTips((t) => ({ ...t, tip_presets: next }))
                        }}
                        className="h-4 w-4 rounded text-blue-600" />
                      <span className="text-sm text-gray-700">{v}%</span>
                    </label>
                  ))}
                </div>
              </div>
              <Toggle checked={tips.allow_custom_tip}
                onChange={(v) => setTips((t) => ({ ...t, allow_custom_tip: v }))}
                label="Allow custom tip" />
              <Toggle checked={tips.show_no_tip}
                onChange={(v) => setTips((t) => ({ ...t, show_no_tip: v }))}
                label='Show "No tip" option' />
            </>
          )}
        </div>
      </Card>

      {/* Tax */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <SectionHeader icon={CreditCard} label="Tax" />
          <div className="flex items-center gap-2">
            {taxSaved && <span className="text-xs font-medium text-green-600">Saved</span>}
            <Button loading={taxSaving} onClick={() => void handleSaveTax()}>Save</Button>
          </div>
        </div>
        <div className="space-y-4">
          <Toggle checked={tax.tax_enabled} onChange={(v) => setTax((t) => ({ ...t, tax_enabled: v }))}
            label="Enable tax" />
          {tax.tax_enabled && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tax rate (%)</label>
                <input type="number" min={0} max={100} step={0.01} value={tax.tax_rate}
                  onChange={(e) => { setTax((t) => ({ ...t, tax_rate: Number(e.target.value) })); setTaxError('') }}
                  className="w-28 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                {taxError && <p className="mt-1 text-xs text-red-600" role="alert">{taxError}</p>}
              </div>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="tax_inclusive" checked={tax.tax_inclusive}
                    onChange={() => setTax((t) => ({ ...t, tax_inclusive: true }))} className="text-blue-600" />
                  <span className="text-sm text-gray-700">Prices include tax</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="tax_inclusive" checked={!tax.tax_inclusive}
                    onChange={() => setTax((t) => ({ ...t, tax_inclusive: false }))} className="text-blue-600" />
                  <span className="text-sm text-gray-700">Add tax on top</span>
                </label>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

// ── Automation section ─────────────────────────────────────────────────────────

function AutomationContent() {
  const api = useApi()
  const [automation, setAutomation] = useState<AutomationConfig>({
    auto_accept: false, auto_reject_enabled: false, auto_reject_minutes: 15,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.admin.getAutomation().then(setAutomation).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await api.admin.patchAutomation(automation)
      setAutomation(updated); setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="py-8 text-center text-sm text-gray-500">Loading…</div>

  return (
    <Card>
      <div className="mb-5 flex items-center justify-between">
        <SectionHeader icon={Clock} label="Ordering Automation" />
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs font-medium text-green-600">Saved</span>}
          <Button loading={saving} onClick={() => void handleSave()}>Save</Button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                <div className="h-3 w-3 rounded-full border-2 border-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Auto-Accept Orders</p>
                <p className="mt-0.5 text-xs text-gray-500">Bypass manual review and move orders directly to preparation.</p>
              </div>
            </div>
            <div className="flex-shrink-0" onClick={() => setAutomation((a) => ({ ...a, auto_accept: !a.auto_accept }))}>
              <div className={cn('relative h-6 w-11 cursor-pointer rounded-full transition-colors',
                automation.auto_accept ? 'bg-blue-600' : 'bg-gray-300')}>
                <div className={cn('absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  automation.auto_accept ? 'translate-x-5' : 'translate-x-1')} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <div className="h-3 w-3 rounded-full border-2 border-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Auto-Reject Timeout</p>
                <p className="mt-0.5 text-xs text-gray-500">Automatically cancel orders if they aren't accepted within a set time.</p>
              </div>
            </div>
            <div className="flex-shrink-0" onClick={() => setAutomation((a) => ({ ...a, auto_reject_enabled: !a.auto_reject_enabled }))}>
              <div className={cn('relative h-6 w-11 cursor-pointer rounded-full transition-colors',
                automation.auto_reject_enabled ? 'bg-blue-600' : 'bg-gray-300')}>
                <div className={cn('absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  automation.auto_reject_enabled ? 'translate-x-5' : 'translate-x-1')} />
              </div>
            </div>
          </div>

          {automation.auto_reject_enabled && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold tracking-widest text-gray-500 uppercase">Rejection Threshold</span>
                <span className="text-sm font-bold text-blue-600">{automation.auto_reject_minutes} minutes</span>
              </div>
              <input
                type="range"
                min={2} max={15} step={1}
                value={automation.auto_reject_minutes}
                onChange={(e) => setAutomation((a) => ({ ...a, auto_reject_minutes: Number(e.target.value) }))}
                className="w-full accent-blue-600"
              />
              <p className="mt-2 text-center text-xs text-gray-400">
                Orders will be auto-rejected after {automation.auto_reject_minutes} minutes of inactivity.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── Plan & Usage section ───────────────────────────────────────────────────────

function PlanUsageContent({ restaurant }: { restaurant: Restaurant }) {
  const { plan, usage, upgradeMessage } = usePlan()

  const usageItems = [
    { label: 'Categories', used: usage?.categories ?? 0, max: plan?.category_cap ?? 999 },
    { label: 'Items',      used: usage?.items ?? 0,      max: plan?.item_cap ?? 999 },
    { label: 'Devices',    used: usage?.devices ?? 0,    max: plan?.device_cap ?? 999 },
  ]

  const featureList = plan ? [
    { label: 'Menu photos',          on: plan.feature_flags.menu_photos },
    { label: 'Item modifiers',       on: plan.feature_flags.item_modifiers },
    { label: 'Promotions',           on: plan.feature_flags.promotions_enabled },
    { label: 'Email notifications',  on: plan.feature_flags.email_notifications },
    { label: 'Analytics dashboard',  on: plan.feature_flags.analytics_dashboard },
    { label: 'Scheduled orders',     on: plan.feature_flags.scheduled_orders_enabled },
    { label: 'Custom brand colors',  on: plan.feature_flags.custom_brand_color },
    { label: 'Order tracking page',  on: plan.feature_flags.order_tracking_page },
    { label: 'CSV export',           on: plan.feature_flags.export_orders_csv },
    { label: 'Remove "Powered by"',  on: plan.feature_flags.remove_powered_by },
  ] : []

  return (
    <div className="space-y-5">
      {!restaurant.plan_id && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          No plan assigned. Contact your administrator.
        </div>
      )}

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <SectionHeader icon={Zap} label="Plan & Usage" />
          {plan && (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-700">
              {plan.name}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {usageItems.map(({ label, used, max }) => {
            const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0
            return (
              <div key={label}>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-400">{label}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {used}<span className="text-gray-400 text-lg font-normal">/{max}</span>
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
                  <div
                    className={cn('h-1.5 rounded-full transition-all', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-500')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {featureList.length > 0 && (
        <Card>
          <SectionHeader icon={ShieldCheck} label="Features" />
          <div className="grid grid-cols-2 gap-2">
            {featureList.map(({ label, on }) => (
              <div key={label} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', on ? 'text-gray-700' : 'text-gray-400')}>
                <span className={cn('h-2 w-2 shrink-0 rounded-full', on ? 'bg-green-500' : 'bg-gray-300')} />
                {label}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="rounded-xl bg-gray-900 p-6 text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-800">
              <ShieldCheck size={20} className="text-gray-300" />
            </div>
            <div>
              <p className="font-semibold">{upgradeMessage.title}</p>
              <div
                className="mt-0.5 text-sm text-gray-400 [&_p]:inline"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(upgradeMessage.html) }}
              />
            </div>
          </div>
          <button className="shrink-0 rounded-lg border border-gray-600 px-4 py-2 text-xs font-bold tracking-wider text-white hover:border-white">
            EXPLORE PLANS
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-nav ────────────────────────────────────────────────────────────────────

type ConfigSection = 'profile' | 'user' | 'payments' | 'automation' | 'plan'

const SUB_NAV: Array<{ id: ConfigSection; label: string; icon: React.ElementType }> = [
  { id: 'profile', label: 'Restaurant Profile', icon: Store },
  { id: 'user', label: 'User Profile', icon: User },
  { id: 'payments', label: 'Payments & Tipping', icon: CreditCard },
  { id: 'automation', label: 'Automation', icon: Zap },
  { id: 'plan', label: 'Plan & Usage', icon: ShieldCheck },
]

// ── Main Settings page ────────────────────────────────────────────────────────

export function Settings() {
  const api = useApi()
  const qc = useQueryClient()
  const { plan } = usePlan()
  const [searchParams, setSearchParams] = useSearchParams()
  const section = (searchParams.get('section') ?? 'profile') as ConfigSection

  const { status, data } = useQuery({
    queryKey: ['restaurant'],
    queryFn: () => api.admin.getRestaurant(),
    staleTime: 5 * 60_000,
  })

  const restaurant = status === 'success' ? data as Restaurant : null

  function setSection(id: ConfigSection) {
    setSearchParams({ section: id }, { replace: true })
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your restaurant identity, payments, and automation.</p>
        </div>
        {plan && (
          <button
            type="button"
            onClick={() => setSection('plan')}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold tracking-wider text-white hover:bg-blue-700"
          >
            <Zap size={13} />
            {plan.name.toUpperCase()}
          </button>
        )}
      </div>

      <div className="flex gap-6">
        {/* Left sub-nav */}
        <aside className="w-52 flex-shrink-0">
          <nav className="space-y-1">
            {SUB_NAV.map((item) => {
              const Icon = item.icon
              const active = section === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon size={15} className={active ? 'text-white' : 'text-gray-400'} />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {section === 'profile' && (
            <>
              {status === 'pending' && <div className="py-8 text-center text-sm text-gray-500">Loading…</div>}
              {status === 'error' && <div className="text-sm text-red-600">Failed to load settings.</div>}
              {status === 'success' && restaurant && (
                <RestaurantProfileContent
                  restaurant={restaurant}
                  onSave={() => void qc.invalidateQueries({ queryKey: ['restaurant'] })}
                />
              )}
            </>
          )}

          {section === 'user' && (
            <Card>
              <SectionHeader icon={User} label="User profile" />
              <AdminProfileFields />
            </Card>
          )}

          {section === 'payments' && <PaymentsTippingContent />}

          {section === 'automation' && <AutomationContent />}

          {section === 'plan' && (
            <>
              {status === 'pending' && <div className="py-8 text-center text-sm text-gray-500">Loading…</div>}
              {status === 'error' && <div className="text-sm text-red-600">Failed to load plan info.</div>}
              {status === 'success' && restaurant && <PlanUsageContent restaurant={restaurant} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
