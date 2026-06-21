import { useState, useEffect } from 'react'
import { Button } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import { ApiError } from '@wolfchow/api-client'
import type { StaffMember, StaffPermission, InviteStaffInput, PatchStaffInput } from '@wolfchow/api-client'

const ALL_PERMISSIONS: Array<{ value: StaffPermission; label: string; color: string }> = [
  { value: 'orders:accept_reject', label: 'Accept/Reject', color: 'bg-purple-100 text-purple-700' },
  { value: 'orders:status', label: 'Order Status', color: 'bg-blue-100 text-blue-700' },
  { value: 'inventory:write', label: 'Inventory', color: 'bg-amber-100 text-amber-700' },
  { value: 'orders:pause', label: 'Pause Orders', color: 'bg-red-100 text-red-700' },
]

const PERM_COLOR: Record<StaffPermission, string> = {
  'orders:accept_reject': 'bg-purple-100 text-purple-700',
  'orders:status': 'bg-blue-100 text-blue-700',
  'inventory:write': 'bg-amber-100 text-amber-700',
  'orders:pause': 'bg-red-100 text-red-700',
}

const PERM_LABEL: Record<StaffPermission, string> = {
  'orders:accept_reject': 'Accept/Reject',
  'orders:status': 'Order Status',
  'inventory:write': 'Inventory',
  'orders:pause': 'Pause Orders',
}

// ── Invite Modal ──────────────────────────────────────────────────────────────

interface InviteModalProps {
  onSave: (data: InviteStaffInput) => Promise<void>
  onClose: () => void
}

function InviteModal({ onSave, onClose }: InviteModalProps) {
  const [form, setForm] = useState<InviteStaffInput>({ name: '', email: '', permissions: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function togglePerm(p: StaffPermission) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p)
        ? f.permissions.filter((x) => x !== p)
        : [...f.permissions, p],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      setSuccess(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError('Staff limit reached on your current plan')
      } else {
        setError('Failed to send invite')
      }
    } finally {
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 text-center space-y-4">
          <div className="text-4xl">✅</div>
          <p className="text-base font-medium text-gray-900">Invite sent to {form.email}</p>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-label="Invite staff">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Invite staff member</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="tel"
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">Permissions</span>
            <div className="space-y-2">
              {ALL_PERMISSIONS.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(value)}
                    onChange={() => togglePerm(value)}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
            <Button loading={saving} type="submit">Send invite</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit Staff Modal ──────────────────────────────────────────────────────────

interface EditModalProps {
  member: StaffMember
  onSave: (id: string, data: PatchStaffInput) => Promise<void>
  onClose: () => void
}

function EditModal({ member, onSave, onClose }: EditModalProps) {
  const [form, setForm] = useState<PatchStaffInput>({
    name: member.name,
    phone: member.phone ?? '',
    permissions: [...member.permissions],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function togglePerm(p: StaffPermission) {
    const perms = form.permissions ?? []
    setForm((f) => ({
      ...f,
      permissions: perms.includes(p) ? perms.filter((x) => x !== p) : [...perms, p],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(member.id, form)
      onClose()
    } catch {
      setError('Failed to update staff member')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-label="Edit staff">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Edit staff member</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">Permissions</span>
            <div className="space-y-2">
              {ALL_PERMISSIONS.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(form.permissions ?? []).includes(value)}
                    onChange={() => togglePerm(value)}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
            <Button loading={saving} type="submit">Save</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Add Device Modal ──────────────────────────────────────────────────────────

interface AddDeviceModalProps {
  onCreate: (name: string) => Promise<{ token: string; name: string }>
  onClose: () => void
}

function AddDeviceModal({ onCreate, onClose }: AddDeviceModalProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState<{ value: string; name: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await onCreate(name)
      setToken({ value: result.token, name: result.name })
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError('Staff limit reached on your current plan')
      } else {
        setError('Failed to create device')
      }
    } finally {
      setSaving(false)
    }
  }

  function copyToken() {
    if (token) void navigator.clipboard.writeText(token.value)
  }

  if (token) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-label="Device token">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
          <h3 className="text-base font-semibold text-gray-900">Device token for "{token.name}"</h3>
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
            ⚠ This token will not be shown again. Copy it now.
          </div>
          <div className="bg-gray-900 rounded-md p-4 font-mono text-sm text-green-400 break-all select-all" aria-label="Device token value">
            {token.value}
          </div>
          <div className="flex gap-2">
            <Button onClick={copyToken}>Copy token</Button>
            <Button variant="ghost" onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-label="Add device">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Add device</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Device name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Kitchen Tablet 1"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              aria-label="Device name"
            />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
            <Button loading={saving} type="submit">Create</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Deactivate popover ────────────────────────────────────────────────────────

interface DeactivatePopoverProps {
  name: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

function DeactivatePopover({ name, onConfirm, onCancel }: DeactivatePopoverProps) {
  const [loading, setLoading] = useState(false)

  async function confirm() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  return (
    <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56 text-sm">
      <p className="text-gray-700 mb-2">Deactivate <strong>{name}</strong>?</p>
      <div className="flex gap-2">
        <Button loading={loading} onClick={confirm}>Confirm</Button>
        <Button variant="ghost" onClick={onCancel} type="button">Cancel</Button>
      </div>
    </div>
  )
}

// ── Main Staff page ───────────────────────────────────────────────────────────

export function Staff() {
  const api = useApi()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [editMember, setEditMember] = useState<StaffMember | null>(null)
  const [deactivating, setDeactivating] = useState<string | null>(null)
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [inviteAtCap, setInviteAtCap] = useState(false)

  useEffect(() => {
    void api.admin.listStaff().then((s) => { setStaff(s); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Separate human staff from device logins by presence of device_id on the row
  const humanStaff = staff.filter((s) => !(s as unknown as Record<string, unknown>)['device_id'])
  const devices = staff.filter((s) => !!(s as unknown as Record<string, unknown>)['device_id'])

  async function handleInvite(data: InviteStaffInput) {
    try {
      await api.admin.inviteStaff(data)
      const updated = await api.admin.listStaff()
      setStaff(updated)
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setInviteAtCap(true)
      }
      throw err
    }
  }

  async function handleEdit(id: string, data: PatchStaffInput) {
    await api.admin.updateStaff(id, data)
    const updated = await api.admin.listStaff()
    setStaff(updated)
  }

  async function handleDeactivate(id: string) {
    await api.admin.deactivateStaff(id)
    setStaff((prev) => prev.map((s) => s.id === id ? { ...s, active: false } : s))
    setDeactivating(null)
  }

  async function handleCreateDevice(name: string) {
    const result = await api.admin.createDevice(name)
    const updated = await api.admin.listStaff()
    setStaff(updated)
    return { token: result.device_token, name }
  }

  async function handleRevokeDevice(id: string) {
    await api.admin.revokeDevice(id)
    setStaff((prev) => prev.filter((s) => s.id !== id))
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>

  return (
    <div className="p-8 max-w-4xl space-y-8">
      {/* Staff list */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Staff members</h2>
            <p className="text-sm text-gray-500 mt-0.5">Staff: {humanStaff.length}</p>
          </div>
          <div className="flex items-center gap-3">
            {inviteAtCap && (
              <span className="text-sm text-amber-600" role="alert">Staff limit reached on your plan</span>
            )}
            <Button
              onClick={() => setShowInvite(true)}
              disabled={inviteAtCap}
            >
              Invite staff
            </Button>
          </div>
        </div>

        {humanStaff.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
            No staff members yet
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Name</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Email</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Permissions</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Status</th>
                  <th className="py-2 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {humanStaff.map((member) => (
                  <tr
                    key={member.id}
                    className={`border-b border-gray-100 last:border-0 ${!member.active ? 'opacity-50' : ''}`}
                  >
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{member.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{member.email}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {member.permissions.map((p) => (
                          <span key={p} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PERM_COLOR[p as StaffPermission] ?? 'bg-gray-100 text-gray-600'}`}>
                            {PERM_LABEL[p as StaffPermission] ?? p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${member.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {member.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 justify-end relative">
                        <button
                          onClick={() => setEditMember(member)}
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                          aria-label={`Edit ${member.name}`}
                        >
                          Edit
                        </button>
                        {member.active && (
                          <div className="relative">
                            <button
                              onClick={() => setDeactivating(deactivating === member.id ? null : member.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                              aria-label={`Deactivate ${member.name}`}
                            >
                              Deactivate
                            </button>
                            {deactivating === member.id && (
                              <DeactivatePopover
                                name={member.name}
                                onConfirm={() => handleDeactivate(member.id)}
                                onCancel={() => setDeactivating(null)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Device logins */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Tablet / device logins</h2>
          <Button onClick={() => setShowAddDevice(true)}>Add device</Button>
        </div>
        {devices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
            No devices registered
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Name</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500">Permissions</th>
                  <th className="py-2 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{device.name}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {device.permissions.map((p) => (
                          <span key={p} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PERM_COLOR[p as StaffPermission] ?? 'bg-gray-100 text-gray-600'}`}>
                            {PERM_LABEL[p as StaffPermission] ?? p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => void handleRevokeDevice(device.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                        aria-label={`Revoke ${device.name}`}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showInvite && <InviteModal onSave={handleInvite} onClose={() => setShowInvite(false)} />}
      {editMember && <EditModal member={editMember} onSave={handleEdit} onClose={() => setEditMember(null)} />}
      {showAddDevice && (
        <AddDeviceModal
          onCreate={handleCreateDevice}
          onClose={() => setShowAddDevice(false)}
        />
      )}
    </div>
  )
}
