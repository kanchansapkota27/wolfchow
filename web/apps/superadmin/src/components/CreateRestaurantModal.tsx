import { useEffect, useState } from 'react'
import type { CommissionType, Plan } from '@wolfchow/types'
import { Button, Input, Modal, useToast } from '@wolfchow/ui'
import { useApi } from '../lib/api'

interface CreateRestaurantModalProps {
  open: boolean
  plans: Plan[]
  onClose: () => void
  onCreated: () => void
}

interface FormState {
  business_name: string
  display_name: string
  slug: string
  timezone: string
  currency: string
  country: string
  state: string
  plan_id: string
  // Override commission — only sent when useOverride = true
  override_type: CommissionType
  override_value: string
}

function empty(): FormState {
  return {
    business_name: '',
    display_name: '',
    slug: '',
    timezone: 'UTC',
    currency: 'USD',
    country: '',
    state: '',
    plan_id: '',
    override_type: 'percentage',
    override_value: '0',
  }
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 63)
}

export function CreateRestaurantModal({ open, plans, onClose, onCreated }: CreateRestaurantModalProps) {
  const api = useApi()
  const { notify } = useToast()
  const [form, setForm] = useState<FormState>(empty)
  const [slugEdited, setSlugEdited] = useState(false)
  const [useOverride, setUseOverride] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm({ ...empty(), plan_id: plans[0]?.id ?? '' })
      setSlugEdited(false)
      setUseOverride(false)
      setError(null)
    }
  }, [open, plans])

  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value
      setForm((f) => {
        const next = { ...f, [key]: value }
        if (key === 'business_name' && !slugEdited) next.slug = toSlug(value)
        return next
      })
    }
  }

  const selectedPlan = plans.find((p) => p.id === form.plan_id)

  async function submit() {
    if (!form.business_name || !form.slug || !form.timezone || !form.currency) {
      setError('Business name, slug, timezone, and currency are required.')
      return
    }

    let override_commission_type: CommissionType | undefined
    let override_commission_value: number | undefined

    if (useOverride) {
      const display = parseFloat(form.override_value) || 0
      if (display < 0) {
        setError('Override commission must be 0 or greater.')
        return
      }
      override_commission_type = form.override_type
      override_commission_value = Math.round(display * 100)
    }

    setBusy(true)
    setError(null)
    try {
      await api.superadmin.createRestaurant({
        business_name: form.business_name,
        display_name: form.display_name.trim() || undefined,
        slug: form.slug,
        timezone: form.timezone,
        currency: form.currency.toUpperCase(),
        country: form.country.trim() || undefined,
        state: form.state.trim() || undefined,
        plan_id: form.plan_id || undefined,
        override_commission_type,
        override_commission_value,
      })
      notify('success', `Restaurant "${form.business_name}" created.`)
      onCreated()
      onClose()
    } catch (err: unknown) {
      const body = (err as { message?: string }).message ?? ''
      if (body.includes('slug_taken') || body.includes('409')) {
        setError(`Slug "${form.slug}" is already taken. Choose a different one.`)
      } else {
        setError('Failed to create restaurant. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create restaurant">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Business name (tax/legal name)"
            value={form.business_name}
            onChange={field('business_name')}
            placeholder="Burger Joint LLC"
          />
          <Input
            label="Display name (optional)"
            value={form.display_name}
            onChange={field('display_name')}
            placeholder="Defaults to business name"
          />
        </div>

        <Input
          label="Slug (unique URL identifier)"
          value={form.slug}
          onChange={(e) => {
            setSlugEdited(true)
            field('slug')(e)
          }}
          placeholder="burger-joint"
          helperText="Lowercase letters, numbers, and hyphens only."
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Timezone"
            value={form.timezone}
            onChange={field('timezone')}
            placeholder="America/New_York"
            helperText="IANA timezone (e.g. Europe/London)"
          />
          <Input
            label="Currency (ISO 4217)"
            value={form.currency}
            onChange={field('currency')}
            placeholder="USD"
            helperText="3-letter code: USD, EUR, GBP…"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Country (optional)"
            value={form.country}
            onChange={field('country')}
            placeholder="United States"
          />
          <Input
            label="State / Region (optional)"
            value={form.state}
            onChange={field('state')}
            placeholder="California"
          />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">Plan (optional)</span>
          <select
            value={form.plan_id}
            onChange={field('plan_id')}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100"
          >
            <option value="">— No plan —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {' · '}
                {p.commission_type === 'fixed'
                  ? `$${(p.commission_value / 100).toFixed(2)}/mo`
                  : `${(p.commission_value / 100).toFixed(2)}%`}
              </option>
            ))}
          </select>
          {selectedPlan && (
            <span className="text-xs text-gray-500">
              Default commission:{' '}
              {selectedPlan.commission_type === 'fixed'
                ? `$${(selectedPlan.commission_value / 100).toFixed(2)}/mo flat`
                : `${(selectedPlan.commission_value / 100).toFixed(2)}% of monthly sales`}
            </span>
          )}
        </label>

        {/* Commission override */}
        <div className="rounded-lg border border-gray-800 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useOverride}
              onChange={(e) => setUseOverride(e.target.checked)}
            />
            <span className="text-gray-300">Override commission for this restaurant</span>
          </label>

          {useOverride && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-gray-500">
                Overrides the plan default. Applies to monthly billing.
              </p>
              <div className="flex gap-6">
                {(['percentage', 'fixed'] as const).map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="override_type"
                      checked={form.override_type === type}
                      onChange={() => setForm((f) => ({ ...f, override_type: type }))}
                    />
                    {type === 'percentage' ? '% of monthly sales' : '$ flat monthly fee'}
                  </label>
                ))}
              </div>
              <div className="relative w-40">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">
                  {form.override_type === 'percentage' ? '%' : '$'}
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.override_value}
                  onChange={(e) => setForm((f) => ({ ...f, override_value: e.target.value }))}
                  aria-label={form.override_type === 'percentage' ? 'Override rate (%)' : 'Override fee ($/month)'}
                  className="w-full rounded border border-gray-700 bg-gray-800 py-1.5 pl-8 pr-3 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Create restaurant
          </Button>
        </div>
      </div>
    </Modal>
  )
}
