import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient, createMemorySession } from './index'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const BASE = 'https://api.test'

describe('STORY-047 · api-client', () => {
  it('adds the bearer token and returns the typed body', async () => {
    const session = createMemorySession({ access_token: 'tok-1', refresh_token: 'r-1' })
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(200, { id: 'p1', name: 'Starter' }),
    )
    const client = createApiClient({ baseUrl: BASE, session, fetch: fetchMock })

    const result = await client.apiFetch<{ id: string }>('/superadmin/plans/p1')

    expect(result.id).toBe('p1')
    const init = fetchMock.mock.calls[0]![1]
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-1')
  })

  it('401 triggers refresh, retries request with the new token', async () => {
    const session = createMemorySession({ access_token: 'stale', refresh_token: 'r-1' })
    const calls: Array<{ url: string; auth?: string }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization']
      calls.push({ url, auth })
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(200, {
          access_token: 'fresh',
          refresh_token: 'r-2',
          expires_in: 3600,
          user: { id: 'u1', email: 'a@b.c', role: 'superadmin' },
        })
      }
      // First protected call (stale token) → 401; retry (fresh token) → 200.
      return auth === 'Bearer fresh'
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { error: 'token_expired' })
    })
    const client = createApiClient({ baseUrl: BASE, session, fetch: fetchMock })

    const result = await client.apiFetch<{ ok: boolean }>('/superadmin/billing')

    expect(result.ok).toBe(true)
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/superadmin/billing`,
      `${BASE}/auth/refresh`,
      `${BASE}/superadmin/billing`,
    ])
    expect(session.getAccessToken()).toBe('fresh')
    expect(session.getRefreshToken()).toBe('r-2')
  })

  it('refresh fails → session cleared, onSessionExpired called, ApiError thrown', async () => {
    const session = createMemorySession({ access_token: 'stale', refresh_token: 'r-1' })
    const onSessionExpired = vi.fn()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) return jsonResponse(401, { error: 'invalid_grant' })
      return jsonResponse(401, { error: 'token_expired' })
    })
    const client = createApiClient({ baseUrl: BASE, session, fetch: fetchMock, onSessionExpired })

    await expect(client.apiFetch('/superadmin/billing')).rejects.toBeInstanceOf(ApiError)
    expect(session.getAccessToken()).toBeNull()
    expect(session.getRefreshToken()).toBeNull()
    expect(onSessionExpired).toHaveBeenCalledOnce()
  })

  it('non-2xx throws ApiError carrying status and code', async () => {
    const session = createMemorySession({ access_token: 'tok', refresh_token: 'r' })
    const fetchMock = vi.fn(async () => jsonResponse(409, { error: 'plan_in_use' }))
    const client = createApiClient({ baseUrl: BASE, session, fetch: fetchMock })

    await expect(client.apiFetch('/superadmin/plans/p1', { method: 'DELETE' })).rejects.toMatchObject(
      { status: 409, code: 'plan_in_use' },
    )
  })

  it('concurrent 401s share a single refresh', async () => {
    const session = createMemorySession({ access_token: 'stale', refresh_token: 'r-1' })
    let refreshCount = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization']
      if (url.endsWith('/auth/refresh')) {
        refreshCount++
        return jsonResponse(200, {
          access_token: 'fresh',
          refresh_token: 'r-2',
          expires_in: 3600,
          user: { id: 'u1', email: 'a@b.c', role: 'superadmin' },
        })
      }
      return auth === 'Bearer fresh'
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { error: 'token_expired' })
    })
    const client = createApiClient({ baseUrl: BASE, session, fetch: fetchMock })

    await Promise.all([
      client.apiFetch('/superadmin/billing'),
      client.apiFetch('/superadmin/plans'),
    ])

    expect(refreshCount).toBe(1)
  })

  // ── uploadFile ────────────────────────────────────────────────────────────

  interface FakeXhrCall {
    method: string
    url: string
    headers: Record<string, string>
    body: unknown
  }

  function stubXhr(status: number): { calls: FakeXhrCall[] } {
    const calls: FakeXhrCall[] = []
    class FakeXhr {
      upload = { onprogress: null as ((ev: { lengthComputable: boolean; loaded: number; total: number }) => void) | null }
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      status = status
      private call: FakeXhrCall = { method: '', url: '', headers: {}, body: undefined }
      open(method: string, url: string) { this.call.method = method; this.call.url = url }
      setRequestHeader(name: string, value: string) { this.call.headers[name] = value }
      send(body: unknown) {
        this.call.body = body
        calls.push(this.call)
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
        this.onload?.()
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    return { calls }
  }

  it('uploadFile: same-origin upload URL (local-dev PUT /r2/:key) attaches the access token', async () => {
    const session = createMemorySession({ access_token: 'tok-upload', refresh_token: 'r-1' })
    const client = createApiClient({ baseUrl: BASE, session, fetch: vi.fn() })
    const { calls } = stubXhr(204)
    const file = new File(['x'], 'logo.webp', { type: 'image/webp' })

    await client.uploadFile(`${BASE}/r2/rest-1/logo/abc.webp`, file)

    expect(calls[0]?.method).toBe('PUT')
    expect(calls[0]?.headers['Authorization']).toBe('Bearer tok-upload')
    expect(calls[0]?.headers['Content-Type']).toBe('image/webp')
    vi.unstubAllGlobals()
  })

  it('uploadFile: cross-origin upload URL (production presigned R2 URL) never sends the access token', async () => {
    const session = createMemorySession({ access_token: 'tok-upload', refresh_token: 'r-1' })
    const client = createApiClient({ baseUrl: BASE, session, fetch: vi.fn() })
    const { calls } = stubXhr(204)
    const file = new File(['x'], 'logo.webp', { type: 'image/webp' })

    await client.uploadFile('https://acct.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=x', file)

    expect(calls[0]?.headers['Authorization']).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('uploadFile: no session token → no Authorization header sent (does not crash)', async () => {
    const session = createMemorySession()
    const client = createApiClient({ baseUrl: BASE, session, fetch: vi.fn() })
    const { calls } = stubXhr(204)
    const file = new File(['x'], 'logo.webp', { type: 'image/webp' })

    await client.uploadFile(`${BASE}/r2/rest-1/logo/abc.webp`, file)

    expect(calls[0]?.headers['Authorization']).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('uploadFile: reports progress and rejects on a non-2xx status', async () => {
    const session = createMemorySession({ access_token: 'tok-upload', refresh_token: 'r-1' })
    const client = createApiClient({ baseUrl: BASE, session, fetch: vi.fn() })
    stubXhr(500)
    const file = new File(['x'], 'logo.webp', { type: 'image/webp' })
    const progress: number[] = []

    await expect(client.uploadFile(`${BASE}/r2/rest-1/logo/abc.webp`, file, (p) => progress.push(p))).rejects.toThrow()
    expect(progress).toEqual([50])
    vi.unstubAllGlobals()
  })
})
