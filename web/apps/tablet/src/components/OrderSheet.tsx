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
        style={{ background: 'rgba(1,15,31,0.85)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Decline order"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl p-6 shadow-2xl"
        style={{ background: 'var(--md-surface-c)', borderTop: '1px solid var(--md-outline-var)' }}
      >
        <div className="mx-auto mb-5 h-1 w-12 rounded-full" style={{ background: 'var(--md-outline-var)' }} />

        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--md-error)' }}>cancel</span>
            <p
              className="font-black"
              style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 20, color: 'var(--md-on-surface)' }}
            >
              Decline Order {shortId}
            </p>
          </div>
          <p className="text-sm" style={{ color: 'var(--md-outline)' }}>
            {orderName} · Select a reason (optional)
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {REJECT_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(preset === p ? null : p)}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold transition-all"
              style={
                preset === p
                  ? { background: 'var(--md-error-c)', color: 'var(--md-on-error-c)', border: '1px solid var(--md-error)' }
                  : { background: 'var(--md-surface-low)', color: 'var(--md-on-surface-var)', border: '1px solid var(--md-outline-var)' }
              }
            >
              {p}
            </button>
          ))}
        </div>

        {!preset && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Custom reason…"
            rows={2}
            maxLength={500}
            className="mb-4 w-full resize-none rounded-xl px-4 py-3 text-sm focus:outline-none"
            style={{
              background: 'var(--md-surface-low)',
              border: '1px solid var(--md-outline-var)',
              color: 'var(--md-on-surface)',
            }}
            onFocus={(e) => (e.target.style.border = '1px solid var(--md-error)')}
            onBlur={(e) => (e.target.style.border = '1px solid var(--md-outline-var)')}
          />
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl py-4 text-sm font-bold transition-colors disabled:opacity-40"
            style={{
              flex: '0 0 120px',
              border: '1px solid var(--md-outline-var)',
              color: 'var(--md-on-surface-var)',
              background: 'var(--md-surface-low)',
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 12,
              letterSpacing: '0.04em',
            }}
          >
            CANCEL
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="flex-1 rounded-xl py-4 font-black transition-colors disabled:opacity-40"
            style={{
              background: 'var(--md-error-c)',
              color: 'var(--md-on-error-c)',
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 13,
              letterSpacing: '0.04em',
            }}
          >
            {busy ? 'DECLINING…' : 'CONFIRM DECLINE'}
          </button>
        </div>
      </div>
    </>
  )
}
