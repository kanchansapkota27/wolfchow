import { createApiClient, createApiContext, type ApiClient, type SessionStore } from '@wolfchow/api-client'

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8789'

export function buildApiClient(session: SessionStore, onSessionExpired?: () => void): ApiClient {
  return createApiClient({ baseUrl: API_URL, session, onSessionExpired })
}

export const { ApiProvider, useApi } = createApiContext()
