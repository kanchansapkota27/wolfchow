import { useState, useEffect } from 'react'
import { Button } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import { ApiError } from '@wolfchow/api-client'
import type { StripeStatus, PaymentMethods, TipsConfig, TaxConfig, AutomationConfig } from '@wolfchow/api-client'

// ── Stripe Section ────────────────────────────────────────────────────────────

const SK_RE = /^sk_(live|test)_/
const PK_RE = /^pk_(live|test)_/

interface StripeSectionProps {
  status: StripeStatus
  onSave: (data: { secret_key: string; publishable_key: string }) => Promise<void>
  onRemove: () => Promise<void>
}

function StripeSection({ status, onSave, onRemove }: StripeSectionProps) {
  const [secretKey, setSecretKey] = useState('')
  const [publishableKey, setPublishableKey] = useState(status.publishable_key ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const connected = status.has_secret && !!status.publishable_key

  function validateKeys() {
    if (!SK_RE.test(secretKey)) return 'Secret key must start with sk_live_ or sk_test_'
    if (!PK_RE.test(publishableKey)) return 'Publishable key must start with pk_live_ or pk_test_'
    return ''
  }

  async function handleSave() {
    const validationError = validateKeys()
    if (validationError) { setError(validationError); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ secret_key: secretKey, publishable_key: publishableKey })
      setSecretKey('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError('Stripe rejected the key — please check it is correct')
      } else {
        setError('Failed to save keys')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      await onRemove()
      setPublishableKey('')
      setConfirmRemove(false)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {connected ? (
          <span className="text-sm font-medium px-3 py-1 rounded-full bg-green-100 text-green-700">Connected ✓</span>
        ) : (
          <span className="text-sm font-medium px-3 py-1 rounded-full bg-red-100 text-red-700">Not configured ⚠</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Secret key</label>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => { setSecretKey(e.target.value); setError('') }}
            placeholder="sk_live_••••••••"
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            aria-label="Stripe secret key"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Publishable key</label>
          <input
            type="text"
            value={publishableKey}
            onChange={(e) => { setPublishableKey(e.target.value); setError('') }}
            placeholder="pk_live_••••••••"
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            aria-label="Stripe publishable key"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex items-center gap-3">
        <Button loading={saving} onClick={handleSave}>
          {saving ? 'Verifying…' : saved ? 'Saved ✓' : 'Save & Verify'}
        </Button>
        {connected && !confirmRemove && (
          <button
            onClick={() => setConfirmRemove(true)}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Remove keys
          </button>
        )}
        {confirmRemove && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Remove Stripe keys?</span>
            <Button loading={removing} onClick={handleRemove}>Confirm</Button>
            <button onClick={() => setConfirmRemove(false)} className="text-sm text-gray-500">Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Payment Methods Section ───────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  card: 'Card',
  pickup: 'Pay on Pickup',
  delivery: 'Pay on Delivery',
}

interface PaymentMethodsSectionProps {
  methods: PaymentMethods
  hasStripe: boolean
  planAllowed: string[] | null
  onToggle: (method: string, on: boolean) => Promise<void>
  onNoteChange: (note: string | null) => Promise<void>
}

function PaymentMethodsSection({ methods, hasStripe, planAllowed, onToggle, onNoteChange }: PaymentMethodsSectionProps) {
  const [note, setNote] = useState(methods.pickup_delivery_note ?? '')
  const showNote = methods.payment_methods.includes('pickup') || methods.payment_methods.includes('delivery')

  const allMethods = ['card', 'pickup', 'delivery']

  return (
    <div className="space-y-4">
      {!hasStripe && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3" role="note" aria-label="Stripe not configured">
          Payment methods are disabled until Stripe keys are configured.
        </div>
      )}
      <div className="space-y-2">
        {allMethods.map((method) => {
          const locked = planAllowed !== null && !planAllowed.includes(method)
          const enabled = methods.payment_methods.includes(method)
          return (
            <label
              key={method}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${enabled ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200'} ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={locked ? 'Available on a higher plan' : undefined}
            >
              <input
                type="checkbox"
                checked={enabled}
                disabled={!hasStripe || locked}
                onChange={(e) => void onToggle(method, e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600"
                aria-label={`${METHOD_LABELS[method] ?? method} payment method`}
              />
              <span className="text-sm font-medium text-gray-800">{METHOD_LABELS[method] ?? method}</span>
              {locked && <span className="ml-auto text-xs text-gray-400">🔒 Higher plan</span>}
            </label>
          )
        })}
      </div>
      {showNote && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pickup/delivery note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => void onNoteChange(note || null)}
            rows={2}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="e.g. Please wait at the front desk"
          />
        </div>
      )}
    </div>
  )
}

// ── Tips Section ──────────────────────────────────────────────────────────────

interface TipsSectionProps {
  config: TipsConfig
  onChange: (patch: Partial<TipsConfig>) => void
}

function TipsSection({ config, onChange }: TipsSectionProps) {
  const PRESET_OPTIONS = [0, 5, 10, 15, 20, 25]

  function togglePreset(v: number) {
    const current = config.tip_presets
    const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v]
    if (next.length <= 6) onChange({ tip_presets: next })
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.tips_enabled}
          onChange={(e) => onChange({ tips_enabled: e.target.checked })}
          className="w-4 h-4 rounded text-indigo-600"
          aria-label="Enable tips"
        />
        <span className="text-sm font-medium text-gray-700">Enable tips</span>
      </label>
      {config.tips_enabled && (
        <>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Tip presets (select up to 6)</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_OPTIONS.map((v) => (
                <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.tip_presets.includes(v)}
                    onChange={() => togglePreset(v)}
                    className="w-4 h-4 rounded text-indigo-600"
                    aria-label={`${v}% tip preset`}
                  />
                  <span className="text-sm text-gray-700">{v}%</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.allow_custom_tip}
                onChange={(e) => onChange({ allow_custom_tip: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600"
                aria-label="Allow custom tip"
              />
              <span className="text-sm text-gray-700">Allow customer to enter custom tip</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.show_no_tip}
                onChange={(e) => onChange({ show_no_tip: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600"
                aria-label="Show no tip option"
              />
              <span className="text-sm text-gray-700">Show "No tip" option</span>
            </label>
          </div>
          {/* Live tip preview */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="text-xs text-gray-500 mb-2 font-medium">Checkout tip row preview</p>
            <div className="flex items-center gap-2 flex-wrap">
              {config.tip_presets.sort((a, b) => a - b).map((v) => (
                <span key={v} className="px-2 py-1 bg-white border border-gray-200 rounded-md text-gray-700">{v}%</span>
              ))}
              {config.allow_custom_tip && (
                <span className="px-2 py-1 bg-white border border-gray-200 rounded-md text-gray-700">Custom</span>
              )}
              {config.show_no_tip && (
                <span className="px-2 py-1 bg-white border border-gray-200 rounded-md text-gray-500">No tip</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Tax Section ───────────────────────────────────────────────────────────────

interface TaxSectionProps {
  config: TaxConfig
  onChange: (patch: Partial<TaxConfig>) => void
  validationError: string
}

function TaxSection({ config, onChange, validationError }: TaxSectionProps) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.tax_enabled}
          onChange={(e) => onChange({ tax_enabled: e.target.checked })}
          className="w-4 h-4 rounded text-indigo-600"
          aria-label="Enable tax"
        />
        <span className="text-sm font-medium text-gray-700">Enable tax</span>
      </label>
      {config.tax_enabled && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax rate (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={config.tax_rate}
              onChange={(e) => onChange({ tax_rate: Number(e.target.value) })}
              className="border border-gray-200 rounded-md px-3 py-2 text-sm w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              aria-label="Tax rate"
            />
            {validationError && <p className="text-xs text-red-600 mt-1" role="alert">{validationError}</p>}
          </div>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">Tax calculation</span>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tax_inclusive"
                  checked={config.tax_inclusive}
                  onChange={() => onChange({ tax_inclusive: true })}
                  className="text-indigo-600"
                />
                <span className="text-sm text-gray-700">Prices include tax</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tax_inclusive"
                  checked={!config.tax_inclusive}
                  onChange={() => onChange({ tax_inclusive: false })}
                  className="text-indigo-600"
                />
                <span className="text-sm text-gray-700">Add tax on top</span>
              </label>
            </div>
          </div>
          {/* Tax preview */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm" aria-label="Tax preview">
            {config.tax_inclusive ? (
              <span className="text-gray-600">
                $100.00 item → ${(100 / (1 + config.tax_rate / 100)).toFixed(2)} + ${(100 - 100 / (1 + config.tax_rate / 100)).toFixed(2)} tax
              </span>
            ) : (
              <span className="text-gray-600">
                $100.00 item + ${(100 * config.tax_rate / 100).toFixed(2)} tax = ${(100 * (1 + config.tax_rate / 100)).toFixed(2)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Automation Section ────────────────────────────────────────────────────────

const REJECT_MINUTES = [5, 10, 15, 20, 30]

interface AutomationSectionProps {
  config: AutomationConfig
  onChange: (patch: Partial<AutomationConfig>) => void
}

function AutomationSection({ config, onChange }: AutomationSectionProps) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.auto_accept}
          onChange={(e) => onChange({ auto_accept: e.target.checked })}
          className="w-4 h-4 rounded text-indigo-600"
          aria-label="Auto-accept orders"
        />
        <span className="text-sm font-medium text-gray-700">Auto-accept incoming orders</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.auto_reject_enabled}
          onChange={(e) => onChange({ auto_reject_enabled: e.target.checked })}
          className="w-4 h-4 rounded text-indigo-600"
          aria-label="Auto-reject orders"
        />
        <span className="text-sm font-medium text-gray-700">Auto-reject unaccepted orders after timeout</span>
      </label>
      {config.auto_reject_enabled && (
        <div className="pl-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Reject after (minutes)</label>
          <select
            value={config.auto_reject_minutes}
            onChange={(e) => onChange({ auto_reject_minutes: Number(e.target.value) })}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            aria-label="Auto-reject timeout"
          >
            {REJECT_MINUTES.map((v) => (
              <option key={v} value={v}>{v} min</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children, onSave, saving, saved }: {
  title: string
  children: React.ReactNode
  onSave?: () => Promise<void>
  saving?: boolean
  saved?: boolean
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {onSave && (
          <div className="flex items-center gap-2">
            {saved && <span className="text-sm text-green-600">Saved</span>}
            <Button loading={saving} onClick={onSave}>Save</Button>
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

// ── Main Payments page ────────────────────────────────────────────────────────

export function Payments() {
  const api = useApi()
  const [stripe, setStripe] = useState<StripeStatus>({ publishable_key: null, has_secret: false, updated_at: null })
  const [methods, setMethods] = useState<PaymentMethods>({ payment_methods: [], pickup_delivery_note: null })
  const [planAllowed, setPlanAllowed] = useState<string[] | null>(null)
  const [tips, setTips] = useState<TipsConfig>({ tips_enabled: false, tip_presets: [], allow_custom_tip: false, show_no_tip: false })
  const [tax, setTax] = useState<TaxConfig>({ tax_enabled: false, tax_rate: 0, tax_inclusive: false })
  const [automation, setAutomation] = useState<AutomationConfig>({ auto_accept: false, auto_reject_enabled: false, auto_reject_minutes: 15 })
  const [loading, setLoading] = useState(true)
  const [tipsSaving, setTipsSaving] = useState(false)
  const [tipsSaved, setTipsSaved] = useState(false)
  const [taxSaving, setTaxSaving] = useState(false)
  const [taxSaved, setTaxSaved] = useState(false)
  const [automationSaving, setAutomationSaving] = useState(false)
  const [automationSaved, setAutomationSaved] = useState(false)
  const [taxError, setTaxError] = useState('')

  useEffect(() => {
    void Promise.all([
      api.admin.getStripeStatus(),
      api.admin.getPaymentMethods(),
      api.admin.getTips(),
      api.admin.getTax(),
      api.admin.getAutomation(),
    ]).then(([s, m, t, tx, a]) => {
      setStripe(s)
      setMethods(m)
      setTips(t)
      setTax(tx)
      setAutomation(a)
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleToggleMethod(method: string, on: boolean) {
    const next = on
      ? [...methods.payment_methods, method]
      : methods.payment_methods.filter((m) => m !== method)
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
      setTips(updated)
      setTipsSaved(true)
      setTimeout(() => setTipsSaved(false), 2000)
    } finally {
      setTipsSaving(false)
    }
  }

  function validateTax(): string {
    if (tax.tax_enabled && tax.tax_rate < 0) return 'Tax rate must be a positive number'
    return ''
  }

  async function handleSaveTax() {
    const err = validateTax()
    if (err) { setTaxError(err); return }
    setTaxError('')
    setTaxSaving(true)
    try {
      const updated = await api.admin.patchTax(tax)
      setTax(updated)
      setTaxSaved(true)
      setTimeout(() => setTaxSaved(false), 2000)
    } finally {
      setTaxSaving(false)
    }
  }

  async function handleSaveAutomation() {
    setAutomationSaving(true)
    try {
      const updated = await api.admin.patchAutomation(automation)
      setAutomation(updated)
      setAutomationSaved(true)
      setTimeout(() => setAutomationSaved(false), 2000)
    } finally {
      setAutomationSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <Section title="Stripe integration">
        <StripeSection
          status={stripe}
          onSave={async (data) => { const s = await api.admin.saveStripeKeys(data); setStripe(s) }}
          onRemove={async () => { await api.admin.deleteStripeKeys(); setStripe({ publishable_key: null, has_secret: false, updated_at: null }) }}
        />
      </Section>

      <Section title="Payment methods">
        <PaymentMethodsSection
          methods={methods}
          hasStripe={stripe.has_secret}
          planAllowed={planAllowed}
          onToggle={handleToggleMethod}
          onNoteChange={async (note) => { await api.admin.patchPickupNote(note); setMethods((prev) => ({ ...prev, pickup_delivery_note: note })) }}
        />
      </Section>

      <Section title="Tips" onSave={handleSaveTips} saving={tipsSaving} saved={tipsSaved}>
        <TipsSection config={tips} onChange={(patch) => setTips((prev) => ({ ...prev, ...patch }))} />
      </Section>

      <Section title="Tax" onSave={handleSaveTax} saving={taxSaving} saved={taxSaved}>
        <TaxSection
          config={tax}
          onChange={(patch) => { setTax((prev) => ({ ...prev, ...patch })); setTaxError('') }}
          validationError={taxError}
        />
      </Section>

      <Section title="Ordering automation" onSave={handleSaveAutomation} saving={automationSaving} saved={automationSaved}>
        <AutomationSection config={automation} onChange={(patch) => setAutomation((prev) => ({ ...prev, ...patch }))} />
      </Section>
    </div>
  )
}
