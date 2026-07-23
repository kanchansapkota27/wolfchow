import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { ApiClient } from './client'

export interface ApiContextValue {
  ApiProvider: (props: { client: ApiClient; children: ReactNode }) => ReturnType<typeof ApiProviderImpl>
  useApi: () => ApiClient
}

function ApiProviderImpl(
  Context: React.Context<ApiClient | null>,
  props: { client: ApiClient; children: ReactNode },
) {
  return <Context.Provider value={props.client}>{props.children}</Context.Provider>
}

/**
 * Each app instantiates its own context (rather than sharing one module-level
 * context across apps) so admin/tablet/superadmin's ApiProvider/useApi pairs
 * stay independent — matching that these are 3 separately deployed apps.
 */
export function createApiContext(): ApiContextValue {
  const Context = createContext<ApiClient | null>(null)

  function ApiProvider(props: { client: ApiClient; children: ReactNode }) {
    return ApiProviderImpl(Context, props)
  }

  function useApi(): ApiClient {
    const client = useContext(Context)
    if (!client) throw new Error('useApi must be used within <ApiProvider>')
    return client
  }

  return { ApiProvider, useApi }
}
