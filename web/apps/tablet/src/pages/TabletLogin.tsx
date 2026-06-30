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
  const standalone = ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone) ||
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
      <div className="flex h-full items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-green-500" />
          <p className="text-sm text-gray-400">Starting up…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gray-900 px-6">
      {expired && (
        <div className="mb-6 w-full max-w-sm rounded-xl border border-amber-500/50 bg-amber-900/40 px-4 py-3 text-sm text-amber-200">
          Session expired — please reconnect the device.
        </div>
      )}

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-600 text-2xl">
            🍽
          </div>
          <h1 className="text-2xl font-bold text-gray-100">Kitchen Display</h1>
          <p className="mt-1 text-sm text-gray-400">Connect this device to your restaurant</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/50 bg-red-900/40 px-4 py-3 text-sm text-red-200" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="device-token" className="mb-1.5 block text-sm font-medium text-gray-300">
              Device token
            </label>
            <textarea
              id="device-token"
              rows={3}
              value={deviceToken}
              onChange={(e) => setDeviceToken(e.target.value)}
              placeholder="Paste the device token from the admin panel…"
              autoComplete="off"
              spellCheck={false}
              className="w-full resize-none rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 font-mono text-xs text-gray-100 placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !deviceToken.trim()}
            className="w-full rounded-xl bg-green-600 py-4 text-base font-semibold text-white transition-colors hover:bg-green-500 active:bg-green-700 disabled:opacity-40"
          >
            {busy ? 'Connecting…' : 'Connect Device'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-600">
          Device tokens are generated from the restaurant admin panel.
        </p>
      </div>
    </div>
  )
}
