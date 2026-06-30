import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { createApiClient, type ApiClient, type SessionStore } from '@wolfchow/api-client'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8789'

const ApiContext = createContext<ApiClient | null>(null)

export function buildApiClient(session: SessionStore, onSessionExpired?: () => void): ApiClient {
  return createApiClient({ baseUrl: API_URL, session, onSessionExpired })
}

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext)
  if (!client) throw new Error('useApi must be used within <ApiProvider>')
  return client
}
