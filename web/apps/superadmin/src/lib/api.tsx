import { createApiClient, createApiContext, type ApiClient, type SessionStore } from '@wolfchow/api-client'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8789'

/** Origin of the (independently-deployed) restaurant admin app, for impersonation. */
export const ADMIN_URL =
  (import.meta.env.VITE_ADMIN_URL as string | undefined) ?? 'http://localhost:5174'

export function buildApiClient(session: SessionStore, onSessionExpired?: () => void): ApiClient {
  return createApiClient({ baseUrl: API_URL, session, onSessionExpired })
}

export const { ApiProvider, useApi } = createApiContext()
