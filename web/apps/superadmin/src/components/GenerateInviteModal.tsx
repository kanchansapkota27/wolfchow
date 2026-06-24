import { useEffect, useState } from 'react'
import type { CreateInviteInput, CreateInviteResult, Plan } from '@wolfchow/types'
import { Button, Input, Modal } from '@wolfchow/ui'

interface GenerateInviteModalProps {
  open: boolean
  plans: Plan[]
  onClose: () => void
  onCreate: (input: CreateInviteInput) => Promise<CreateInviteResult>
}

/**
 * Generate-invite form. Commission comes from the selected plan by default;
 * an optional override can be set via checkbox. On success it shows the invite
 * URL with a copy button.
 */
export function GenerateInviteModal({ open, plans, onClose, onCreate }: GenerateInviteModalProps) {
  const [planId, setPlanId] = useState('')
  const [overrideCommission, setOverrideCommission] = useState(false)
  const [commissionPct, setCommissionPct] = useState('0')
  const [billingNote, setBillingNote] = useState('')
  const [email, setEmail] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [result, setResult] = useState<CreateInviteResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const selectedPlan = plans.find((p) => p.id === planId)

  useEffect(() => {
    if (open) {
      setPlanId(plans[0]?.id ?? '')
      setOverrideCommission(false)
      setCommissionPct('0')
      setBillingNote('')
      setEmail('')
      setRestaurantName('')
      setResult(null)
      setError(null)
      setCopied(false)
    }
  }, [open, plans])

  async function submit() {
    if (!planId) {
      setError('Select a plan')
      return
    }
    let commission_rate: number | undefined
    if (overrideCommission) {
      const pct = Number(commissionPct)
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        setError('Override commission must be between 0 and 100')
        return
      }
      commission_rate = pct / 100
    }
    setSaving(true)
    setError(null)
    try {
      const res = await onCreate({
        plan_id: planId,
        commission_rate,
        billing_note: billingNote.trim() || undefined,
        email: email.trim() || undefined,
        restaurant_name: restaurantName.trim() || undefined,
      })
      setResult(res)
    } catch {
      setError('Failed to generate invite. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function copy() {
    if (!result) return
    try {
      await navigator.clipboard?.writeText(result.invite_url)
    } catch {
      // Clipboard may be unavailable; the URL is still visible to copy manually.
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate invite">
      {result ? (
        <div className="flex flex-col gap-4 text-gray-700">
          <p className="text-sm text-gray-500">Share this link with the new restaurant:</p>
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3">
            <code data-testid="invite-url" className="flex-1 break-all text-sm text-blue-700">
              {result.invite_url}
            </code>
            <Button onClick={() => void copy()}>{copied ? 'Copied!' : 'Copy'}</Button>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-gray-700">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-500">Plan</span>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            {selectedPlan && (
              <span className="text-xs text-gray-400">
                Plan commission:{' '}
                {selectedPlan.commission_type === 'fixed'
                  ? `$${(selectedPlan.commission_value / 100).toFixed(2)}/mo flat`
                  : `${(selectedPlan.commission_value / 100).toFixed(2)}%`}
              </span>
            )}
          </label>

          {/* Optional commission override */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overrideCommission}
                onChange={(e) => setOverrideCommission(e.target.checked)}
              />
              <span className="text-gray-700">Override commission for this invite</span>
            </label>
            {overrideCommission && (
              <div className="mt-3">
                <Input
                  label="Override commission rate (%)"
                  type="number"
                  min={0}
                  max={100}
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                  helperText="Overrides the plan default for this restaurant only."
                />
              </div>
            )}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-500">Billing note</span>
            <textarea
              value={billingNote}
              onChange={(e) => setBillingNote(e.target.value)}
              rows={2}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <Input
            label="Restaurant name (optional pre-fill)"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder="The Burger Place"
          />

          <Input
            label="Pre-assign email (optional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={saving} disabled={!planId}>
              Generate
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
