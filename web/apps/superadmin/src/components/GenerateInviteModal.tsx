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
 * Generate-invite form. On success it swaps to a result view showing the
 * invite URL with a copy button; the commission % entered (0–100) is sent as a
 * fraction.
 */
export function GenerateInviteModal({ open, plans, onClose, onCreate }: GenerateInviteModalProps) {
  const [planId, setPlanId] = useState('')
  const [commissionPct, setCommissionPct] = useState('0')
  const [billingNote, setBillingNote] = useState('')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<CreateInviteResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setPlanId(plans[0]?.id ?? '')
      setCommissionPct('0')
      setBillingNote('')
      setEmail('')
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
    const pct = Number(commissionPct)
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      setError('Commission must be between 0 and 100')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await onCreate({
        plan_id: planId,
        commission_rate: pct / 100,
        billing_note: billingNote.trim() || undefined,
        email: email.trim() || undefined,
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
        <div className="flex flex-col gap-4 text-gray-100">
          <p className="text-sm text-gray-400">Share this link with the new restaurant:</p>
          <div className="flex items-center gap-2 rounded-md border border-indigo-500/50 bg-indigo-950/40 p-3">
            <code data-testid="invite-url" className="flex-1 break-all text-sm text-indigo-200">
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
        <div className="flex flex-col gap-4 text-gray-100">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-300">Plan</span>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>

          <Input
            label="Commission rate %"
            type="number"
            min={0}
            max={100}
            value={commissionPct}
            onChange={(e) => setCommissionPct(e.target.value)}
          />

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-300">Billing note</span>
            <textarea
              value={billingNote}
              onChange={(e) => setBillingNote(e.target.value)}
              rows={2}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2"
            />
          </label>

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
