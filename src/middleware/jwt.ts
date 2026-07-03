import { createMiddleware } from 'hono/factory'
import type { AuthMethodReference, HonoEnv, JwtClaims } from '../types'

/**
 * Verifies the Supabase JWT on the `Authorization: Bearer <token>` header and
 * attaches the typed claims to `c.get('jwt')`.
 *
 * Supports both signing algorithms Supabase uses:
 *   - HS256 (older projects): symmetric HMAC, verified against SUPABASE_JWT_SECRET
 *   - ES256 (current default): asymmetric ECDSA, verified against the project's
 *     JWKS fetched from {SUPABASE_URL}/auth/v1/.well-known/jwks.json
 *
 * The algorithm is derived solely from environment config (presence of
 * SUPABASE_JWT_SECRET → HS256; absent → ES256). The token header's `alg` field
 * is never used to select the verification path, preventing algorithm-confusion
 * attacks if a future code path forgot to pin the expected algorithm.
 *
 * JWKS are cached in the Worker isolate for 5 minutes so the key endpoint is
 * not hit on every request.
 *
 * Error responses follow the standard `{ error, code? }` shape:
 *   - missing/!Bearer header       → 401 { error: 'unauthorized' }
 *   - bad signature / malformed    → 401 { error: 'token_invalid' }
 *   - valid signature but past exp → 401 { error: 'token_expired' }
 */
export const jwtMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const token = header.slice('Bearer '.length).trim()

  const parts = token.split('.')
  if (parts.length !== 3) return c.json({ error: 'token_invalid' }, 401)

  // Extract kid from the token header for JWKS key selection (ES256 path only).
  // We do NOT read `alg` from the header — the algorithm is determined by env config.
  let kid: string | undefined
  try {
    const h = decodeJson(parts[0] as string) as Record<string, unknown>
    kid = typeof h.kid === 'string' ? h.kid : undefined
  } catch {
    return c.json({ error: 'token_invalid' }, 401)
  }

  // Algorithm pinned to env config: SUPABASE_JWT_SECRET present → HS256, absent → ES256.
  let verified: VerifyResult
  if (c.env.SUPABASE_JWT_SECRET) {
    verified = await verifyHs256(token, c.env.SUPABASE_JWT_SECRET)
  } else {
    verified = await verifyEs256(token, kid, c.env.SUPABASE_URL)
  }

  if (!verified.valid) {
    return c.json({ error: 'token_invalid' }, 401)
  }

  const payload = verified.payload
  const exp = payload.exp
  if (typeof exp === 'number' && exp * 1000 <= Date.now()) {
    return c.json({ error: 'token_expired' }, 401)
  }

  const claims = toClaims(payload)

  // For tablet device tokens, check the KV index is still present (revocation check).
  // DELETE /admin/devices/:id removes device_index:{restaurantId}:{deviceId} from KV,
  // so a revoked device's JWT is rejected within the KV propagation delay (~1s).
  if (claims.role === 'tablet_device' && claims.device_id && claims.restaurant_id) {
    const indexKey = `device_index:${claims.restaurant_id}:${claims.device_id}`
    const tokenRef = await c.env.DEVICE_TOKENS.get(indexKey)
    if (!tokenRef) {
      return c.json({ error: 'device_revoked' }, 401)
    }
  }

  c.set('jwt', claims)
  await next()
})

// ── JWKS cache ────────────────────────────────────────────────────────────────

interface JwkEntry {
  kid?: string
  kty?: string
  crv?: string
  x?: string
  y?: string
  use?: string
  alg?: string
  n?: string
  e?: string
}

interface JwksCache {
  keys: JwkEntry[]
  fetchedAt: number
}

/** Module-level cache — one entry per Supabase URL, refreshed every 5 minutes. */
const jwksStore = new Map<string, JwksCache>()
const JWKS_TTL_MS = 5 * 60 * 1000

async function getJwks(supabaseUrl: string): Promise<JwkEntry[]> {
  const cached = jwksStore.get(supabaseUrl)
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys

  const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
  if (!res.ok) throw new Error(`JWKS endpoint returned ${res.status}`)
  const body = (await res.json()) as { keys?: unknown }
  const keys = Array.isArray(body.keys) ? (body.keys as JwkEntry[]) : []
  jwksStore.set(supabaseUrl, { keys, fetchedAt: Date.now() })
  return keys
}

// ── Signature verification ────────────────────────────────────────────────────

interface VerifyResult {
  valid: boolean
  payload: Record<string, unknown>
}

const INVALID: VerifyResult = { valid: false, payload: {} }

/** HS256: HMAC-SHA256 using the shared SUPABASE_JWT_SECRET. */
async function verifyHs256(token: string, secret: string): Promise<VerifyResult> {
  const parts = token.split('.')
  if (parts.length !== 3) return INVALID
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  let alg: unknown
  try {
    alg = (decodeJson(headerB64) as Record<string, unknown>).alg
  } catch {
    return INVALID
  }
  if (alg !== 'HS256') return INVALID

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const ok = await crypto.subtle.verify('HMAC', key, base64UrlToBytes(signatureB64), data)
  if (!ok) return INVALID

  try {
    const payload = decodeJson(payloadB64)
    if (typeof payload !== 'object' || payload === null) return INVALID
    return { valid: true, payload: payload as Record<string, unknown> }
  } catch {
    return INVALID
  }
}

/**
 * ES256: ECDSA-P256-SHA256, key from the project JWKS.
 * JWT ECDSA signatures are in IEEE P1363 format (R || S, 64 bytes for P-256),
 * which is exactly what Web Crypto's ECDSA verify expects — no DER conversion.
 */
async function verifyEs256(
  token: string,
  kid: string | undefined,
  supabaseUrl: string,
): Promise<VerifyResult> {
  const parts = token.split('.')
  if (parts.length !== 3) return INVALID
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  let keys: JwkEntry[]
  try {
    keys = await getJwks(supabaseUrl)
  } catch {
    return INVALID
  }

  // Prefer the key whose kid matches the token header; fall back to the first EC P-256 key.
  const jwk = kid
    ? (keys.find((k) => k.kid === kid) ?? keys.find((k) => k.kty === 'EC' && k.crv === 'P-256'))
    : keys.find((k) => k.kty === 'EC' && k.crv === 'P-256')

  if (!jwk) return INVALID

  let cryptoKey: CryptoKey
  try {
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
  } catch {
    return INVALID
  }

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  let ok: boolean
  try {
    ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      base64UrlToBytes(signatureB64),
      data,
    )
  } catch {
    return INVALID
  }

  if (!ok) return INVALID

  try {
    const payload = decodeJson(payloadB64)
    if (typeof payload !== 'object' || payload === null) return INVALID
    return { valid: true, payload: payload as Record<string, unknown> }
  } catch {
    return INVALID
  }
}

// ── Claims narrowing ──────────────────────────────────────────────────────────

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
 * an array of `{ method, timestamp }`; anything else yields an empty list,
 * which `requireMFA` treats as "no MFA".
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
