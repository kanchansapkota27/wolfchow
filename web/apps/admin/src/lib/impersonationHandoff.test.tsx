import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ImpersonationHandoff } from './impersonationHandoff'

const mockRefresh = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@wolfchow/auth', () => ({
  useAuth: () => ({ refresh: mockRefresh, navigate: mockNavigate }),
}))

const SUPERADMIN_ORIGIN = 'http://localhost:5173'

function fakeSession() {
  return {
    getAccessToken: vi.fn(() => null),
    getRefreshToken: vi.fn(() => null),
    setTokens: vi.fn(),
    clear: vi.fn(),
  }
}

function fireMessage(origin: string, data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { origin, data }))
}

beforeEach(() => {
  mockRefresh.mockClear()
  mockNavigate.mockClear()
})

describe('STORY-085 · impersonation handoff (admin receiver)', () => {
  it('not opened as a popup: no ready signal sent, no listener effect', () => {
    // window.opener is null/undefined by default in jsdom (not opened via window.open).
    const session = fakeSession()
    render(<ImpersonationHandoff session={session} superadminOrigin={SUPERADMIN_ORIGIN} />)

    fireMessage(SUPERADMIN_ORIGIN, { type: 'impersonation:token', access_token: 'tok123' })
    expect(session.setTokens).not.toHaveBeenCalled()
  })

  it('opened as a popup: posts impersonation:ready to the opener', () => {
    const session = fakeSession()
    const postMessage = vi.fn()
    vi.stubGlobal('opener', { postMessage })

    render(<ImpersonationHandoff session={session} superadminOrigin={SUPERADMIN_ORIGIN} />)

    expect(postMessage).toHaveBeenCalledWith('impersonation:ready', SUPERADMIN_ORIGIN)
    vi.unstubAllGlobals()
  })

  it('valid token message from the configured superadmin origin: stored, auth refreshed, routed in', async () => {
    const session = fakeSession()
    vi.stubGlobal('opener', { postMessage: vi.fn() })

    render(<ImpersonationHandoff session={session} superadminOrigin={SUPERADMIN_ORIGIN} />)
    fireMessage(SUPERADMIN_ORIGIN, { type: 'impersonation:token', access_token: 'tok123' })

    await waitFor(() => expect(session.setTokens).toHaveBeenCalledWith({ access_token: 'tok123', refresh_token: '' }))
    expect(mockRefresh).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/')
    vi.unstubAllGlobals()
  })

  it('message from an untrusted origin: ignored', async () => {
    const session = fakeSession()
    vi.stubGlobal('opener', { postMessage: vi.fn() })

    render(<ImpersonationHandoff session={session} superadminOrigin={SUPERADMIN_ORIGIN} />)
    fireMessage('https://evil.example', { type: 'impersonation:token', access_token: 'stolen' })

    await new Promise((r) => setTimeout(r, 10))
    expect(session.setTokens).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('malformed message from the trusted origin: ignored', async () => {
    const session = fakeSession()
    vi.stubGlobal('opener', { postMessage: vi.fn() })

    render(<ImpersonationHandoff session={session} superadminOrigin={SUPERADMIN_ORIGIN} />)
    fireMessage(SUPERADMIN_ORIGIN, { type: 'something:else' })
    fireMessage(SUPERADMIN_ORIGIN, 'impersonation:ready')
    fireMessage(SUPERADMIN_ORIGIN, { type: 'impersonation:token', access_token: 42 })

    await new Promise((r) => setTimeout(r, 10))
    expect(session.setTokens).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
