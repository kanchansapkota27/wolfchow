import { useState, useEffect } from 'react'
import { useApi } from '../lib/api'
import { useAuth } from '@wolfchow/auth'
import type { AdminSmtpStatus, SaveSmtpInput } from '@wolfchow/api-client'

const SOURCE_LABELS: Record<string, string> = {
  own:      'CUSTOM SMTP',
  override: 'PLATFORM OVERRIDE',
  global:   'GLOBAL FALLBACK',
}

function SourceBadge({ source }: { source: AdminSmtpStatus['smtp_source'] }) {
  const label = source ? SOURCE_LABELS[source] : 'NOT CONFIGURED'
  const color =
    source === 'own'      ? 'bg-green-100 text-green-700 border-green-200'
    : source === 'override' ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-gray-100 text-gray-600 border-gray-200'
  const dotColor =
    source === 'own'      ? 'bg-green-500'
    : source === 'override' ? 'bg-blue-500'
    : 'bg-gray-400'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      SOURCE: {label}
    </span>
  )
}

export function SmtpSettings() {
  const api = useApi()
  const { user } = useAuth()
  const [status, setStatus] = useState<AdminSmtpStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<SaveSmtpInput>({ host: '', port: 587, username: '', password: '', from_email: '', from_name: '' })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveOk, setSaveOk] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    void api.admin.getAdminSmtp().then((s) => {
      setStatus(s)
      if (s.smtp_source === 'own') {
        setForm((f) => ({
          ...f,
          host: s.host ?? '',
          port: s.port ?? 587,
          username: s.username ?? '',
          from_email: s.from_email ?? '',
          from_name: s.from_name ?? '',
        }))
      }
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    setSaveOk(false)
    try {
      const updated = await api.admin.saveAdminSmtp(form)
      setStatus(updated)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    } catch {
      setSaveError('Failed to save SMTP configuration. Check your credentials and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.admin.testAdminSmtp()
      setTestResult(`Test email sent to ${res.sent_to}`)
    } catch {
      setTestResult('Failed to send test email. Verify your SMTP settings.')
    } finally {
      setTesting(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      await api.admin.deleteAdminSmtp()
      const updated = await api.admin.getAdminSmtp()
      setStatus(updated)
      setForm({ host: '', port: 587, username: '', password: '', from_email: '', from_name: '' })
      setConfirmRemove(false)
    } catch {
      // ignore
    } finally {
      setRemoving(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>

  const hasCustom = status?.smtp_source === 'own'
  const adminEmail = typeof user?.email === 'string' ? user.email : ''

  return (
    <div className="p-8 max-w-5xl space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">SMTP Settings</h2>
          <p className="mt-0.5 text-sm text-gray-500">Configure how your restaurant sends notification emails.</p>
        </div>
        {status && <SourceBadge source={status.smtp_source} />}
      </div>

      {/* ── Platform fallback notice ── */}
      {!hasCustom && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-blue-800">Using Platform SMTP</p>
            <p className="text-xs text-blue-600">
              You are currently using the platform's default email service.
              {status && (
                <> You have used {status.monthly_used} of {status.monthly_limit ?? '∞'} monthly allowance.</>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left: form ── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Custom SMTP config */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 003 3h6a3 3 0 003-3m-3-3v6m-9-3v-6a3 3 0 013-3h6a3 3 0 013 3v6M9 12h6" />
              </svg>
              Custom SMTP Configuration
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">SMTP Host</label>
                  <input
                    type="text"
                    placeholder="smtp.postmarkapp.com"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Port</label>
                  <input
                    type="number"
                    placeholder="587"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                    required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Username</label>
                  <input
                    type="text"
                    placeholder="api-token"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  {hasCustom && (
                    <p className="mt-1 text-xs text-gray-400">Leave blank to keep current password</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">From Email</label>
                  <input
                    type="email"
                    placeholder="orders@yourrestaurant.com"
                    value={form.from_email}
                    onChange={(e) => setForm({ ...form, from_email: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">From Name</label>
                  <input
                    type="text"
                    placeholder="Masala Cottage"
                    value={form.from_name}
                    onChange={(e) => setForm({ ...form, from_name: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              {saveError && <p className="text-sm text-red-600" role="alert">{saveError}</p>}

              <div className="flex items-center justify-between pt-1">
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Encrypted with AES-256-GCM at rest.
                </span>
                <div className="flex items-center gap-2">
                  {saveOk && <span className="text-xs text-green-600">Saved ✓</span>}
                  {hasCustom && !confirmRemove && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(true)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
                    >
                      Remove
                    </button>
                  )}
                  {confirmRemove && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleRemove}
                        disabled={removing}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        Confirm remove
                      </button>
                      <button type="button" onClick={() => setConfirmRemove(false)} className="text-sm text-gray-400 px-2">Cancel</button>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : (
                      <>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Verify &amp; Save
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Test connection */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50">
                <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Test Connection</p>
                <p className="text-xs text-gray-500">
                  Send a sample notification to your admin address:{' '}
                  <span className="font-medium text-gray-700">{adminEmail}</span>
                </p>
                {testResult && (
                  <p className={`mt-0.5 text-xs ${testResult.startsWith('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                    {testResult}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleTest}
              disabled={testing}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
              {testing ? 'Sending…' : 'Send Test Email'}
            </button>
          </div>
        </div>

        {/* ── Right: info panel ── */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              Delivery Info
            </h4>
            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-2 text-xs font-semibold text-gray-700">Recommended Providers</p>
                <ul className="space-y-1.5 text-xs text-gray-500">
                  {['Postmark (highly recommended)', 'Resend', 'Amazon SES', 'SendGrid'].map((p) => (
                    <li key={p} className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-gray-400" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-700">Why Custom SMTP?</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Using your own SMTP ensures emails arrive from your brand's domain, improving trust and deliverability.
                  It also removes platform-enforced monthly limits.
                </p>
              </div>
            </div>
          </div>

          {/* DNS card */}
          <div className="rounded-xl bg-indigo-600 p-5 text-white">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" />
              </svg>
            </div>
            <p className="mb-1 text-sm font-bold">Need help with DNS?</p>
            <p className="mb-4 text-xs text-indigo-100 leading-relaxed">
              For best deliverability, ensure you have SPF, DKIM, and DMARC records set up on your domain.
            </p>
            <button className="w-full rounded-lg bg-white py-1.5 text-xs font-bold uppercase tracking-wide text-indigo-600 hover:bg-indigo-50">
              View Setup Guide
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
