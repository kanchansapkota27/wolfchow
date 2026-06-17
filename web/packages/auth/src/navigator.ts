import type { Role } from '@wolfchow/types'

/**
 * Router-agnostic navigation surface. Apps wire this to their router (e.g.
 * react-router) in later stories; the default uses `window.location`. Tests
 * inject a fake to assert redirects.
 */
export interface AuthNavigator {
  navigate(to: string): void
  getQueryParam(key: string): string | null
}

/** The landing route for a role after login. */
export function roleHome(role: Role | null): string {
  switch (role) {
    case 'superadmin':
    case 'support':
      return '/superadmin'
    case 'restaurant_owner':
      return '/admin'
    case 'kitchen':
    case 'tablet_device':
      return '/tablet'
    default:
      return '/login'
  }
}

/** Default browser navigator backed by `window.location`. */
export function windowNavigator(): AuthNavigator {
  return {
    navigate: (to) => {
      if (typeof window !== 'undefined') window.location.assign(to)
    },
    getQueryParam: (key) => {
      if (typeof window === 'undefined') return null
      return new URLSearchParams(window.location.search).get(key)
    },
  }
}
