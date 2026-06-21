import { useState, useRef } from 'react'
import { Button, Input } from '@wolfchow/ui'
import { ApiError } from '@wolfchow/api-client'
import type { Restaurant } from '@wolfchow/types'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg className="ml-1 inline-block h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
    </svg>
  )
}

function ReadonlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        <LockIcon />
      </label>
      <div
        className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
        title={hint}
      >
        {value}
      </div>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-4 text-base font-semibold text-gray-900">{title}</h2>
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-6">{children}</div>
}

// ── Restaurant details section ────────────────────────────────────────────────

function RestaurantDetailsSection({ restaurant, onSave }: {
  restaurant: Restaurant
  onSave: () => void
}) {
  const api = useApi()
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

  async function save() {
    setError(null)
    setSuccess(false)
    setSaving(true)
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

  const filteredCuisines = CUISINE_TYPES.filter((c) =>
    c.toLowerCase().includes(cuisineSearch.toLowerCase()),
  )

  return (
    <Card>
      <SectionHeading title="Restaurant details" />
      <div className="space-y-4">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        {success && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">Saved.</p>}
        <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <Input label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        <ReadonlyField label="Slug" value={restaurant.slug} hint="Contact support to change your URL slug." />
        <ReadonlyField label="Timezone" value={restaurant.timezone} hint="Contact support to change your timezone." />
        <ReadonlyField label="Currency" value={restaurant.currency} hint="Contact support to change your currency." />
        <Input label="Address line 1" value={address.line1} onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))} />
        <Input label="City" value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} />
        <Input label="Country" value={address.country} onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Cuisine type</label>
          <Input label="" placeholder="Search…" value={cuisineSearch} onChange={(e) => setCuisineSearch(e.target.value)} />
          <select
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={cuisineType}
            onChange={(e) => setCuisineType(e.target.value)}
            size={4}
          >
            <option value="">— None —</option>
            {filteredCuisines.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">Services offered</legend>
          <div className="space-y-2">
            {SERVICES.map(({ value, label }) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={services.includes(value)}
                  onChange={(e) =>
                    setServices((s) =>
                      e.target.checked ? [...s, value] : s.filter((x) => x !== value),
                    )
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <Button loading={saving} onClick={() => void save()}>Save changes</Button>
      </div>
    </Card>
  )
}

// ── Admin profile section ─────────────────────────────────────────────────────

function ProfileSection({ email }: { email: string | null }) {
  const api = useApi()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function save() {
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      await api.admin.patchProfile({ name: name || undefined, phone: phone || undefined })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionHeading title="Admin profile" />
      <div className="space-y-4">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        {success && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">Profile updated.</p>}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <ReadonlyField label="Email" value={email ?? ''} hint="Email cannot be changed here." />
        <Button loading={saving} onClick={() => void save()}>Save profile</Button>
      </div>
    </Card>
  )
}

// ── Change password section ───────────────────────────────────────────────────

function PasswordSection() {
  const api = useApi()
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function save() {
    setError(null)
    setSuccess(false)
    if (newPw.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (newPw !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    try {
      await api.admin.changePassword({ current_password: current, new_password: newPw })
      setSuccess(true)
      setCurrent(''); setNewPw(''); setConfirm('')
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Password change failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionHeading title="Change password" />
      <div className="space-y-4">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        {success && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">Password changed.</p>}
        <Input label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input label="New password" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button loading={saving} onClick={() => void save()}>Change password</Button>
      </div>
    </Card>
  )
}

// ── Logo upload section ───────────────────────────────────────────────────────

function LogoSection({ logoKey }: { logoKey: string | null }) {
  const api = useApi()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setError(null)
    setUploading(true)
    setProgress(0)
    try {
      const { upload_url } = await api.admin.getLogoUploadUrl()
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('Upload failed')))
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.open('PUT', upload_url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })
      setPreviewUrl(URL.createObjectURL(file))
      setProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void upload(file)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void upload(file)
  }

  const displayUrl = previewUrl ?? (logoKey ? `/r2/${logoKey}` : null)

  return (
    <Card>
      <SectionHeading title="Logo" />
      <div className="space-y-4">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        {displayUrl && (
          <img src={displayUrl} alt="Current logo" className="h-20 w-20 rounded-lg object-contain border border-gray-200" />
        )}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload logo"
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 text-sm text-gray-500 hover:border-indigo-400 hover:bg-indigo-50"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        >
          {uploading ? (
            <div className="w-full">
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div className="h-2 rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-center text-xs">{progress}%</p>
            </div>
          ) : (
            <p>Drag and drop or <span className="text-indigo-600">click to browse</span></p>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      </div>
    </Card>
  )
}

// ── Main Settings page ────────────────────────────────────────────────────────

export function Settings() {
  const api = useApi()
  const { status, data, reload } = useAsync(
    () => api.admin.getRestaurant(),
    [],
  )

  if (status === 'loading') {
    return <div className="p-4 text-sm text-gray-500">Loading settings…</div>
  }
  if (status === 'error' || !data) {
    return <div className="p-4 text-sm text-red-600">Failed to load settings.</div>
  }

  const restaurant = data as Restaurant

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>
      <div className="space-y-6">
        <RestaurantDetailsSection restaurant={restaurant} onSave={reload} />
        <ProfileSection email={null} />
        <PasswordSection />
        <LogoSection logoKey={restaurant.logo_r2_key} />
      </div>
    </div>
  )
}
