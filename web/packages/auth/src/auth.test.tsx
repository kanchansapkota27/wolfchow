import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createApiClient,
  createMemorySession,
  type SessionStore,
} from '@wolfchow/api-client'
import { AuthProvider, ImpersonationBanner, SuspendedPage, useAuth } from './index'
import type { AuthNavigator } from './navigator'

const BASE = 'https://api.test'

/** Build an unsigned JWT (header.payload.sig) with the given claims. */
function makeToken(claims: Record<string, unknown>): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}.sig`
}

function authBody(token: string, role: string) {
  return JSON.stringify({
    access_token: token,
    refresh_token: 'refresh-1',
    expires_in: 3600,
    user: { id: 'u1', email: 'user@test.local', role },
  })
}

function json(status: number, body: string) {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

/** A fetch that answers the auth routes used by the provider. */
function authFetch(token: string, role: string): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/auth/login')) return json(200, authBody(token, role))
    if (url.endsWith('/auth/device')) return json(200, authBody(token, role))
    if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 })
    return json(404, JSON.stringify({ error: 'not_found' }))
  }) as unknown as typeof fetch
}

function fakeNavigator(): AuthNavigator & { navigate: ReturnType<typeof vi.fn> } {
  return {
    navigate: vi.fn(),
    getQueryParam: () => null,
  }
}

interface Harness {
  session: SessionStore
  navigator: ReturnType<typeof fakeNavigator>
  wrapper: ({ children }: { children: ReactNode }) => React.JSX.Element
}

function makeHarness(opts: {
  token: string
  role: string
  initialToken?: string
  probeSuspended?: () => Promise<boolean>
  navigator?: AuthNavigator & { navigate: ReturnType<typeof vi.fn> }
}): Harness {
  const session = createMemorySession(
    opts.initialToken ? { access_token: opts.initialToken, refresh_token: 'r-seed' } : undefined,
  )
  const client = createApiClient({ baseUrl: BASE, session, fetch: authFetch(opts.token, opts.role) })
  const navigator = opts.navigator ?? fakeNavigator()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider
      client={client}
      session={session}
      navigator={navigator}
      probeSuspended={opts.probeSuspended}
    >
      {children}
    </AuthProvider>
  )
  return { session, navigator, wrapper }
}

describe('STORY-048 · auth flows', () => {
  it('superadmin login: redirected to /superadmin', async () => {
    const token = makeToken({ sub: 'u1', role: 'superadmin', restaurant_id: null, permissions: [] })
    const { wrapper, navigator, session } = makeHarness({ token, role: 'superadmin' })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await result.current.signInWithPassword('a@b.c', 'pw')
    })
    expect(navigator.navigate).toHaveBeenCalledWith('/superadmin')
    expect(session.getAccessToken()).toBe(token)
  })

  it('restaurant_owner login: redirected to /admin', async () => {
    const token = makeToken({ sub: 'u2', role: 'restaurant_owner', restaurant_id: 'r1', permissions: [] })
    const { wrapper, navigator } = makeHarness({ token, role: 'restaurant_owner' })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await result.current.signInWithPassword('a@b.c', 'pw')
    })
    expect(navigator.navigate).toHaveBeenCalledWith('/admin')
  })

  it('kitchen login: redirected to /tablet', async () => {
    const token = makeToken({ sub: 'u3', role: 'kitchen', restaurant_id: 'r1', permissions: ['orders:status'] })
    const { wrapper, navigator } = makeHarness({ token, role: 'kitchen' })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await result.current.signInWithPassword('a@b.c', 'pw')
    })
    expect(navigator.navigate).toHaveBeenCalledWith('/tablet')
  })

  it('device token login: token stored, redirected to /tablet', async () => {
    const token = makeToken({ sub: 'dev1', role: 'tablet_device', restaurant_id: 'r1', device_id: 'd1', permissions: [] })
    const { wrapper, navigator, session } = makeHarness({ token, role: 'tablet_device' })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await result.current.signInWithDeviceToken('device-token-xyz')
    })
    expect(session.getAccessToken()).toBe(token)
    expect(navigator.navigate).toHaveBeenCalledWith('/tablet')
  })

  it('URL with ?invite param: redirected to signup', async () => {
    const token = makeToken({ sub: 'u1', role: 'superadmin', restaurant_id: null, permissions: [] })
    const navigator: AuthNavigator & { navigate: ReturnType<typeof vi.fn> } = {
      navigate: vi.fn(),
      getQueryParam: (key) => (key === 'invite' ? 'inv_abc123' : null),
    }
    const { wrapper } = makeHarness({ token, role: 'superadmin', navigator })
    const { LoginPage } = await import('./LoginPage')
    render(<LoginPage />, { wrapper })
    await waitFor(() => {
      expect(navigator.navigate).toHaveBeenCalledWith('/signup?invite=inv_abc123')
    })
  })

  it('suspended account: suspension page shown', async () => {
    const token = makeToken({ sub: 'u2', role: 'restaurant_owner', restaurant_id: 'r1', permissions: [] })
    const { wrapper } = makeHarness({
      token,
      role: 'restaurant_owner',
      initialToken: token,
      probeSuspended: async () => true,
    })
    function Gate() {
      const { isLoading, isSuspended } = useAuth()
      if (isLoading) return <p>loading</p>
      return isSuspended ? <SuspendedPage /> : <p>ok</p>
    }
    render(<Gate />, { wrapper })
    expect(await screen.findByText(/your account has been suspended/i)).toBeInTheDocument()
  })

  it('impersonating: banner visible with exit button', async () => {
    const token = makeToken({
      sub: 'r-owner',
      role: 'restaurant_owner',
      restaurant_id: 'r1',
      permissions: [],
      imp: true,
      imp_by: 'admin-1',
    })
    const { wrapper, navigator, session } = makeHarness({
      token,
      role: 'restaurant_owner',
      initialToken: token,
    })
    render(<ImpersonationBanner restaurantName="Joe's Diner" />, { wrapper })

    const exit = await screen.findByRole('button', { name: /exit/i })
    expect(screen.getByText(/viewing as joe's diner/i)).toBeInTheDocument()

    await userEvent.click(exit)
    expect(session.getAccessToken()).toBeNull()
    expect(navigator.navigate).toHaveBeenCalledWith('/superadmin')
  })

  it('logout: session cleared, redirected to login', async () => {
    const token = makeToken({ sub: 'u1', role: 'superadmin', restaurant_id: null, permissions: [] })
    const { wrapper, navigator, session } = makeHarness({ token, role: 'superadmin', initialToken: token })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.logout()
    })
    expect(session.getAccessToken()).toBeNull()
    expect(navigator.navigate).toHaveBeenCalledWith('/login')
  })

  it('session persists on mount from localStorage (memory store)', async () => {
    const token = makeToken({
      sub: 'u9',
      email: 'persist@test.local',
      role: 'restaurant_owner',
      restaurant_id: 'r9',
      permissions: ['inventory:write'],
    })
    const { wrapper } = makeHarness({ token, role: 'restaurant_owner', initialToken: token })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.role).toBe('restaurant_owner')
    expect(result.current.restaurantId).toBe('r9')
    expect(result.current.user?.id).toBe('u9')
    expect(result.current.hasPermission('inventory:write')).toBe(true)
  })

  it('LoginPage methods=[staff]: no method tabs, staff form shown', async () => {
    const token = makeToken({ sub: 'u1', role: 'superadmin', restaurant_id: null, permissions: [] })
    const { wrapper } = makeHarness({ token, role: 'superadmin' })
    const { LoginPage } = await import('./LoginPage')
    render(<LoginPage methods={['staff']} />, { wrapper })

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('LoginPage default: both method tabs shown', async () => {
    const token = makeToken({ sub: 'u1', role: 'superadmin', restaurant_id: null, permissions: [] })
    const { wrapper } = makeHarness({ token, role: 'superadmin' })
    const { LoginPage } = await import('./LoginPage')
    render(<LoginPage />, { wrapper })

    expect(screen.getByRole('tab', { name: /staff login/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /device token/i })).toBeInTheDocument()
  })
})
