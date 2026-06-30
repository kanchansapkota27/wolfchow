import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as QRCode from 'qrcode'
import { ApiError } from '@wolfchow/api-client'
import type { Device, DevicePermission, CreateDeviceInput } from '@wolfchow/api-client'
import { useApi } from '../lib/api'

const ALL_PERMISSIONS: Array<{ value: DevicePermission; label: string; description: string }> = [
  { value: 'orders:accept_reject', label: 'Accept / Reject', description: 'Approve or reject incoming orders' },
  { value: 'orders:status', label: 'Order Status', description: 'Advance orders through kitchen stages' },
  { value: 'inventory:write', label: 'Inventory', description: 'Toggle item availability' },
  { value: 'orders:pause', label: 'Pause Orders', description: 'Pause and resume incoming orders' },
]

const PERM_BADGE: Record<DevicePermission, string> = {
  'orders:accept_reject': 'bg-purple-100 text-purple-700',
  'orders:status': 'bg-blue-100 text-blue-700',
  'inventory:write': 'bg-amber-100 text-amber-700',
  'orders:pause': 'bg-red-100 text-red-700',
}

const PERM_LABEL: Record<DevicePermission, string> = {
  'orders:accept_reject': 'Accept/Reject',
  'orders:status': 'Order Status',
  'inventory:write': 'Inventory',
  'orders:pause': 'Pause Orders',
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Create device modal ───────────────────────────────────────────────────────

interface CreateModalProps {
  onSave: (data: CreateDeviceInput) => Promise<{ device_token: string }>
  onClose: () => void
}

function CreateDeviceModal({ onSave, onClose }: CreateModalProps) {
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<DevicePermission[]>(['orders:accept_reject', 'orders:status'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    QRCode.toDataURL(token, { width: 260, margin: 2, color: { dark: '#111827', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [token])

  function togglePerm(p: DevicePermission) {
    setPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await onSave({ name, permissions })
      setToken(result.device_token)
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError('Device limit reached on your current plan. Upgrade to add more devices.')
      } else {
        setError('Failed to create device. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function copyToken() {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {!token ? (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Register Device</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Name the device and set its permissions. You'll get a one-time token to paste on the tablet.
              </p>
            </div>

            <div className="space-y-5 px-6 py-5">
              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Device name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Grill Station, Counter 1"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Permissions</p>
                <div className="space-y-2">
                  {ALL_PERMISSIONS.map(({ value, label, description }) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={permissions.includes(value)}
                        onChange={() => togglePerm(value)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{label}</p>
                        <p className="text-xs text-gray-500">{description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim() || permissions.length === 0}
                className="flex-[2] rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {saving ? 'Creating…' : 'Create Device'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Device token — save now</h2>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Warning */}
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <span className="mt-0.5 text-amber-500 shrink-0">⚠</span>
                <div className="text-sm text-amber-800">
                  <p className="font-semibold">This token is shown only once.</p>
                  <p className="mt-0.5 text-amber-700">Save the QR code or copy the token before closing. Anyone with this token can log in as this device.</p>
                </div>
              </div>

              {/* QR code */}
              {qrDataUrl ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 py-5">
                  <img src={qrDataUrl} alt="Device token QR code" className="h-52 w-52 rounded-lg" />
                  <p className="text-xs text-gray-400">Scan with the tablet to log in</p>
                </div>
              ) : (
                <div className="flex h-52 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
                  <span className="text-sm text-gray-400">Generating QR…</span>
                </div>
              )}

              {/* Raw token */}
              <div className="rounded-xl bg-gray-900 px-4 py-3">
                <p className="break-all font-mono text-xs leading-relaxed text-green-400">{token}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void copyToken()}
                  className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {copied ? '✓ Copied!' : 'Copy token'}
                </button>
                {qrDataUrl && (
                  <a
                    href={qrDataUrl}
                    download="device-token-qr.png"
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Download QR
                  </a>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Done — I've saved the token
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Edit permissions modal ────────────────────────────────────────────────────

interface EditModalProps {
  device: Device
  onSave: (permissions: DevicePermission[]) => Promise<void>
  onClose: () => void
}

function EditPermissionsModal({ device, onSave, onClose }: EditModalProps) {
  const [permissions, setPermissions] = useState<DevicePermission[]>(device.permissions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function togglePerm(p: DevicePermission) {
    setPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(permissions)
      onClose()
    } catch {
      setError('Failed to update permissions.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Edit permissions</h2>
            <p className="mt-0.5 text-sm text-gray-500">{device.name}</p>
          </div>

          <div className="space-y-2 px-6 py-5">
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            {ALL_PERMISSIONS.map(({ value, label, description }) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={permissions.includes(value)}
                  onChange={() => togglePerm(value)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-[2] rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Device row ────────────────────────────────────────────────────────────────

interface DeviceRowProps {
  device: Device
  onEdit: () => void
  onRevoke: () => void
  revoking: boolean
}

function DeviceRow({ device, onEdit, onRevoke, revoking }: DeviceRowProps) {
  const isRecent = device.last_seen_at
    ? Date.now() - new Date(device.last_seen_at).getTime() < 10 * 60 * 1000
    : false

  return (
    <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Status dot */}
      <div className="mt-1 shrink-0">
        <span
          className={['h-2.5 w-2.5 rounded-full block', isRecent ? 'bg-green-500' : 'bg-gray-300'].join(' ')}
          title={isRecent ? 'Online recently' : 'Offline'}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-gray-900">{device.name}</p>
          {device.platform && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{device.platform}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-400">
          Last seen: {relativeTime(device.last_seen_at)}
          {device.device_uuid && <span className="ml-2 font-mono opacity-60">{device.device_uuid.slice(0, 8)}…</span>}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {device.permissions.length > 0 ? device.permissions.map((p) => (
            <span
              key={p}
              className={['rounded-full px-2 py-0.5 text-xs font-medium', PERM_BADGE[p] ?? 'bg-gray-100 text-gray-600'].join(' ')}
            >
              {PERM_LABEL[p] ?? p}
            </span>
          )) : (
            <span className="text-xs text-gray-400">No permissions</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          onClick={onEdit}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Edit
        </button>
        <button
          onClick={onRevoke}
          disabled={revoking}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          {revoking ? 'Revoking…' : 'Revoke'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Devices() {
  const api = useApi()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editDevice, setEditDevice] = useState<Device | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.admin.listDevices(),
    refetchInterval: 60_000,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: DevicePermission[] }) =>
      api.admin.updateDevice(id, { permissions }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['devices'] }),
  })

  async function handleCreate(input: CreateDeviceInput) {
    const result = await api.admin.createDevice(input)
    void qc.invalidateQueries({ queryKey: ['devices'] })
    return result
  }

  async function handleRevoke(id: string) {
    setRevokingId(id)
    try {
      await api.admin.revokeDevice(id)
      void qc.invalidateQueries({ queryKey: ['devices'] })
    } finally {
      setRevokingId(null)
    }
  }

  const devices = data?.devices ?? []
  const deviceCap = data?.device_cap ?? 0
  const deviceCount = data?.device_count ?? 0
  const atLimit = deviceCount >= deviceCap

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Kitchen tablets and displays registered to your restaurant
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={atLimit}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={atLimit ? `Device limit reached (${deviceCap})` : undefined}
        >
          + Add Device
        </button>
      </div>

      {/* Plan usage */}
      {data && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-gray-600">Devices used</span>
            <span className={['font-semibold', atLimit ? 'text-red-600' : 'text-gray-900'].join(' ')}>
              {deviceCount} / {deviceCap}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={['h-2 rounded-full transition-all', atLimit ? 'bg-red-500' : 'bg-blue-500'].join(' ')}
              style={{ width: `${Math.min((deviceCount / deviceCap) * 100, 100)}%` }}
            />
          </div>
          {atLimit && (
            <p className="mt-2 text-xs text-red-600">
              Device limit reached. Upgrade your plan to add more devices.
            </p>
          )}
        </div>
      )}

      {/* Device list */}
      {isLoading && (
        <div className="py-12 text-center text-sm text-gray-400">Loading devices…</div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Failed to load devices.</div>
      )}
      {!isLoading && !error && devices.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
          <p className="text-sm font-medium text-gray-500">No devices registered yet</p>
          <p className="mt-1 text-xs text-gray-400">Add a device to get started</p>
        </div>
      )}
      {!isLoading && devices.length > 0 && (
        <div className="space-y-3">
          {devices.map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              onEdit={() => setEditDevice(device)}
              onRevoke={() => void handleRevoke(device.id)}
              revoking={revokingId === device.id}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateDeviceModal
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editDevice && (
        <EditPermissionsModal
          device={editDevice}
          onSave={async (permissions) => { await updateMutation.mutateAsync({ id: editDevice.id, permissions }) }}
          onClose={() => setEditDevice(null)}
        />
      )}
    </div>
  )
}
