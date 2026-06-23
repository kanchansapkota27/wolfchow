import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useNavigate, useSearchParams } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, type AuthNavigator } from '@wolfchow/auth'
import { createLocalStorageSession } from '@wolfchow/api-client'
import { ToastProvider } from '@wolfchow/ui'
import { ApiProvider, buildApiClient } from './lib/api'
import { createQueryClient } from './lib/queryClient'
import { App } from './App'
import './index.css'

/**
 * Bridges the auth layer to react-router: `RequireRole`/login redirects and
 * invite query reads go through the live router instead of `window.location`.
 * Must render inside <BrowserRouter> so the router hooks are available.
 */
function Providers() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const session = useMemo(() => createLocalStorageSession(), [])
  const authNavigator = useMemo<AuthNavigator>(
    () => ({
      // This app is served at its own origin root, so the shared role-home
      // target `/superadmin` maps to `/` here (post-login + impersonation exit).
      navigate: (to) => navigate(to === '/superadmin' ? '/' : to),
      getQueryParam: (key) => searchParams.get(key),
    }),
    [navigate, searchParams],
  )
  const client = useMemo(
    () => buildApiClient(session, () => navigate('/login')),
    [session, navigate],
  )
  const queryClient = useMemo(() => createQueryClient(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ApiProvider client={client}>
          <AuthProvider client={client} session={session} navigator={authNavigator}>
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
