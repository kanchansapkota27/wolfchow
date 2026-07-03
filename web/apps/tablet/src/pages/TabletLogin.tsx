import { useState, useEffect, useRef, useCallback } from 'react'
import QrScanner from 'qr-scanner'
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
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [hasCamera, setHasCamera] = useState<boolean | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const expired = getQueryParam('expired') === '1'

  // Check camera availability once on mount
  useEffect(() => {
    QrScanner.hasCamera().then(setHasCamera).catch(() => setHasCamera(false))
  }, [])

  useEffect(() => {
    if (!isLoading && role && (role === 'kitchen' || role === 'tablet_device')) {
      navigate('/')
    }
  }, [isLoading, role, navigate])

  const stopScanner = useCallback(() => {
    scannerRef.current?.stop()
    scannerRef.current?.destroy()
    scannerRef.current = null
    setScanning(false)
    setScanError(null)
  }, [])

  const startScanner = useCallback(async () => {
    setScanError(null)
    setScanning(true)
    // Wait for the video element to mount
    await new Promise((r) => setTimeout(r, 80))
    if (!videoRef.current) return

    try {
      const scanner = new QrScanner(
        videoRef.current,
        (result) => {
          const token = result.data.trim()
          stopScanner()
          setDeviceToken(token)
        },
        {
          preferredCamera: 'environment',
          highlightScanRegion: true,
          highlightCodeOutline: true,
          overlay: undefined,
        },
      )
      scannerRef.current = scanner
      await scanner.start()
    } catch {
      setScanError('Camera access denied. Grant permission and try again.')
      setScanning(false)
    }
  }, [stopScanner])

  // Clean up scanner when component unmounts
  useEffect(() => () => stopScanner(), [stopScanner])

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
      <div className="flex h-full items-center justify-center" style={{ background: 'var(--md-bg)' }}>
        <div
          className="h-12 w-12 animate-spin rounded-full border-4"
          style={{ borderColor: 'var(--md-surface-ch)', borderTopColor: 'var(--md-secondary)' }}
        />
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col items-center justify-center px-8"
      style={{ background: 'var(--md-bg)' }}
    >
      {expired && (
        <div
          className="mb-8 w-full max-w-md rounded-xl px-4 py-3 text-sm font-medium text-center"
          style={{
            background: 'rgba(255,183,120,0.08)',
            border: '1px solid rgba(255,183,120,0.3)',
            color: 'var(--md-tertiary)',
            fontFamily: "'Inter',sans-serif",
          }}
        >
          Session expired — please reconnect the device
        </div>
      )}

      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ background: 'var(--md-surface-c)', border: '1px solid var(--md-outline-var)' }}
      >
        {/* Brand */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl"
            style={{ background: 'var(--md-surface-ch)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--md-secondary)', fontVariationSettings: "'FILL' 1" }}>
              restaurant_menu
            </span>
          </div>
          <h1
            className="font-black"
            style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 26, color: 'var(--md-on-surface)' }}
          >
            KitchenCommand
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--md-outline)' }}>
            Scan the QR code or enter your device token
          </p>
        </div>

        {error && (
          <div
            className="mb-5 rounded-xl px-4 py-3 text-sm font-medium"
            role="alert"
            style={{
              background: 'rgba(255,180,171,0.08)',
              border: '1px solid rgba(255,180,171,0.3)',
              color: 'var(--md-error)',
            }}
          >
            {error}
          </div>
        )}

        {/* QR Scanner panel */}
        {scanning && (
          <div className="mb-5 rounded-xl overflow-hidden" style={{ border: '1px solid var(--md-outline-var)' }}>
            <div className="relative" style={{ aspectRatio: '1 / 1', background: '#000' }}>
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                style={{ display: 'block' }}
              />
              {/* Corner guides */}
              <div className="absolute inset-0 pointer-events-none" style={{ padding: '20%' }}>
                {['tl', 'tr', 'bl', 'br'].map((corner) => (
                  <div
                    key={corner}
                    className="absolute"
                    style={{
                      width: 28, height: 28,
                      top: corner.startsWith('t') ? '20%' : undefined,
                      bottom: corner.startsWith('b') ? '20%' : undefined,
                      left: corner.endsWith('l') ? '20%' : undefined,
                      right: corner.endsWith('r') ? '20%' : undefined,
                      borderTop: corner.startsWith('t') ? '3px solid var(--md-secondary)' : undefined,
                      borderBottom: corner.startsWith('b') ? '3px solid var(--md-secondary)' : undefined,
                      borderLeft: corner.endsWith('l') ? '3px solid var(--md-secondary)' : undefined,
                      borderRight: corner.endsWith('r') ? '3px solid var(--md-secondary)' : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: 'var(--md-surface-low)' }}
            >
              <p style={{ fontSize: 12, color: 'var(--md-outline)', fontFamily: "'JetBrains Mono',monospace" }}>
                Point camera at device QR code
              </p>
              <button
                type="button"
                onClick={stopScanner}
                className="rounded-lg px-3 py-1.5 text-xs font-bold"
                style={{
                  background: 'var(--md-surface-ch)',
                  color: 'var(--md-on-surface)',
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {scanError && (
          <div
            className="mb-4 rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(255,180,171,0.08)', border: '1px solid rgba(255,180,171,0.3)', color: 'var(--md-error)' }}
          >
            {scanError}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {/* Scan button — only shown when not currently scanning and camera is available */}
          {!scanning && hasCamera && (
            <button
              type="button"
              onClick={() => void startScanner()}
              className="w-full rounded-xl font-bold transition-all active:scale-98 flex items-center justify-center gap-2"
              style={{
                padding: '14px 0',
                background: 'var(--md-surface-ch)',
                color: 'var(--md-on-surface)',
                border: '1px solid var(--md-outline-var)',
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 13,
                letterSpacing: '0.04em',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>qr_code_scanner</span>
              SCAN QR CODE
            </button>
          )}

          {/* Divider */}
          {hasCamera && (
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t" style={{ borderColor: 'var(--md-outline-var)' }} />
              <span style={{ fontSize: 11, color: 'var(--md-outline)', fontFamily: "'JetBrains Mono',monospace" }}>
                OR ENTER MANUALLY
              </span>
              <div className="flex-1 border-t" style={{ borderColor: 'var(--md-outline-var)' }} />
            </div>
          )}

          <div>
            <label
              htmlFor="device-token"
              className="mb-2 block text-sm font-semibold"
              style={{
                color: 'var(--md-on-surface-var)',
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 12,
                letterSpacing: '0.05em',
              }}
            >
              DEVICE TOKEN
            </label>
            <textarea
              id="device-token"
              rows={4}
              value={deviceToken}
              onChange={(e) => setDeviceToken(e.target.value)}
              placeholder="Paste the device token from the admin panel…"
              autoComplete="off"
              spellCheck={false}
              className="w-full resize-none rounded-xl px-4 py-3.5 font-mono text-xs placeholder:text-opacity-30 focus:outline-none transition-all"
              style={{
                background: 'var(--md-surface-low)',
                border: `1px solid ${error ? 'var(--md-error)' : 'var(--md-outline-var)'}`,
                color: 'var(--md-on-surface)',
              }}
              onFocus={(e) => (e.target.style.border = '1px solid var(--md-secondary)')}
              onBlur={(e) => (e.target.style.border = `1px solid ${error ? 'var(--md-error)' : 'var(--md-outline-var)'}`)}
            />
          </div>

          <button
            type="submit"
            disabled={busy || !deviceToken.trim()}
            className="w-full rounded-xl font-black transition-all active:scale-98 disabled:opacity-40"
            style={{
              padding: '16px 0',
              background: 'var(--md-secondary-c)',
              color: 'var(--md-on-secondary-c)',
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 14,
              letterSpacing: '0.05em',
            }}
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2"
                  style={{ borderColor: 'rgba(0,57,24,0.3)', borderTopColor: 'var(--md-on-secondary-c)' }}
                />
                CONNECTING…
              </span>
            ) : (
              'CONNECT DEVICE'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: 'var(--md-outline-var)' }}>
          Device tokens are generated in the restaurant admin panel under Devices
        </p>
      </div>
    </div>
  )
}
