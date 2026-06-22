import { useState } from 'react'
import type { RestaurantListItem, SmtpConfig, SmtpGlobalInput, SmtpOverrideInput, SmtpOverrideItem } from '@wolfchow/types'
import { Button, Input, Modal, Select, useToast } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { PageHeader } from '../components/PageHeader'

// ── Global config form ────────────────────────────────────────────────────────

interface GlobalFormState {
  host: string
  port: string
  username: string
  password: string
  from_email: string
  from_name: string
}

function emptyGlobalForm(): GlobalFormState {
  return { host: '', port: '587', username: '', password: '', from_email: '', from_name: '' }
}

function configToForm(cfg: SmtpConfig): GlobalFormState {
  return {
    host: cfg.host,
    port: String(cfg.port),
    username: cfg.username,
    password: '',
    from_email: cfg.from_email,
    from_name: cfg.from_name,
  }
}

interface SmtpGlobalCardProps {
  config: SmtpConfig | null
  onSaved: () => void
}

function SmtpGlobalCard({ config, onSaved }: SmtpGlobalCardProps) {
  const api = useApi()
  const { notify } = useToast()
  const [editing, setEditing] = useState(config === null)
  const [busy, setBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [form, setForm] = useState<GlobalFormState>(() =>
    config ? configToForm(config) : emptyGlobalForm(),
  )

  function field(key: keyof GlobalFormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function save() {
    const port = parseInt(form.port, 10)
    if (!form.host || !form.username || !form.from_email || !form.from_name || !port) {
      notify('error', 'All fields except password are required.')
      return
    }
    if (!form.password && !config?.has_password) {
      notify('error', 'Password is required for a new config.')
      return
    }
    const body: SmtpGlobalInput = {
      host: form.host,
      port,
      username: form.username,
      password: form.password || '<<unchanged>>',
      from_email: form.from_email,
      from_name: form.from_name,
    }
    setBusy(true)
    try {
      await api.superadmin.putSmtpGlobal(body)
      notify('success', 'Global SMTP config saved.')
      setEditing(false)
      onSaved()
    } catch {
      notify('error', 'Failed to save SMTP config.')
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setTestBusy(true)
    try {
      const res = await api.superadmin.testSmtpGlobal()
      notify('success', `Test email sent to ${res.sent_to}`)
    } catch {
      notify('error', 'Test email failed. Check the config and Worker logs.')
    } finally {
      setTestBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Global SMTP</h2>
        {!editing && (
          <div className="flex gap-2">
            <Button variant="ghost" loading={testBusy} onClick={() => void sendTest()}>
              Send test email
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setForm(config ? configToForm(config) : emptyGlobalForm())
                setEditing(true)
              }}
            >
              Edit
            </Button>
          </div>
        )}
      </div>

      {!editing && config && (
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-gray-500">Host</dt>
            <dd className="text-gray-900">{config.host}:{config.port}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Username</dt>
            <dd className="text-gray-900">{config.username}</dd>
          </div>
          <div>
            <dt className="text-gray-500">From</dt>
            <dd className="text-gray-900">
              {config.from_name} &lt;{config.from_email}&gt;
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Monthly limit</dt>
            <dd className="text-gray-900">{config.monthly_limit ?? 'Unlimited'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Password</dt>
            <dd className="text-gray-500">{config.has_password ? '••••••••' : 'Not set'}</dd>
          </div>
        </dl>
      )}

      {!editing && !config && (
        <p className="text-sm text-gray-500">
          No global SMTP config yet.{' '}
          <button
            type="button"
            className="text-indigo-400 hover:text-indigo-300"
            onClick={() => setEditing(true)}
          >
            Add one
          </button>
        </p>
      )}

      {editing && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Host"
              value={form.host}
              onChange={field('host')}
              placeholder="smtp.example.com"
            />
            <Input
              label="Port"
              type="number"
              value={form.port}
              onChange={field('port')}
              placeholder="587"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Username"
              value={form.username}
              onChange={field('username')}
              placeholder="smtp-user@example.com"
            />
            <Input
              label={config?.has_password ? 'Password (leave blank to keep current)' : 'Password'}
              type="password"
              value={form.password}
              onChange={field('password')}
              placeholder={config?.has_password ? '••••••••' : 'Required'}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="From email"
              type="email"
              value={form.from_email}
              onChange={field('from_email')}
              placeholder="no-reply@example.com"
            />
            <Input
              label="From name"
              value={form.from_name}
              onChange={field('from_name')}
              placeholder="RestroAPI"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            {config && (
              <Button
                variant="ghost"
                onClick={() => {
                  setForm(configToForm(config))
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            )}
            <Button loading={busy} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add override modal ────────────────────────────────────────────────────────

interface AddSmtpOverrideModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  restaurants: RestaurantListItem[]
}

interface OverrideFormState extends GlobalFormState {
  restaurant_id: string
  monthly_limit: string
}

function AddSmtpOverrideModal({ open, onClose, onSaved, restaurants }: AddSmtpOverrideModalProps) {
  const api = useApi()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<OverrideFormState>({
    restaurant_id: '',
    host: '',
    port: '587',
    username: '',
    password: '',
    from_email: '',
    from_name: '',
    monthly_limit: '',
  })

  const restaurantOptions = restaurants.map((r) => ({
    value: r.id,
    label: r.display_name,
  }))

  function field(key: keyof OverrideFormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function save() {
    if (!form.restaurant_id || !form.host || !form.username || !form.password || !form.from_email || !form.from_name) {
      notify('error', 'Select a restaurant and fill all SMTP fields.')
      return
    }
    const port = parseInt(form.port, 10)
    if (!port) {
      notify('error', 'Port must be a number.')
      return
    }
    const monthly_limit = form.monthly_limit ? parseInt(form.monthly_limit, 10) : null
    const body: SmtpOverrideInput = {
      host: form.host,
      port,
      username: form.username,
      password: form.password,
      from_email: form.from_email,
      from_name: form.from_name,
      monthly_limit,
    }
    setBusy(true)
    try {
      await api.superadmin.putSmtpOverride(form.restaurant_id, body)
      notify('success', 'SMTP override saved.')
      onSaved()
      onClose()
      setForm({ restaurant_id: '', host: '', port: '587', username: '', password: '', from_email: '', from_name: '', monthly_limit: '' })
    } catch {
      notify('error', 'Failed to save SMTP override.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add SMTP override">
      <div className="space-y-4">
        <Select
          label="Restaurant"
          options={restaurantOptions}
          value={form.restaurant_id}
          onChange={(id) => setForm((f) => ({ ...f, restaurant_id: id }))}
          placeholder="Search restaurants…"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Host" value={form.host} onChange={field('host')} placeholder="smtp.example.com" />
          <Input label="Port" type="number" value={form.port} onChange={field('port')} placeholder="587" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Username" value={form.username} onChange={field('username')} />
          <Input label="Password" type="password" value={form.password} onChange={field('password')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="From email" type="email" value={form.from_email} onChange={field('from_email')} />
          <Input label="From name" value={form.from_name} onChange={field('from_name')} />
        </div>
        <Input
          label="Monthly limit (blank = unlimited)"
          type="number"
          value={form.monthly_limit}
          onChange={field('monthly_limit')}
          placeholder="1000"
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Save override
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Overrides table ───────────────────────────────────────────────────────────

interface SmtpOverridesTableProps {
  overrides: SmtpOverrideItem[]
  onDelete: (item: SmtpOverrideItem) => void
}

function SmtpOverridesTable({ overrides, onDelete }: SmtpOverridesTableProps) {
  if (overrides.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        No per-restaurant overrides. Restaurants will use the global SMTP config.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Restaurant</th>
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Host</th>
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">From</th>
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Usage / Limit</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {overrides.map((ov) => (
            <tr key={ov.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-2">
                <div className="font-medium text-gray-900">{ov.restaurant_name ?? '—'}</div>
                <div className="text-xs text-gray-500">{ov.restaurant_id}</div>
              </td>
              <td className="px-4 py-2 text-gray-900">
                {ov.host}:{ov.port}
              </td>
              <td className="px-4 py-2 text-gray-900">{ov.from_email}</td>
              <td className="px-4 py-2 text-gray-900">
                {ov.monthly_used}
                {ov.monthly_limit !== null ? ` / ${ov.monthly_limit}` : ' / ∞'}
              </td>
              <td className="px-4 py-2 text-right">
                <Button variant="ghost" onClick={() => onDelete(ov)}>
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function Smtp() {
  const api = useApi()
  const { notify } = useToast()

  const globalQ = useAsync(
    async () => {
      try {
        return await api.superadmin.getSmtpGlobal()
      } catch {
        return null
      }
    },
    [api],
  )

  const overridesQ = useAsync(
    () => api.superadmin.listSmtpOverrides(),
    [api],
  )

  const restaurantsQ = useAsync(
    () => api.superadmin.listRestaurants({ page_size: 200 }),
    [api],
  )

  const [addOpen, setAddOpen] = useState(false)
  const [deleting, setDeleting] = useState<SmtpOverrideItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await api.superadmin.deleteSmtpOverride(deleting.restaurant_id)
      notify('success', `Override for ${deleting.restaurant_name ?? deleting.restaurant_id} removed.`)
      setDeleting(null)
      overridesQ.reload()
    } catch {
      notify('error', 'Failed to remove override.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const hasGlobal = globalQ.data?.config != null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform SMTP"
        subtitle="Manage global fallback credentials and restaurant-specific overrides."
        action={
          hasGlobal ? (
            <span className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Global Fallback Active
            </span>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Global settings card */}
        <div>
          {globalQ.status === 'loading' && <p className="text-sm text-gray-500">Loading…</p>}
          {globalQ.status === 'error' && <SectionError onRetry={globalQ.reload} />}
          {globalQ.status === 'success' && (
            <SmtpGlobalCard config={globalQ.data?.config ?? null} onSaved={globalQ.reload} />
          )}
        </div>

        {/* Overrides card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              Restaurant Overrides
            </h2>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              + Add Override
            </button>
          </div>
          {overridesQ.status === 'loading' && <p className="text-sm text-gray-500">Loading…</p>}
          {overridesQ.status === 'error' && <SectionError onRetry={overridesQ.reload} />}
          {overridesQ.status === 'success' && (
            <SmtpOverridesTable
              overrides={overridesQ.data?.overrides ?? []}
              onDelete={setDeleting}
            />
          )}
        </div>
      </div>

      <AddSmtpOverrideModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={overridesQ.reload}
        restaurants={restaurantsQ.data?.restaurants ?? []}
      />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Remove SMTP override"
      >
        <div className="text-gray-700">
          <p>
            Remove the custom SMTP config for{' '}
            <strong>{deleting?.restaurant_name ?? deleting?.restaurant_id}</strong>? The restaurant
            will fall back to the global config.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleteBusy} onClick={() => void confirmDelete()}>
              Remove
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
