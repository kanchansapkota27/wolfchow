import type { AuthSession } from '@wolfchow/types'

export interface Tokens {
  access_token: string
  refresh_token: string
}

/**
 * Token storage abstraction. The browser implementation persists to
 * `localStorage`; tests and SSR use the in-memory one. The API client never
 * touches storage directly — it goes through this interface.
 */
export interface SessionStore {
  getAccessToken(): string | null
  getRefreshToken(): string | null
  setTokens(tokens: Tokens): void
  clear(): void
}

const ACCESS_KEY = 'wolfchow.access_token'
const REFRESH_KEY = 'wolfchow.refresh_token'

/** `localStorage`-backed session, safe to construct in non-browser contexts. */
export function createLocalStorageSession(): SessionStore {
  const hasStorage = typeof localStorage !== 'undefined'
  return {
    getAccessToken: () => (hasStorage ? localStorage.getItem(ACCESS_KEY) : null),
    getRefreshToken: () => (hasStorage ? localStorage.getItem(REFRESH_KEY) : null),
    setTokens: ({ access_token, refresh_token }) => {
      if (!hasStorage) return
      localStorage.setItem(ACCESS_KEY, access_token)
      localStorage.setItem(REFRESH_KEY, refresh_token)
    },
    clear: () => {
      if (!hasStorage) return
      localStorage.removeItem(ACCESS_KEY)
      localStorage.removeItem(REFRESH_KEY)
    },
  }
}

/** In-memory session for tests / server rendering. */
export function createMemorySession(initial?: Partial<Tokens>): SessionStore {
  let access = initial?.access_token ?? null
  let refresh = initial?.refresh_token ?? null
  return {
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    setTokens: ({ access_token, refresh_token }) => {
      access = access_token
      refresh = refresh_token
    },
    clear: () => {
      access = null
      refresh = null
    },
  }
}

/** Persist the tokens from a fresh login/refresh response. */
export function storeSession(store: SessionStore, session: AuthSession): void {
  store.setTokens({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
}
