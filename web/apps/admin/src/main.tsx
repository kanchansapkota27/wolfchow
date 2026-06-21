import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useNavigate, useSearchParams } from 'react-router'
import { AuthProvider, type AuthNavigator } from '@wolfchow/auth'
import { createLocalStorageSession } from '@wolfchow/api-client'
import { ToastProvider } from '@wolfchow/ui'
import { ApiProvider, buildApiClient } from './lib/api'
import { App } from './App'
import './index.css'

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
    <ToastProvider>
      <ApiProvider client={client}>
        <AuthProvider client={client} session={session} navigator={authNavigator}>
          <App />
        </AuthProvider>
      </ApiProvider>
    </ToastProvider>
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
