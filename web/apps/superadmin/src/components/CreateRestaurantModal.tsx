import { useEffect, useState } from 'react'
import type { Plan } from '@wolfchow/types'
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
  commission_pct: string
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
    commission_pct: '0',
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm({ ...empty(), plan_id: plans[0]?.id ?? '' })
      setSlugEdited(false)
      setError(null)
    }
  }, [open, plans])

  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value
      setForm((f) => {
        const next = { ...f, [key]: value }
        // Auto-generate slug from business_name unless user has edited it
        if (key === 'business_name' && !slugEdited) {
          next.slug = toSlug(value)
        }
        return next
      })
    }
  }

  async function submit() {
    if (!form.business_name || !form.slug || !form.timezone || !form.currency) {
      setError('Business name, slug, timezone, and currency are required.')
      return
    }
    const commission = Number(form.commission_pct)
    if (Number.isNaN(commission) || commission < 0 || commission > 100) {
      setError('Commission must be between 0 and 100.')
      return
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
        commission_rate: commission / 100,
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

        <div className="grid grid-cols-2 gap-4">
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
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Commission rate %"
            type="number"
            min={0}
            max={100}
            value={form.commission_pct}
            onChange={field('commission_pct')}
          />
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
