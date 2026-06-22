import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@wolfchow/ui'
import type { ApiClient } from '@wolfchow/api-client'
import { ApiProvider } from './api'

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function renderWithQuery(ui: ReactElement, client: ApiClient): RenderResult {
  const queryClient = makeTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ApiProvider client={client}>{ui}</ApiProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
