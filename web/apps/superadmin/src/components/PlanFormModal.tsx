import { useEffect, useState } from 'react'
import type { PaymentMethod, Plan, PlanInput } from '@wolfchow/types'
import { Button, Input, Modal } from '@wolfchow/ui'
import { COMMISSION_TYPES, FEATURE_FLAGS, PAYMENT_METHODS, emptyPlanInput, planToInput } from '../lib/planMeta'

interface PlanFormModalProps {
  open: boolean
  /** A plan to edit, or null/undefined to create a new one. */
  initial?: Plan | null
  onClose: () => void
  onSubmit: (input: PlanInput) => Promise<void>
}

const CAPS: Array<{ key: keyof PlanInput; label: string }> = [
  { key: 'staff_cap', label: 'Staff cap' },
  { key: 'item_cap', label: 'Item cap' },
  { key: 'category_cap', label: 'Category cap' },
  { key: 'modifier_cap', label: 'Modifier cap' },
]

/** Create/edit form for a plan. Pre-fills from `initial` when editing. */
export function PlanFormModal({ open, initial, onClose, onSubmit }: PlanFormModalProps) {
  const [form, setForm] = useState<PlanInput>(emptyPlanInput())
  const [commissionRaw, setCommissionRaw] = useState('0.00')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      const base = initial ? planToInput(initial) : emptyPlanInput()
      setForm(base)
      setCommissionRaw((base.commission_value / 100).toFixed(2))
      setError(null)
    }
  }, [open, initial])

  function patch(partial: Partial<PlanInput>) {
    setForm((current) => ({ ...current, ...partial }))
  }

  function togglePayment(method: PaymentMethod) {
    setForm((current) => {
      const has = current.payment_methods_allowed.includes(method)
      return {
        ...current,
        payment_methods_allowed: has
          ? current.payment_methods_allowed.filter((m) => m !== method)
          : [...current.payment_methods_allowed, method],
      }
    })
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    if (form.payment_methods_allowed.length === 0) {
      setError('Select at least one payment method')
      return
    }
    setSaving(true)
    try {
      await onSubmit(form)
      onClose()
    } catch {
      setError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = form.name.trim().length > 0 && form.payment_methods_allowed.length > 0

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit plan' : 'Create plan'}>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1 text-gray-100">
        <Input
          label="Plan name"
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
        />

        <div className="grid grid-cols-2 gap-3">
          {CAPS.map((cap) => (
            <Input
              key={cap.key}
              label={cap.label}
              type="number"
              min={1}
              value={String(form[cap.key] as number)}
              onChange={(e) => patch({ [cap.key]: Number(e.target.value) || 0 } as Partial<PlanInput>)}
            />
          ))}
        </div>

        <NullableNumber
          label="SMTP monthly limit"
          unlimitedLabel="Unlimited SMTP"
          value={form.smtp_monthly_limit}
          onChange={(v) => patch({ smtp_monthly_limit: v })}
        />
        <NullableNumber
          label="Transaction history days"
          unlimitedLabel="Unlimited history"
          value={form.transaction_history_days}
          onChange={(v) => patch({ transaction_history_days: v })}
        />

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-300">Feature flags</legend>
          <div className="grid grid-cols-2 gap-2">
            {FEATURE_FLAGS.map((flag) => (
              <label key={flag.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.feature_flags[flag.key] ?? false}
                  onChange={(e) =>
                    patch({ feature_flags: { ...form.feature_flags, [flag.key]: e.target.checked } })
                  }
                />
                {flag.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-300">Commission</legend>
          <div className="flex gap-4 mb-3">
            {COMMISSION_TYPES.map((ct) => (
              <label key={ct.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="commission_type"
                  value={ct.value}
                  checked={form.commission_type === ct.value}
                  onChange={() => patch({ commission_type: ct.value })}
                />
                <span>
                  {ct.label}{' '}
                  <span className="text-gray-500">({ct.hint})</span>
                </span>
              </label>
            ))}
          </div>
          <div className="relative w-48">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">
              {form.commission_type === 'percentage' ? '%' : '$'}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={commissionRaw}
              onChange={(e) => {
                const raw = e.target.value
                setCommissionRaw(raw)
                const display = parseFloat(raw)
                if (!isNaN(display) && display >= 0) {
                  patch({ commission_value: Math.round(display * 100) })
                }
              }}
              onBlur={() => {
                const display = parseFloat(commissionRaw) || 0
                setCommissionRaw(display.toFixed(2))
                patch({ commission_value: Math.round(display * 100) })
              }}
              aria-label={
                form.commission_type === 'percentage'
                  ? 'Commission rate (%)'
                  : 'Commission amount ($/month)'
              }
              className="w-full rounded border border-gray-700 bg-gray-800 py-1.5 pl-8 pr-3 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {form.commission_type === 'percentage'
              ? 'Applied as a % of monthly total sales'
              : 'Flat monthly fee in dollars (regardless of sales volume)'}
          </p>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_public}
            onChange={(e) => patch({ is_public: e.target.checked })}
          />
          <span>
            Public plan{' '}
            <span className="text-gray-500">(can appear on a public pricing page)</span>
          </span>
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-300">Payment methods</legend>
          <div className="flex gap-2">
            {PAYMENT_METHODS.map((method) => {
              const active = form.payment_methods_allowed.includes(method.value)
              return (
                <button
                  key={method.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => togglePayment(method.value)}
                  className={[
                    'rounded-md border px-3 py-1.5 text-sm',
                    active
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-gray-700 text-gray-300',
                  ].join(' ')}
                >
                  {method.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving} disabled={!canSubmit}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}

interface NullableNumberProps {
  label: string
  unlimitedLabel: string
  value: number | null
  onChange: (value: number | null) => void
}

/** Number input paired with an "unlimited" checkbox that sets the value to null. */
function NullableNumber({ label, unlimitedLabel, value, onChange }: NullableNumberProps) {
  const unlimited = value === null
  return (
    <div className="flex items-end gap-3">
      <div className="flex-1">
        <Input
          label={label}
          type="number"
          min={0}
          disabled={unlimited}
          value={unlimited ? '' : String(value)}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(e) => onChange(e.target.checked ? null : 0)}
        />
        {unlimitedLabel}
      </label>
    </div>
  )
}
