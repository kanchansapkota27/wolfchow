import { useState } from 'react'

const REJECT_PRESETS = [
  'Out of stock',
  'Too busy right now',
  'Kitchen closing soon',
  'Item unavailable',
  'Store closed',
]

interface RejectSheetProps {
  orderName: string
  shortId: string
  onReject: (reason?: string) => Promise<void>
  onClose: () => void
}

export function RejectSheet({ orderName, shortId, onReject, onClose }: RejectSheetProps) {
  const [preset, setPreset] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    const reason = preset ?? (note.trim() || undefined)
    setBusy(true)
    try { await onReject(reason) } finally { setBusy(false) }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Decline order"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl p-6 shadow-2xl"
        style={{ background: '#0f172a', borderTop: '1px solid #1e293b' }}
      >
        {/* Handle */}
        <div className="mx-auto mb-5 h-1 w-12 rounded-full" style={{ background: '#334155' }} />

        {/* Title */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">❌</span>
            <p className="text-xl font-black text-white">Decline Order #{shortId}</p>
          </div>
          <p className="text-sm" style={{ color: '#64748b' }}>
            {orderName} · Select a reason (optional)
          </p>
        </div>

        {/* Preset chips */}
        <div className="mb-4 flex flex-wrap gap-2">
          {REJECT_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(preset === p ? null : p)}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
              style={
                preset === p
                  ? { background: '#991b1b', color: '#fecaca', border: '1px solid #ef4444' }
                  : { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }
              }
            >
              {p}
            </button>
          ))}
        </div>

        {/* Custom note */}
        {!preset && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Custom reason…"
            rows={2}
            maxLength={500}
            className="mb-4 w-full resize-none rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none"
            style={{ background: '#1e293b', border: '1px solid #334155' }}
          />
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-2xl border py-4 text-sm font-bold transition-colors disabled:opacity-40"
            style={{ flex: '0 0 120px', borderColor: '#334155', color: '#94a3b8', background: '#1e293b' }}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="flex-1 rounded-2xl py-4 text-base font-black text-white transition-colors disabled:opacity-40"
            style={{ background: busy ? '#7f1d1d' : '#b91c1c' }}
          >
            {busy ? 'Declining…' : '✕ Confirm Decline'}
          </button>
        </div>
      </div>
    </>
  )
}
