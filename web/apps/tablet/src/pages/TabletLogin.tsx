import { useState, useEffect } from 'react'
import { ApiError } from '@wolfchow/api-client'
import { useAuth } from '@wolfchow/auth'

function getOrCreateDeviceUuid(): string {
  const stored = localStorage.getItem('device_uuid')
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem('device_uuid', id)
  return id
}

function detectPlatform(): string {
  const ua = navigator.userAgent
  const standalone =
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone) ||
    window.matchMedia('(display-mode: standalone)').matches

  let os = 'Unknown'
  if (/iPad/.test(ua)) os = 'iPad'
  else if (/iPhone/.test(ua)) os = 'iPhone'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac/.test(ua)) os = 'Mac'

  let browser = 'Browser'
  if (/CriOS|Chrome/.test(ua) && !/Edg/.test(ua)) browser = 'Chrome'
  else if (/FxiOS|Firefox/.test(ua)) browser = 'Firefox'
  else if (/Safari/.test(ua)) browser = 'Safari'
  else if (/Edg/.test(ua)) browser = 'Edge'

  return standalone ? `${os} · ${browser} (PWA)` : `${os} · ${browser}`
}

export function TabletLogin() {
  const { signInWithDeviceToken, getQueryParam, navigate, role, isLoading } = useAuth()
  const [deviceToken, setDeviceToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const expired = getQueryParam('expired') === '1'

  useEffect(() => {
    if (!isLoading && role && (role === 'kitchen' || role === 'tablet_device')) {
      navigate('/')
    }
  }, [isLoading, role, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signInWithDeviceToken(deviceToken.trim(), {
        device_uuid: getOrCreateDeviceUuid(),
        platform: detectPlatform(),
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid device token. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: '#080d17' }}>
        <div className="h-12 w-12 animate-spin rounded-full border-4" style={{ borderColor: '#1e293b', borderTopColor: '#f97316' }} />
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col items-center justify-center px-8"
      style={{ background: '#080d17' }}
    >
      {/* Expired banner */}
      {expired && (
        <div
          className="mb-8 w-full max-w-md rounded-2xl px-4 py-3 text-sm font-medium text-center"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}
        >
          ⚠️ Session expired — please reconnect the device
        </div>
      )}

      {/* Card */}
      <div
        className="w-full max-w-md rounded-3xl p-8"
        style={{ background: '#0f172a', border: '1px solid #1e293b' }}
      >
        {/* Brand */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl text-4xl"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
          >
            🍽
          </div>
          <h1 className="text-2xl font-black text-white">Kitchen Display</h1>
          <p className="mt-1.5 text-sm" style={{ color: '#64748b' }}>
            Enter your device token to connect
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-5 rounded-2xl px-4 py-3 text-sm font-medium"
            role="alert"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label
              htmlFor="device-token"
              className="mb-2 block text-sm font-semibold"
              style={{ color: '#94a3b8' }}
            >
              Device Token
            </label>
            <textarea
              id="device-token"
              rows={4}
              value={deviceToken}
              onChange={(e) => setDeviceToken(e.target.value)}
              placeholder="Paste the device token from the admin panel…"
              autoComplete="off"
              spellCheck={false}
              className="w-full resize-none rounded-2xl px-4 py-3.5 font-mono text-xs text-white placeholder-slate-600 focus:outline-none transition-colors"
              style={{
                background: '#1e293b',
                border: `1px solid ${error ? '#ef4444' : '#334155'}`,
              }}
              onFocus={(e) => (e.target.style.border = '1px solid #f97316')}
              onBlur={(e) => (e.target.style.border = `1px solid ${error ? '#ef4444' : '#334155'}`)}
            />
          </div>

          <button
            type="submit"
            disabled={busy || !deviceToken.trim()}
            className="w-full rounded-2xl py-4.5 text-base font-black text-white transition-all disabled:opacity-40 active:scale-98"
            style={{ background: busy ? '#c2410c' : 'linear-gradient(135deg, #f97316, #ea580c)', paddingTop: '1.125rem', paddingBottom: '1.125rem' }}
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Connecting…
              </span>
            ) : (
              '▶ Connect Device'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: '#334155' }}>
          Device tokens are generated in the restaurant admin panel under Devices
        </p>
      </div>
    </div>
  )
}
