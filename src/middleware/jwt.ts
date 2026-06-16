import { createMiddleware } from 'hono/factory'
import type { AuthMethodReference, HonoEnv, JwtClaims } from '../types'

/**
 * Verifies the Supabase JWT on the `Authorization: Bearer <token>` header and
 * attaches the typed claims to `c.get('jwt')`. HS256 is verified with the
 * shared `SUPABASE_JWT_SECRET` via the Web Crypto API — no database query.
 *
 * Error responses follow the standard `{ error, code? }` shape:
 *   - missing/!Bearer header → 401 { error: 'unauthorized' }
 *   - bad signature / malformed / wrong alg → 401 { error: 'token_invalid' }
 *   - valid signature but past `exp` → 401 { error: 'token_expired' }
 */
export const jwtMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const token = header.slice('Bearer '.length).trim()
  const verified = await verifyHs256(token, c.env.SUPABASE_JWT_SECRET)
  if (!verified.valid) {
    return c.json({ error: 'token_invalid' }, 401)
  }

  const payload = verified.payload
  const exp = payload.exp
  if (typeof exp === 'number' && exp * 1000 <= Date.now()) {
    return c.json({ error: 'token_expired' }, 401)
  }

  c.set('jwt', toClaims(payload))
  await next()
})

/** Narrow an unknown JWT payload into typed, defaulted claims. */
function toClaims(payload: Record<string, unknown>): JwtClaims {
  return {
    sub: typeof payload.sub === 'string' ? payload.sub : '',
    role: typeof payload.role === 'string' ? payload.role : '',
    restaurant_id: typeof payload.restaurant_id === 'string' ? payload.restaurant_id : null,
    permissions: Array.isArray(payload.permissions)
      ? payload.permissions.filter((p): p is string => typeof p === 'string')
      : [],
    device_id: typeof payload.device_id === 'string' ? payload.device_id : null,
    imp: payload.imp === true,
    imp_by: typeof payload.imp_by === 'string' ? payload.imp_by : null,
    amr: toAmr(payload.amr),
  }
}

/**
 * Narrow the Supabase `amr` claim into typed method references. Supabase emits
 * an array of `{ method, timestamp }`; anything else (absent/malformed) yields
 * an empty list, which `requireMFA` treats as "no MFA".
 */
function toAmr(value: unknown): AuthMethodReference[] {
  if (!Array.isArray(value)) return []
  const refs: AuthMethodReference[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const method = (entry as Record<string, unknown>).method
    if (typeof method !== 'string') continue
    const timestamp = (entry as Record<string, unknown>).timestamp
    refs.push({ method, timestamp: typeof timestamp === 'number' ? timestamp : null })
  }
  return refs
}

interface VerifyResult {
  valid: boolean
  payload: Record<string, unknown>
}

/** Verify a compact JWS (HS256 only) and return its decoded payload. */
async function verifyHs256(token: string, secret: string): Promise<VerifyResult> {
  const invalid: VerifyResult = { valid: false, payload: {} }
  const parts = token.split('.')
  if (parts.length !== 3) return invalid
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  let alg: unknown
  try {
    alg = (decodeJson(headerB64) as Record<string, unknown>).alg
  } catch {
    return invalid
  }
  if (alg !== 'HS256') return invalid

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signatureValid = await crypto.subtle.verify('HMAC', key, base64UrlToBytes(signatureB64), data)
  if (!signatureValid) return invalid

  try {
    const payload = decodeJson(payloadB64)
    if (typeof payload !== 'object' || payload === null) return invalid
    return { valid: true, payload: payload as Record<string, unknown> }
  } catch {
    return invalid
  }
}

function decodeJson(b64url: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(b64url)))
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64.length % 4 === 0 ? b64 : b64 + '='.repeat(4 - (b64.length % 4))
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
