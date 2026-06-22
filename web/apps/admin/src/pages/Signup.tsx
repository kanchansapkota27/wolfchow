import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button, Input } from '@wolfchow/ui'
import { ApiError } from '@wolfchow/api-client'
import { COUNTRIES } from '@wolfchow/utils'
import { useApi } from '../lib/api'

// ── Helpers ────────────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

const TIMEZONES = Intl.supportedValuesOf('timeZone')

const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'TRY', label: 'TRY — Turkish Lira' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'SAR', label: 'SAR — Saudi Riyal' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'INR', label: 'INR — Indian Rupee' },
]

// ── Step 1: Account ─────────────────────────────────────────────────────────

interface Step1Data {
  name: string
  phone: string
  email: string
  password: string
  confirmPassword: string
}

function Step1({ data, onChange, error }: {
  data: Step1Data
  onChange: (patch: Partial<Step1Data>) => void
  error: string | null
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Your account</h2>
      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
      )}
      <Input label="Full name" value={data.name} onChange={(e) => onChange({ name: e.target.value })} required />
      <Input label="Phone" type="tel" value={data.phone} onChange={(e) => onChange({ phone: e.target.value })} />
      <Input label="Email" type="email" autoComplete="username" value={data.email} onChange={(e) => onChange({ email: e.target.value })} required />
      <Input label="Password" type="password" autoComplete="new-password" value={data.password} onChange={(e) => onChange({ password: e.target.value })} required />
      <Input label="Confirm password" type="password" autoComplete="new-password" value={data.confirmPassword} onChange={(e) => onChange({ confirmPassword: e.target.value })} required />
    </div>
  )
}

function validateStep1(data: Step1Data): string | null {
  if (!data.name.trim()) return 'Name is required.'
  if (!data.email.trim()) return 'Email is required.'
  if (!data.password) return 'Password is required.'
  if (data.password !== data.confirmPassword) return 'Passwords do not match.'
  return null
}

// ── Step 2: Restaurant ───────────────────────────────────────────────────────

interface Step2Data {
  displayName: string
  businessName: string
  timezone: string
  addressLine1: string
  city: string
  country: string
  currency: string
}

function Step2({ data, onChange, error }: {
  data: Step2Data
  onChange: (patch: Partial<Step2Data>) => void
  error: string | null
}) {
  const [tzSearch, setTzSearch] = useState('')
  const filteredTz = TIMEZONES.filter((tz) =>
    tz.toLowerCase().includes(tzSearch.toLowerCase()),
  ).slice(0, 30)

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Your restaurant</h2>
      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
      )}
      <Input
        label="Display name (optional)"
        value={data.displayName}
        onChange={(e) => onChange({ displayName: e.target.value })}
      />
      <Input
        label="Business name"
        value={data.businessName}
        onChange={(e) => onChange({ businessName: e.target.value })}
        required
      />
      {data.businessName && (
        <p className="text-xs text-gray-500">
          Slug preview: <span className="font-mono text-indigo-600">{slugify(data.businessName)}</span>
        </p>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Timezone</label>
        <Input
          label=""
          placeholder="Search timezones…"
          value={tzSearch}
          onChange={(e) => setTzSearch(e.target.value)}
        />
        <select
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={data.timezone}
          onChange={(e) => onChange({ timezone: e.target.value })}
          size={5}
        >
          {filteredTz.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>
      <Input
        label="Address line 1"
        value={data.addressLine1}
        onChange={(e) => onChange({ addressLine1: e.target.value })}
        autoComplete="street-address"
      />
      <Input
        label="City"
        value={data.city}
        onChange={(e) => onChange({ city: e.target.value })}
        autoComplete="address-level2"
      />
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Country</label>
        <select
          value={data.country}
          onChange={(e) => onChange({ country: e.target.value })}
          autoComplete="country-name"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">— Select country —</option>
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
        <select
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={data.currency}
          onChange={(e) => onChange({ currency: e.target.value })}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function validateStep2(data: Step2Data): string | null {
  if (!data.businessName.trim()) return 'Business name is required.'
  if (!data.timezone) return 'Timezone is required.'
  return null
}

// ── Step 3: Profile (optional) ───────────────────────────────────────────────

function Step3() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Profile <span className="text-sm font-normal text-gray-500">(optional)</span></h2>
      <p className="text-sm text-gray-600">
        You can add your logo and brand colours after setup. Skip this step to go straight to your dashboard.
      </p>
    </div>
  )
}

// ── Main Signup component ─────────────────────────────────────────────────────

export function Signup() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const api = useApi()

  const inviteToken = params.get('invite') ?? ''

  const [step, setStep] = useState(1)
  const [step1, setStep1] = useState<Step1Data>({ name: '', phone: '', email: '', password: '', confirmPassword: '' })
  const [step2, setStep2] = useState<Step2Data>({
    displayName: '',
    businessName: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    addressLine1: '',
    city: '',
    country: '',
    currency: 'USD',
  })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function nextStep() {
    setError(null)
    if (step === 1) {
      const err = validateStep1(step1)
      if (err) { setError(err); return }
    }
    if (step === 2) {
      const err = validateStep2(step2)
      if (err) { setError(err); return }
    }
    setStep((s) => s + 1)
  }

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      await api.apiFetch('/auth/signup', {
        method: 'POST',
        skipAuth: true,
        body: {
          invite_token: inviteToken,
          admin_name: step1.name,
          admin_phone: step1.phone || undefined,
          admin_email: step1.email,
          password: step1.password,
          display_name: step2.displayName || undefined,
          business_name: step2.businessName,
          timezone: step2.timezone,
          address: {
            line1: step2.addressLine1 || 'N/A',
            city: step2.city || 'N/A',
            country: step2.country || 'N/A',
          },
          currency: step2.currency,
        },
      })
      void navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Signup failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!inviteToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-red-700">Invalid invite link</h1>
          <p className="mt-2 text-sm text-gray-600">This link is missing an invite token. Please use the link from your invitation email.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm">
        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div className={[
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                n === step ? 'bg-indigo-600 text-white' : n < step ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400',
              ].join(' ')}>
                {n}
              </div>
              {n < 3 && <div className={['h-px w-8', n < step ? 'bg-indigo-300' : 'bg-gray-200'].join(' ')} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <Step1 data={step1} onChange={(p) => setStep1((s) => ({ ...s, ...p }))} error={error} />
        )}
        {step === 2 && (
          <Step2 data={step2} onChange={(p) => setStep2((s) => ({ ...s, ...p }))} error={error} />
        )}
        {step === 3 && <Step3 />}

        {step === 3 && error && (
          <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
        )}

        <div className="mt-6 flex justify-between gap-3">
          {step > 1 && (
            <Button variant="secondary" onClick={() => { setError(null); setStep((s) => s - 1) }}>
              Back
            </Button>
          )}
          <div className="flex flex-1 justify-end gap-3">
            {step === 3 && (
              <Button variant="secondary" onClick={() => void navigate('/dashboard')}>
                Skip
              </Button>
            )}
            {step < 3 ? (
              <Button onClick={nextStep}>Next</Button>
            ) : (
              <Button loading={submitting} onClick={() => void submit()}>
                Create account
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
