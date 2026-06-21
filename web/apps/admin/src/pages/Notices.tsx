import { useState, useEffect } from 'react'
import { Button } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import type { Notice, CreateNoticeInput, NoticeType, NoticeLocation } from '@wolfchow/api-client'

const TYPE_CONFIG: Record<NoticeType, { label: string; badge: string }> = {
  informational: { label: 'Informational', badge: 'bg-blue-100 text-blue-700' },
  warning:       { label: 'Warning',       badge: 'bg-amber-100 text-amber-700' },
  emergency:     { label: 'Emergency',     badge: 'bg-red-100 text-red-700' },
  promotional:   { label: 'Promotional',   badge: 'bg-purple-100 text-purple-700' },
}

const ALL_LOCATIONS: NoticeLocation[] = ['storefront', 'checkout', 'tracking', 'tablet', 'admin']

function noticeStatus(n: Notice): 'active' | 'scheduled' | 'expired' {
  const now = Date.now()
  if (n.expires_at && new Date(n.expires_at).getTime() < now) return 'expired'
  if (n.starts_at && new Date(n.starts_at).getTime() > now) return 'scheduled'
  return 'active'
}

// ── Create/Edit Modal ─────────────────────────────────────────────────────────

interface NoticeModalProps {
  initial?: Notice
  onSave: (data: CreateNoticeInput) => Promise<void>
  onClose: () => void
}

function NoticeModal({ initial, onSave, onClose }: NoticeModalProps) {
  const [form, setForm] = useState<CreateNoticeInput>({
    type: initial?.type ?? 'informational',
    message: initial?.message ?? '',
    display_locations: initial?.display_locations ?? ['storefront'],
    priority: initial?.priority ?? 0,
    starts_at: initial?.starts_at ?? '',
    expires_at: initial?.expires_at ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const remaining = 200 - form.message.length

  function toggleLocation(loc: NoticeLocation) {
    const locs = form.display_locations
    setForm({
      ...form,
      display_locations: locs.includes(loc) ? locs.filter((l) => l !== loc) : [...locs, loc],
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.display_locations.length === 0) { setError('Select at least one location'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...form,
        starts_at: form.starts_at || undefined,
        expires_at: form.expires_at || undefined,
      })
      onClose()
    } catch {
      setError('Failed to save notice')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-label={initial ? 'Edit notice' : 'Create notice'}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">{initial ? 'Edit notice' : 'Create notice'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as NoticeType })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {(Object.entries(TYPE_CONFIG) as Array<[NoticeType, { label: string; badge: string }]>).map(([type, cfg]) => (
                <option key={type} value={type}>{cfg.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message <span className={`text-xs font-normal ${remaining < 0 ? 'text-red-500' : 'text-gray-400'}`}>({remaining} remaining)</span>
            </label>
            <textarea
              value={form.message}
              onChange={(e) => {
                if (e.target.value.length <= 200) setForm({ ...form, message: e.target.value })
              }}
              maxLength={200}
              required
              rows={3}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
              aria-label="Message"
            />
          </div>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">Display locations</span>
            <div className="flex flex-wrap gap-2">
              {ALL_LOCATIONS.map((loc) => (
                <label key={loc} className={`flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer text-xs font-medium capitalize ${form.display_locations.includes(loc) ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'}`}>
                  <input
                    type="checkbox"
                    checked={form.display_locations.includes(loc)}
                    onChange={() => toggleLocation(loc)}
                    className="sr-only"
                    aria-label={loc}
                  />
                  {loc}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority <span className="text-xs text-gray-400">(0–100, higher = shown first)</span></label>
            <input
              type="number"
              min={0}
              max={100}
              value={form.priority ?? 0}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              className="border border-gray-200 rounded-md px-3 py-2 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              aria-label="Priority"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starts at <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="datetime-local"
                value={form.starts_at?.slice(0, 16) ?? ''}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires at <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="datetime-local"
                value={form.expires_at?.slice(0, 16) ?? ''}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
            <Button loading={saving} type="submit">{initial ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Notice row ────────────────────────────────────────────────────────────────

interface NoticeRowProps {
  notice: Notice
  onEdit: (n: Notice) => void
  onDelete: (id: string) => Promise<void>
}

function NoticeRow({ notice, onEdit, onDelete }: NoticeRowProps) {
  const status = noticeStatus(notice)
  const cfg = TYPE_CONFIG[notice.type]
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const rowClass =
    status === 'active' ? 'bg-white border-gray-100'
    : status === 'scheduled' ? 'bg-gray-50 border-gray-100 text-gray-500'
    : 'bg-gray-50 border-gray-100 opacity-50'

  return (
    <div className={`rounded-xl border p-4 ${rowClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`} aria-label={`${notice.type} badge`}>{cfg.label}</span>
            <span className="text-xs text-gray-400 capitalize">{status}</span>
            {notice.priority > 0 && <span className="text-xs text-gray-400">Priority {notice.priority}</span>}
          </div>
          <p className="text-sm text-gray-800">{notice.message}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {notice.display_locations.map((loc) => (
              <span key={loc} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded capitalize">{loc}</span>
            ))}
          </div>
          {(notice.starts_at || notice.expires_at) && (
            <p className="text-xs text-gray-400">
              {notice.starts_at && `From ${new Date(notice.starts_at).toLocaleString()}`}
              {notice.starts_at && notice.expires_at && ' · '}
              {notice.expires_at && `Until ${new Date(notice.expires_at).toLocaleString()}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => onEdit(notice)} className="text-xs text-indigo-600 hover:text-indigo-800" aria-label={`Edit notice`}>Edit</button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={async () => { setDeleting(true); await onDelete(notice.id); setDeleting(false) }}
                disabled={deleting}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-40"
              >Confirm</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-500 hover:text-red-700" aria-label="Delete notice">Delete</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Notices page ─────────────────────────────────────────────────────────

export function Notices() {
  const api = useApi()
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editNotice, setEditNotice] = useState<Notice | null>(null)

  useEffect(() => {
    void api.admin.listNotices().then(setNotices).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeCount = notices.filter((n) => noticeStatus(n) === 'active').length

  async function handleCreate(data: CreateNoticeInput) {
    const notice = await api.admin.createNotice(data)
    setNotices((prev) => [notice, ...prev])
  }

  async function handleUpdate(data: CreateNoticeInput) {
    if (!editNotice) return
    const updated = await api.admin.updateNotice(editNotice.id, data)
    setNotices((prev) => prev.map((n) => n.id === updated.id ? updated : n))
  }

  async function handleDelete(id: string) {
    await api.admin.deleteNotice(id)
    setNotices((prev) => prev.filter((n) => n.id !== id))
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>

  return (
    <div className="p-8 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Notices & announcements</h2>
          {activeCount > 0 && (
            <p className="text-sm text-amber-600 mt-0.5">{activeCount} active {activeCount === 1 ? 'notice' : 'notices'} →</p>
          )}
        </div>
        <Button onClick={() => setShowCreate(true)}>Create notice</Button>
      </div>

      {notices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          No notices yet
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <NoticeRow
              key={n.id}
              notice={n}
              onEdit={setEditNotice}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <NoticeModal onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editNotice && (
        <NoticeModal initial={editNotice} onSave={handleUpdate} onClose={() => setEditNotice(null)} />
      )}
    </div>
  )
}
