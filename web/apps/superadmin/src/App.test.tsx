import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, type AuthNavigator } from '@wolfchow/auth'
import { createApiClient, createMemorySession } from '@wolfchow/api-client'
import { ApiProvider } from './lib/api'
import { makeTestQueryClient } from './lib/test-utils'
import { App } from './App'

function makeToken(claims: Record<string, unknown>): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}.sig`
}

describe('STORY-049 · App role guard', () => {
  it('non-superadmin visiting the panel: redirected to login', async () => {
    const token = makeToken({ sub: 'u2', role: 'restaurant_owner', restaurant_id: 'r1', permissions: [] })
    const session = createMemorySession({ access_token: token, refresh_token: 'r' })
    const navigate = vi.fn()
    const navigator: AuthNavigator = { navigate, getQueryParam: () => null }
    const client = createApiClient({ baseUrl: 'http://api.test', session, fetch: vi.fn() })

    render(
      <QueryClientProvider client={makeTestQueryClient()}>
        <MemoryRouter>
          <ApiProvider client={client}>
            <AuthProvider client={client} session={session} navigator={navigator}>
              <App />
            </AuthProvider>
          </ApiProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'))
  })

  it('/login renders the public login page (no role required)', async () => {
    const session = createMemorySession()
    const navigator: AuthNavigator = { navigate: vi.fn(), getQueryParam: () => null }
    const client = createApiClient({ baseUrl: 'http://api.test', session, fetch: vi.fn() })

    render(
      <QueryClientProvider client={makeTestQueryClient()}>
        <MemoryRouter initialEntries={['/login']}>
          <ApiProvider client={client}>
            <AuthProvider client={client} session={session} navigator={navigator}>
              <App />
            </AuthProvider>
          </ApiProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /device token/i })).not.toBeInTheDocument()
  })
})
