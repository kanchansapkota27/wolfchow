import type { Permission, Role } from '@wolfchow/types'

/** Auth-relevant claims decoded from an access token (Supabase or Worker JWT). */
export interface DecodedClaims {
  sub: string
  email: string | null
  role: Role | null
  restaurantId: string | null
  permissions: Permission[]
  isImpersonating: boolean
  impersonatedBy: string | null
  exp: number | null
}

function base64UrlDecode(segment: string): string {
  const padded = segment + '='.repeat((4 - (segment.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Decode (not verify) the claims of a JWT access token. Signature verification
 * is the backend's job; the frontend only needs the claims to drive UI. Returns
 * null for a malformed token.
 *
 * Works for both Supabase tokens (claims injected by `custom_access_token_hook`)
 * and Worker-minted device/impersonation tokens, which carry the same fields.
 */
export function decodeJwtClaims(token: string): DecodedClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]!)) as Record<string, unknown>
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : '',
      email: typeof payload.email === 'string' ? payload.email : null,
      role: typeof payload.role === 'string' ? (payload.role as Role) : null,
      restaurantId: typeof payload.restaurant_id === 'string' ? payload.restaurant_id : null,
      permissions: Array.isArray(payload.permissions)
        ? payload.permissions.filter((p): p is Permission => typeof p === 'string')
        : [],
      isImpersonating: payload.imp === true,
      impersonatedBy: typeof payload.imp_by === 'string' ? payload.imp_by : null,
      exp: typeof payload.exp === 'number' ? payload.exp : null,
    }
  } catch {
    return null
  }
}
