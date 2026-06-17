import type {
  AuthSession,
  Invite,
  Order,
  Plan,
  PlanInput,
  Restaurant,
} from '@wolfchow/types'
import { ApiError } from './errors'
import { storeSession, type SessionStore } from './session'

export interface ApiClientConfig {
  /** Backend origin, e.g. `https://api.wolfchow.com` (no trailing slash). */
  baseUrl: string
  /** Token storage. */
  session: SessionStore
  /** Override `fetch` (tests inject a fake; defaults to global `fetch`). */
  fetch?: typeof fetch
  /** Called after a refresh attempt fails and the session is cleared. */
  onSessionExpired?: () => void
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** JSON-serialized into the request body. */
  body?: unknown
  /** Appended as a query string; nullish values are skipped. */
  query?: Record<string, string | number | boolean | null | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Skip the `Authorization` header and the 401→refresh flow (e.g. login). */
  skipAuth?: boolean
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions['query'],
): string {
  let url = `${baseUrl}${path}`
  if (query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) params.set(key, String(value))
    }
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }
  return url
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Build an API client bound to a backend origin and a session store.
 *
 * `apiFetch` adds the bearer token, serializes JSON, and throws a typed
 * `ApiError` on any non-2xx. On a 401 it transparently attempts a single token
 * refresh (de-duplicated across concurrent requests) and retries the original
 * request once; if the refresh also fails it clears the session, invokes
 * `onSessionExpired`, and throws.
 */
export function createApiClient(config: ApiClientConfig) {
  const doFetch = config.fetch ?? fetch
  const { baseUrl, session } = config
  let refreshInFlight: Promise<boolean> | null = null

  async function refreshTokens(): Promise<boolean> {
    const refreshToken = session.getRefreshToken()
    if (!refreshToken) return false
    try {
      const res = await doFetch(buildUrl(baseUrl, '/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) return false
      const data = (await parseBody(res)) as AuthSession
      if (!data?.access_token || !data?.refresh_token) return false
      storeSession(session, data)
      return true
    } catch {
      return false
    }
  }

  /** Single-flight refresh: concurrent 401s share one refresh request. */
  function refreshOnce(): Promise<boolean> {
    if (!refreshInFlight) {
      refreshInFlight = refreshTokens().finally(() => {
        refreshInFlight = null
      })
    }
    return refreshInFlight
  }

  async function send(path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { ...options.headers }
    if (options.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
    if (!options.skipAuth) {
      const token = session.getAccessToken()
      if (token) headers['Authorization'] = `Bearer ${token}`
    }
    return doFetch(buildUrl(baseUrl, path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  }

  async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let res = await send(path, options)

    if (res.status === 401 && !options.skipAuth) {
      const refreshed = await refreshOnce()
      if (refreshed) {
        res = await send(path, options)
      } else {
        session.clear()
        config.onSessionExpired?.()
        throw new ApiError(401, await parseBody(res))
      }
    }

    const body = await parseBody(res)
    if (!res.ok) throw new ApiError(res.status, body)
    return body as T
  }

  // ── Named route functions (mirror the merged backend routes) ────────────────

  const auth = {
    login: (email: string, password: string) =>
      apiFetch<AuthSession>('/auth/login', {
        method: 'POST',
        body: { email, password },
        skipAuth: true,
      }).then((s) => {
        storeSession(session, s)
        return s
      }),
    logout: () => {
      const refresh_token = session.getRefreshToken()
      return apiFetch<void>('/auth/logout', {
        method: 'POST',
        body: { refresh_token },
      }).finally(() => session.clear())
    },
    device: (device_token: string) =>
      apiFetch<AuthSession>('/auth/device', {
        method: 'POST',
        body: { device_token },
        skipAuth: true,
      }),
    getInvite: (token: string) =>
      apiFetch<Invite>(`/auth/invite/${encodeURIComponent(token)}`, { skipAuth: true }),
  }

  const superadmin = {
    session: () => apiFetch<{ sub: string; role: string }>('/superadmin/session'),
    listPlans: () => apiFetch<{ plans: Plan[] }>('/superadmin/plans'),
    createPlan: (data: PlanInput) =>
      apiFetch<{ plan: Plan }>('/superadmin/plans', { method: 'POST', body: data }).then((r) => r.plan),
    updatePlan: (id: string, data: Partial<PlanInput>) =>
      apiFetch<{ plan: Plan }>(`/superadmin/plans/${id}`, { method: 'PATCH', body: data }).then((r) => r.plan),
    deletePlan: (id: string) =>
      apiFetch<void>(`/superadmin/plans/${id}`, { method: 'DELETE' }),
    listInvites: () => apiFetch<{ invites: Invite[] }>('/superadmin/invites'),
    createInvite: (data: { plan_id: string; commission_rate?: number; email?: string }) =>
      apiFetch<Invite>('/superadmin/invites', { method: 'POST', body: data }),
    revokeInvite: (id: string) =>
      apiFetch<void>(`/superadmin/invites/${id}`, { method: 'DELETE' }),
    listRestaurants: (query?: RequestOptions['query']) =>
      apiFetch<{ restaurants: Restaurant[]; page: number; total: number }>(
        '/superadmin/restaurants',
        { query },
      ),
    getRestaurant: (id: string) =>
      apiFetch<Restaurant>(`/superadmin/restaurants/${id}`),
    updateRestaurant: (id: string, data: Partial<Restaurant>) =>
      apiFetch<Restaurant>(`/superadmin/restaurants/${id}`, { method: 'PATCH', body: data }),
    suspendRestaurant: (id: string) =>
      apiFetch<Restaurant>(`/superadmin/restaurants/${id}/suspend`, { method: 'POST' }),
    reactivateRestaurant: (id: string) =>
      apiFetch<Restaurant>(`/superadmin/restaurants/${id}/reactivate`, { method: 'POST' }),
    impersonate: (id: string) =>
      apiFetch<{ access_token: string; expires_in: number }>(
        `/superadmin/restaurants/${id}/impersonate`,
        { method: 'POST' },
      ),
    getSmtpGlobal: () => apiFetch<Record<string, unknown>>('/superadmin/smtp/global'),
    putSmtpGlobal: (data: Record<string, unknown>) =>
      apiFetch<Record<string, unknown>>('/superadmin/smtp/global', { method: 'POST', body: data }),
    getBilling: () => apiFetch<{ summary: unknown[] }>('/superadmin/billing'),
    getRestaurantBilling: (id: string) =>
      apiFetch<{ months: unknown[] }>(`/superadmin/billing/${id}`),
    listAudit: (query?: RequestOptions['query']) =>
      apiFetch<{ entries: unknown[]; page: number; total: number }>('/superadmin/audit', { query }),
  }

  // Forward-looking named functions for routes landing in later slices. They are
  // typed against the shared contract today so apps can build against them.
  const menu = {
    getMenu: (slug: string) => apiFetch<{ categories: unknown[] }>(`/public/${slug}/menu`, { skipAuth: true }),
  }
  const orders = {
    acceptOrder: (orderId: string) =>
      apiFetch<Order>(`/tablet/orders/${orderId}/accept`, { method: 'POST' }),
    rejectOrder: (orderId: string, reason?: string) =>
      apiFetch<Order>(`/tablet/orders/${orderId}/reject`, { method: 'POST', body: { reason } }),
  }

  return { apiFetch, auth, superadmin, menu, orders }
}

export type ApiClient = ReturnType<typeof createApiClient>
