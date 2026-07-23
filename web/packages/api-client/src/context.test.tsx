import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createApiClient, createMemorySession } from './index'
import { createApiContext } from './context'

describe('STORY-082 · createApiContext', () => {
  it('useApi returns the client passed to ApiProvider', () => {
    const { ApiProvider, useApi } = createApiContext()
    const session = createMemorySession({ access_token: 't', refresh_token: 'r' })
    const client = createApiClient({ baseUrl: 'https://api.test', session, fetch: vi.fn() })

    function Probe() {
      const api = useApi()
      return <span>{api === client ? 'same-client' : 'different-client'}</span>
    }

    render(
      <ApiProvider client={client}>
        <Probe />
      </ApiProvider>,
    )

    expect(screen.getByText('same-client')).toBeTruthy()
  })

  it('useApi throws outside ApiProvider', () => {
    const { useApi } = createApiContext()
    function Probe() {
      useApi()
      return null
    }
    expect(() => render(<Probe />)).toThrow('useApi must be used within <ApiProvider>')
  })

  it('two separate createApiContext() calls produce isolated contexts', () => {
    const ctxA = createApiContext()
    const ctxB = createApiContext()
    const client = createApiClient({ baseUrl: 'https://api.test', session: createMemorySession({ access_token: 't', refresh_token: 'r' }), fetch: vi.fn() })

    function ProbeB() {
      const api = ctxB.useApi()
      return <span>{String(!!api)}</span>
    }

    // ProbeB reads from ctxB's useApi while only ctxA.ApiProvider wraps it — must throw.
    expect(() =>
      render(
        <ctxA.ApiProvider client={client}>
          <ProbeB />
        </ctxA.ApiProvider>,
      ),
    ).toThrow('useApi must be used within <ApiProvider>')
  })
})
