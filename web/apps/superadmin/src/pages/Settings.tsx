import { useState, useEffect } from 'react'
import { Lock, Zap, Database, Eye, EyeOff, RotateCcw, Save } from 'lucide-react'
import { useToast } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionError } from '../components/SectionError'
import { PageHeader } from '../components/PageHeader'

interface PlatformSettings {
  jwt_expiry_minutes: number
  global_rate_limit: number
  maintenance_mode: boolean
  support_email: string
  r2_public_domain: string
  webhook_signing_secret: string
}

interface FormState {
  jwt_expiry_minutes: string
  global_rate_limit: string
  maintenance_mode: boolean
  support_email: string
  r2_public_domain: string
}

function settingsToForm(s: PlatformSettings): FormState {
  return {
    jwt_expiry_minutes: String(s.jwt_expiry_minutes),
    global_rate_limit: String(s.global_rate_limit),
    maintenance_mode: s.maintenance_mode,
    support_email: s.support_email,
    r2_public_domain: s.r2_public_domain,
  }
}

export function Settings() {
  const api = useApi()
  const { notify } = useToast()
  const queryClient = useQueryClient()

  const { status, data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.superadmin.getSettings(),
  })

  const [form, setForm] = useState<FormState | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [regenBusy, setRegenBusy] = useState(false)

  // Initialise form once data loads (only on first load)
  useEffect(() => {
    if (data && form === null) setForm(settingsToForm(data.settings))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  function field<K extends keyof FormState>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => f ? { ...f, [key]: e.target.value } : f)
  }

  async function save() {
    if (!form) return
    setBusy(true)
    try {
      await api.superadmin.updateSettings({
        jwt_expiry_minutes: parseInt(form.jwt_expiry_minutes, 10),
        global_rate_limit: parseInt(form.global_rate_limit, 10),
        maintenance_mode: form.maintenance_mode,
        support_email: form.support_email,
        r2_public_domain: form.r2_public_domain,
      })
      notify('success', 'Platform settings saved.')
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    } catch {
      notify('error', 'Failed to save settings.')
    } finally {
      setBusy(false)
    }
  }

  async function regenerateSecret() {
    setRegenBusy(true)
    try {
      // Note: If api.superadmin.regenerateWebhookSecret() doesn't exist on the backend yet,
      // this will fail. Fallback: use api.superadmin.updateSettings({ webhook_signing_secret: '' })
      await api.superadmin.regenerateWebhookSecret()
      notify('success', 'Webhook signing secret regenerated.')
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    } catch {
      notify('error', 'Failed to regenerate secret.')
    } finally {
      setRegenBusy(false)
    }
  }

  const labelClass = 'block text-xs font-semibold tracking-wider text-gray-500 uppercase mb-1.5'
  const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none'
  const hintClass = 'mt-1 text-xs text-gray-400'

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Platform Settings"
        subtitle="Configure global security, feature toggles, and system-wide defaults."
      />

      {status === 'pending' && <p className="text-sm text-gray-500">Loading settings…</p>}
      {status === 'error' && <SectionError onRetry={() => queryClient.invalidateQueries({ queryKey: ['settings'] })} />}

      {status === 'success' && form && (
        <>
          {/* Security & Authentication */}
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold text-gray-900">
              <Lock size={18} className="text-amber-500" />
              Security &amp; Authentication
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelClass}>JWT Expiry (Minutes)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.jwt_expiry_minutes}
                  onChange={field('jwt_expiry_minutes')}
                  min={5}
                  max={10080}
                />
                <p className={hintClass}>Controls how long a user session lasts before requiring refresh.</p>
              </div>
              <div>
                <label className={labelClass}>Global Rate Limit</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.global_rate_limit}
                  onChange={field('global_rate_limit')}
                  min={1}
                />
                <p className={hintClass}>Requests per minute per IP for the entire API.</p>
              </div>
            </div>
          </section>

          {/* System Toggles */}
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold text-gray-900">
              <Zap size={18} className="text-blue-500" />
              System Toggles
            </h2>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Maintenance Mode</p>
                <p className="mt-0.5 text-xs text-gray-500">Temporarily disable all restaurant widgets and admin panels.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.maintenance_mode}
                onClick={() => setForm((f) => f ? { ...f, maintenance_mode: !f.maintenance_mode } : f)}
                className={[
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                  form.maintenance_mode ? 'bg-blue-500' : 'bg-gray-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200',
                    form.maintenance_mode ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>
          </section>

          {/* Infrastructure */}
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold text-gray-900">
              <Database size={18} className="text-purple-500" />
              Infrastructure
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Support Email</label>
                <input
                  type="email"
                  className={inputClass}
                  value={form.support_email}
                  onChange={field('support_email')}
                  placeholder="support@restroapi.com"
                />
              </div>
              <div>
                <label className={labelClass}>R2 Public Domain</label>
                <input
                  type="text"
                  className={inputClass}
                  value={form.r2_public_domain}
                  onChange={field('r2_public_domain')}
                  placeholder="cdn.restroapi.com"
                />
              </div>
            </div>
            <div className="mt-5">
              <label className={labelClass}>Webhook Signing Secret</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    className={inputClass + ' pr-10'}
                    value={data.settings.webhook_signing_secret}
                    readOnly
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700"
                  >
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void regenerateSecret()}
                  disabled={regenBusy}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw size={14} className={regenBusy ? 'animate-spin' : ''} />
                  Regenerate
                </button>
              </div>
              <p className={hintClass}>Used to sign outbound events. Changing this will break existing integrations.</p>
            </div>
          </section>

          {/* Save */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Save size={15} />
              {busy ? 'Saving…' : 'Save Platform Settings'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
