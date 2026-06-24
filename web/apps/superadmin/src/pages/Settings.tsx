import { useState, useEffect, useRef, useCallback } from 'react'
import { Lock, Zap, Database, Eye, EyeOff, RotateCcw, Save, MessageSquare, Bold, Italic, Underline, List } from 'lucide-react'
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
  upgrade_message_title: string
  upgrade_message_html: string
}

interface FormState {
  jwt_expiry_minutes: string
  global_rate_limit: string
  maintenance_mode: boolean
  support_email: string
  r2_public_domain: string
  upgrade_message_title: string
  upgrade_message_html: string
}

function settingsToForm(s: PlatformSettings): FormState {
  return {
    jwt_expiry_minutes: String(s.jwt_expiry_minutes),
    global_rate_limit: String(s.global_rate_limit),
    maintenance_mode: s.maintenance_mode,
    support_email: s.support_email,
    r2_public_domain: s.r2_public_domain,
    upgrade_message_title: s.upgrade_message_title ?? 'Upgrade your plan',
    upgrade_message_html: s.upgrade_message_html ?? '<p>This feature is not available on your current plan. Upgrade to unlock advanced features and higher limits.</p>',
  }
}

// ── Rich text editor ──────────────────────────────────────────────────────────

/**
 * Strips all HTML to a safe allowlist before setting it into the editor.
 * Prevents stored XSS if the DB value ever contains unexpected markup.
 */
function sanitizeEditorHtml(html: string): string {
  const ALLOWED = new Set(['p', 'b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'a'])
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  function clean(el: Element) {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase()
      if (!ALLOWED.has(tag)) {
        child.replaceWith(document.createTextNode(child.textContent ?? ''))
      } else {
        for (const attr of Array.from(child.attributes)) {
          const isHref = tag === 'a' && attr.name === 'href'
          const isSafeUrl = attr.value.startsWith('https://') || attr.value.startsWith('http://')
          if (isHref && isSafeUrl) continue
          child.removeAttribute(attr.name)
        }
        clean(child)
      }
    }
  }
  clean(doc.body)
  return doc.body.innerHTML
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInternalUpdate = useRef(false)

  // Sanitize before writing DB-sourced HTML into the contenteditable node
  useEffect(() => {
    if (!ref.current) return
    if (isInternalUpdate.current) { isInternalUpdate.current = false; return }
    const safe = sanitizeEditorHtml(value)
    if (ref.current.innerHTML !== safe) ref.current.innerHTML = safe
  }, [value])

  const exec = useCallback((cmd: string, val?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, val)
    if (ref.current) {
      isInternalUpdate.current = true
      onChange(ref.current.innerHTML)
    }
  }, [onChange])

  function handleInput() {
    if (!ref.current) return
    isInternalUpdate.current = true
    onChange(ref.current.innerHTML)
  }

  const toolbarBtn = 'rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors'

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-gray-100 bg-gray-50 px-2 py-1.5">
        <button type="button" onClick={() => exec('bold')} className={toolbarBtn} title="Bold"><Bold size={14} /></button>
        <button type="button" onClick={() => exec('italic')} className={toolbarBtn} title="Italic"><Italic size={14} /></button>
        <button type="button" onClick={() => exec('underline')} className={toolbarBtn} title="Underline"><Underline size={14} /></button>
        <div className="mx-1.5 h-4 w-px bg-gray-300" />
        <button type="button" onClick={() => exec('insertUnorderedList')} className={toolbarBtn} title="Bullet list"><List size={14} /></button>
        <div className="mx-1.5 h-4 w-px bg-gray-300" />
        <button
          type="button"
          onClick={() => {
            const url = window.prompt('Link URL:', 'https://')
            if (url && (url.startsWith('https://') || url.startsWith('http://'))) exec('createLink', url)
          }}
          className={`${toolbarBtn} text-xs font-semibold px-2`}
          title="Insert link"
        >
          Link
        </button>
        <button type="button" onClick={() => exec('unlink')} className={`${toolbarBtn} text-xs font-semibold px-2`} title="Remove link">
          Unlink
        </button>
      </div>
      {/* Editable area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="min-h-[100px] px-4 py-3 text-sm text-gray-800 focus:outline-none [&_a]:text-blue-600 [&_a]:underline [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-1"
      />
    </div>
  )
}

export function Settings() {
  const api = useApi()
  const { notify } = useToast()
  const queryClient = useQueryClient()

  const { status, data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.superadmin.getPlatformSettings(),
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
      await api.superadmin.updatePlatformSettings({
        jwt_expiry_minutes: parseInt(form.jwt_expiry_minutes, 10),
        global_rate_limit: parseInt(form.global_rate_limit, 10),
        maintenance_mode: form.maintenance_mode,
        support_email: form.support_email,
        r2_public_domain: form.r2_public_domain,
        upgrade_message_title: form.upgrade_message_title,
        upgrade_message_html: form.upgrade_message_html,
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

          {/* Upgrade Message */}
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold text-gray-900">
              <MessageSquare size={18} className="text-green-500" />
              Upgrade Message
            </h2>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Message Title</label>
                <input
                  type="text"
                  className={inputClass}
                  value={form.upgrade_message_title}
                  onChange={field('upgrade_message_title')}
                  placeholder="Upgrade your plan"
                />
                <p className={hintClass}>Shown as the heading in the upgrade popup seen by restaurant admins.</p>
              </div>
              <div>
                <label className={labelClass}>Message Body</label>
                <RichTextEditor
                  value={form.upgrade_message_html}
                  onChange={(html) => setForm((f) => f ? { ...f, upgrade_message_html: html } : f)}
                />
                <p className={hintClass}>Supports bold, italic, underline, bullet lists, and links. Shown below the heading in the upgrade popup.</p>
              </div>
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
