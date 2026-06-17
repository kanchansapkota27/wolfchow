import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ApiClient, SessionStore } from '@wolfchow/api-client'
import { storeSession } from '@wolfchow/api-client'
import type { Permission, Role } from '@wolfchow/types'
import { decodeJwtClaims } from './jwt'
import { roleHome, windowNavigator, type AuthNavigator } from './navigator'

export interface AuthUser {
  id: string
  email: string | null
  role: Role | null
}

export interface AuthState {
  user: AuthUser | null
  role: Role | null
  restaurantId: string | null
  permissions: Permission[]
  isImpersonating: boolean
  impersonatedBy: string | null
  isSuspended: boolean
  isLoading: boolean
}

export interface AuthContextValue extends AuthState {
  hasPermission(permission: Permission): boolean
  signInWithPassword(email: string, password: string): Promise<void>
  signInWithDeviceToken(deviceToken: string): Promise<void>
  logout(): Promise<void>
  exitImpersonation(): void
  /** Re-derive state from the stored token (e.g. after a background refresh). */
  refresh(): void
  navigate(to: string): void
  getQueryParam(key: string): string | null
}

const EMPTY: AuthState = {
  user: null,
  role: null,
  restaurantId: null,
  permissions: [],
  isImpersonating: false,
  impersonatedBy: null,
  isSuspended: false,
  isLoading: true,
}

type DerivedState = Omit<AuthState, 'isSuspended' | 'isLoading'>

function deriveFromToken(token: string | null): DerivedState {
  const claims = token ? decodeJwtClaims(token) : null
  if (!claims) {
    return {
      user: null,
      role: null,
      restaurantId: null,
      permissions: [],
      isImpersonating: false,
      impersonatedBy: null,
    }
  }
  return {
    user: { id: claims.sub, email: claims.email, role: claims.role },
    role: claims.role,
    restaurantId: claims.restaurantId,
    permissions: claims.permissions,
    isImpersonating: claims.isImpersonating,
    impersonatedBy: claims.impersonatedBy,
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export interface AuthProviderProps {
  client: ApiClient
  session: SessionStore
  navigator?: AuthNavigator
  /**
   * Optional check for whether the signed-in account is suspended (the backend
   * returns `403 account_suspended` on tenant routes for suspended
   * restaurants). Called after a token is found; defaults to "not suspended".
   */
  probeSuspended?: () => Promise<boolean>
  children: ReactNode
}

/**
 * Provides auth state derived from the stored access-token JWT and the actions
 * to sign in, sign out, and exit impersonation. Token refresh itself is handled
 * by the api-client's single-flight 401 flow; `refresh()` here just re-derives
 * state from the (possibly rotated) stored token.
 */
export function AuthProvider({
  client,
  session,
  navigator: navigatorProp,
  probeSuspended,
  children,
}: AuthProviderProps) {
  const navigator = useMemo(() => navigatorProp ?? windowNavigator(), [navigatorProp])
  const [state, setState] = useState<AuthState>(EMPTY)

  const deriveAndSet = useCallback(async () => {
    const token = session.getAccessToken()
    const base = deriveFromToken(token)
    let suspended = false
    if (token && probeSuspended) {
      try {
        suspended = await probeSuspended()
      } catch {
        suspended = false
      }
    }
    setState({ ...base, isSuspended: suspended, isLoading: false })
  }, [session, probeSuspended])

  useEffect(() => {
    void deriveAndSet()
  }, [deriveAndSet])

  const hasPermission = useCallback(
    (permission: Permission) => state.permissions.includes(permission),
    [state.permissions],
  )

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const result = await client.auth.login(email, password)
      await deriveAndSet()
      navigator.navigate(roleHome(result.user.role))
    },
    [client, deriveAndSet, navigator],
  )

  const signInWithDeviceToken = useCallback(
    async (deviceToken: string) => {
      const result = await client.auth.device(deviceToken)
      storeSession(session, result)
      await deriveAndSet()
      navigator.navigate(roleHome(result.user.role))
    },
    [client, session, deriveAndSet, navigator],
  )

  const logout = useCallback(async () => {
    try {
      await client.auth.logout()
    } finally {
      session.clear()
      setState({ ...EMPTY, isLoading: false })
      navigator.navigate('/login')
    }
  }, [client, session, navigator])

  const exitImpersonation = useCallback(() => {
    session.clear()
    setState({ ...EMPTY, isLoading: false })
    navigator.navigate('/superadmin')
  }, [session, navigator])

  const refresh = useCallback(() => {
    void deriveAndSet()
  }, [deriveAndSet])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      hasPermission,
      signInWithPassword,
      signInWithDeviceToken,
      logout,
      exitImpersonation,
      refresh,
      navigate: navigator.navigate,
      getQueryParam: navigator.getQueryParam,
    }),
    [
      state,
      hasPermission,
      signInWithPassword,
      signInWithDeviceToken,
      logout,
      exitImpersonation,
      refresh,
      navigator,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>')
  return ctx
}

export interface RequireRoleProps {
  roles: Role[]
  children: ReactNode
  /** Rendered while loading or when the role is not permitted. */
  fallback?: ReactNode
}

/** Renders children only for the given roles; otherwise redirects to /login. */
export function RequireRole({ roles, children, fallback = null }: RequireRoleProps) {
  const { role, isLoading, navigate } = useAuth()
  const allowed = role !== null && roles.includes(role)

  useEffect(() => {
    if (!isLoading && !allowed) navigate('/login')
  }, [isLoading, allowed, navigate])

  if (isLoading || !allowed) return <>{fallback}</>
  return <>{children}</>
}
