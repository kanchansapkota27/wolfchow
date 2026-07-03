import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { Button } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import { usePlan } from '../lib/usePlan'
import type { AdminSmtpStatus, SaveSmtpInput, NotificationConfig, TriggerStatus } from '@wolfchow/api-client'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const STATUS_LABELS: Record<TriggerStatus, string> = {
  pending_payment: 'Awaiting Payment',
  scheduled: 'Scheduled',
  auth_success: 'Payment Authorised',
  accepted: 'Order Accepted',
  preparing: 'Preparing',
  ready: 'Ready for Pickup',
  completed: 'Completed',
  rejected: 'Rejected',
  missed: 'Missed',
  refunded: 'Refunded',
}

const MANDATORY_CUSTOMER: Set<TriggerStatus> = new Set(['rejected', 'missed', 'refunded'])

const ALL_STATUSES: TriggerStatus[] = [
  'pending_payment', 'scheduled', 'auth_success', 'accepted',
  'preparing', 'ready', 'completed', 'rejected', 'missed', 'refunded',
]

// ── SMTP Section ──────────────────────────────────────────────────────────────

interface SmtpSectionProps {
  status: AdminSmtpStatus
  onSave: (data: SaveSmtpInput) => Promise<void>
  onDelete: () => Promise<void>
  onTest: () => Promise<{ sent_to: string }>
}

function SmtpSection({ status, onSave, onDelete, onTest }: SmtpSectionProps) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<SaveSmtpInput>({
    host: status.host ?? '',
    port: status.port ?? 587,
    username: status.username ?? '',
    password: '',
    from_email: status.from_email ?? '',
    from_name: status.from_name ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const sourceLabel =
    status.smtp_source === 'own' ? 'Your SMTP'
    : status.smtp_source === 'override' ? `Platform override (${status.monthly_used}/${status.monthly_limit} this month)`
    : status.smtp_source === 'global' ? `Platform global (${status.monthly_used}/${status.monthly_limit} this month)`
    : 'Not configured'

  const showUsageBar = (status.smtp_source === 'override' || status.smtp_source === 'global') && status.monthly_limit !== null

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      setEditing(false)
      setForm((f) => ({ ...f, password: '' }))
    } catch {
      setError('Failed to save SMTP settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult('')
    try {
      const result = await onTest()
      setTestResult(`Test email sent to ${result.sent_to}`)
    } catch {
      setTestResult('Test failed — check your SMTP settings')
    } finally {
      setTesting(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDelete()
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={`text-sm font-medium px-3 py-1 rounded-full ${
          status.smtp_source === 'own' ? 'bg-green-100 text-green-700'
          : status.smtp_source ? 'bg-blue-100 text-blue-700'
          : 'bg-gray-100 text-gray-600'
        }`}>
          {sourceLabel}
        </span>
        {testResult && <span className="text-sm text-gray-600">{testResult}</span>}
      </div>

      {showUsageBar && status.monthly_limit !== null && (
        <div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, (status.monthly_used / status.monthly_limit) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">{status.monthly_used}/{status.monthly_limit} emails this month</p>
        </div>
      )}

      {!editing ? (
        <div className="flex items-center gap-3">
          <Button onClick={() => setEditing(true)}>
            {status.smtp_source === 'own' ? 'Update SMTP settings' : 'Configure your SMTP'}
          </Button>
          {status.smtp_source === 'own' && (
            <>
              <Button loading={testing} onClick={handleTest} variant="ghost">Test</Button>
              {!confirmDelete && (
                <button onClick={() => setConfirmDelete(true)} className="text-sm text-red-500 hover:text-red-700">
                  Remove
                </button>
              )}
              {confirmDelete && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">You'll fall back to the platform SMTP.</span>
                  <Button loading={deleting} onClick={handleDelete}>Confirm remove</Button>
                  <button onClick={() => setConfirmDelete(false)} className="text-sm text-gray-500">Cancel</button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Host</label>
              <input type="text" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" aria-label="SMTP host" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
              <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} required className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" aria-label="SMTP port" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" aria-label="SMTP username" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" aria-label="SMTP password" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From email</label>
              <input type="email" value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} required className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" aria-label="From email" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From name</label>
              <input type="text" value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} required className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" aria-label="From name" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button loading={saving} type="submit">Save</Button>
            <Button variant="ghost" onClick={() => setEditing(false)} type="button">Cancel</Button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Email chips input ─────────────────────────────────────────────────────────

interface EmailChipsProps {
  emails: string[]
  onChange: (emails: string[]) => void
  disabled?: boolean
}

function EmailChips({ emails, onChange, disabled }: EmailChipsProps) {
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addEmail(raw: string) {
    const email = raw.trim()
    if (!email) return
    if (!EMAIL_RE.test(email)) { setInputError(true); return }
    if (!emails.includes(email)) onChange([...emails, email])
    setInput('')
    setInputError(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addEmail(input)
    } else if (e.key === 'Backspace' && input === '' && emails.length > 0) {
      onChange(emails.slice(0, -1))
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-1 min-h-[34px] border rounded-md px-2 py-1 cursor-text ${inputError ? 'border-red-400' : 'border-gray-200'}`}
      onClick={() => inputRef.current?.focus()}
    >
      {emails.map((email) => (
        <span key={email} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded">
          {email}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(emails.filter((x) => x !== email)) }}
              className="text-indigo-400 hover:text-indigo-600 leading-none"
              aria-label={`Remove ${email}`}
            >×</button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setInputError(false) }}
          onKeyDown={handleKeyDown}
          onBlur={() => addEmail(input)}
          placeholder={emails.length === 0 ? 'Add email…' : ''}
          className="flex-1 min-w-[120px] text-xs outline-none bg-transparent"
          aria-label="Add internal recipient email"
        />
      )}
    </div>
  )
}

// ── Preview email modal ───────────────────────────────────────────────────────

interface PreviewModalProps {
  status: TriggerStatus
  onClose: () => void
  onSend: (status: TriggerStatus) => Promise<{ sent_to: string }>
}

function PreviewModal({ status, onClose, onSend }: PreviewModalProps) {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')

  async function handleSend() {
    setSending(true)
    try {
      const r = await onSend(status)
      setResult(`Example email sent to ${r.sent_to}`)
    } catch {
      setResult('Failed to send preview')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-label="Preview notification">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Preview: {STATUS_LABELS[status]}</h3>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="text-sm text-gray-600">
          Sends a test email for the <strong>{STATUS_LABELS[status]}</strong> notification stage to your admin email.
        </p>
        {result && <p className="text-sm text-gray-600">{result}</p>}
        <div className="flex gap-2">
          <Button loading={sending} onClick={handleSend}>Send test</Button>
          <Button variant="ghost" onClick={onClose} type="button">Close</Button>
        </div>
      </div>
    </div>
  )
}

// ── Main Notifications page ───────────────────────────────────────────────────

export function Notifications() {
  const api = useApi()
  const { plan, isLoading: planLoading } = usePlan()
  const emailEnabled = (plan?.feature_flags as Record<string, boolean> | undefined)?.email_notifications ?? false
  const [smtp, setSmtp] = useState<AdminSmtpStatus | null>(null)
  const [configs, setConfigs] = useState<NotificationConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [previewStatus, setPreviewStatus] = useState<TriggerStatus | null>(null)

  useEffect(() => {
    void Promise.all([
      api.admin.getAdminSmtp(),
      api.admin.getNotifications(),
    ]).then(([s, n]) => {
      setSmtp(s)
      // Fill in any missing statuses with defaults
      const existing = new Map(n.map((c) => [c.trigger_status, c]))
      setConfigs(ALL_STATUSES.map((status) => existing.get(status) ?? {
        trigger_status: status,
        send_customer: false,
        internal_recipients: [],
        template_override: null,
      }))
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateConfig(status: TriggerStatus, patch: Partial<NotificationConfig>) {
    setConfigs((prev) => prev.map((c) => c.trigger_status === status ? { ...c, ...patch } : c))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await api.admin.putNotifications(configs)
      const existing = new Map(updated.map((c) => [c.trigger_status, c]))
      setConfigs(ALL_STATUSES.map((status) => existing.get(status) ?? configs.find((c) => c.trigger_status === status)!))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading || planLoading) return <div className="p-8 text-gray-500">Loading…</div>

  if (!emailEnabled) {
    return (
      <div className="p-8 max-w-4xl">
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-900">Email notifications are not available on your current plan.</p>
          <p className="mt-1 text-sm text-gray-500">Upgrade your plan to configure email notifications and SMTP settings.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl space-y-8">
      {/* SMTP section */}
      {smtp && (
        <section className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Email (SMTP)</h2>
          <SmtpSection
            status={smtp}
            onSave={async (data) => { const s = await api.admin.saveAdminSmtp(data); setSmtp(s) }}
            onDelete={async () => { await api.admin.deleteAdminSmtp(); const s = await api.admin.getAdminSmtp(); setSmtp(s) }}
            onTest={() => api.admin.testAdminSmtp()}
          />
        </section>
      )}

      {/* Notification stages table */}
      <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Notification stages</h2>
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-green-600">Saved</span>}
            <Button loading={saving} onClick={handleSave}>Save all</Button>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 w-40">Stage</th>
              <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 w-28">Send to customer</th>
              <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Internal recipients</th>
              <th className="py-2 px-4 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {configs.map((config) => {
              const mandatory = MANDATORY_CUSTOMER.has(config.trigger_status)
              return (
                <tr key={config.trigger_status} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 px-4">
                    <span className="text-sm font-medium text-gray-900">{STATUS_LABELS[config.trigger_status]}</span>
                    {mandatory && <span className="ml-1 text-xs text-gray-400">(required)</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={config.send_customer}
                      disabled={mandatory}
                      onChange={(e) => updateConfig(config.trigger_status, { send_customer: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600 disabled:opacity-40"
                      aria-label={`Send to customer for ${STATUS_LABELS[config.trigger_status]}`}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <EmailChips
                      emails={config.internal_recipients}
                      onChange={(emails) => updateConfig(config.trigger_status, { internal_recipients: emails })}
                    />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setPreviewStatus(config.trigger_status)}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                      aria-label={`Preview email for ${STATUS_LABELS[config.trigger_status]}`}
                    >
                      Preview
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {previewStatus && (
        <PreviewModal
          status={previewStatus}
          onClose={() => setPreviewStatus(null)}
          onSend={(status) => api.admin.previewNotification(status)}
        />
      )}
    </div>
  )
}
