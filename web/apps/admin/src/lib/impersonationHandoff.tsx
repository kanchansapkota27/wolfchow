import { useEffect } from 'react'
import { useAuth } from '@wolfchow/auth'
import type { SessionStore } from '@wolfchow/api-client'

interface ImpersonationTokenMessage {
  type: 'impersonation:token'
  access_token: string
}

function isImpersonationTokenMessage(data: unknown): data is ImpersonationTokenMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'impersonation:token' &&
    typeof (data as { access_token?: unknown }).access_token === 'string'
  )
}

/**
 * Receives the short-lived impersonation token from the superadmin app's
 * "View as admin" popup handoff (see superadmin's RestaurantDetail.tsx
 * `impersonate()`). Only active when this tab was opened as a popup
 * (`window.opener` set) — a normal direct admin login never listens for or
 * accepts postMessage tokens. The origin check on both the incoming message
 * and the `postMessage` reply is the actual security boundary.
 */
export function ImpersonationHandoff({
  session,
  superadminOrigin,
}: {
  session: SessionStore
  superadminOrigin: string
}) {
  const { refresh, navigate } = useAuth()

  useEffect(() => {
    const opener = window.opener as Window | null
    if (!opener) return

    function onMessage(event: MessageEvent) {
      if (event.origin !== superadminOrigin) return
      if (!isImpersonationTokenMessage(event.data)) return
      // No refresh token is issued for impersonation sessions by design —
      // they're short-lived (30 min) and not meant to be silently extended.
      session.setTokens({ access_token: event.data.access_token, refresh_token: '' })
      refresh()
      navigate('/')
    }

    window.addEventListener('message', onMessage)
    opener.postMessage('impersonation:ready', superadminOrigin)
    return () => window.removeEventListener('message', onMessage)
  }, [session, superadminOrigin, refresh, navigate])

  return null
}
