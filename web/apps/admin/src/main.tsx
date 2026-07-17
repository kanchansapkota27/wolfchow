import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useNavigate, useSearchParams } from 'react-router'
import { AuthProvider, type AuthNavigator } from '@wolfchow/auth'
import { createLocalStorageSession } from '@wolfchow/api-client'
import { ToastProvider } from '@wolfchow/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiProvider, buildApiClient } from './lib/api'
import { App } from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

function Providers() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const session = useMemo(() => createLocalStorageSession(), [])
  const authNavigator = useMemo<AuthNavigator>(
    () => ({
      navigate: (to) => navigate(to === '/admin' ? '/' : to),
      getQueryParam: (key) => searchParams.get(key),
    }),
    [navigate, searchParams],
  )
  const client = useMemo(
    () => buildApiClient(session, () => navigate('/login')),
    [session, navigate],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ApiProvider client={client}>
          <AuthProvider
            client={client}
            session={session}
            navigator={authNavigator}
            probeSuspended={async () => {
              const restaurant = await client.admin.getRestaurant()
              return restaurant.active === false
            }}
          >
            <App />
          </AuthProvider>
        </ApiProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Providers />
    </BrowserRouter>
  </StrictMode>,
)
