/**
 * Minimal HS256 JWT helpers for Worker-minted tokens (e.g. tablet device
 * sessions) and for reading claims out of Supabase-issued access tokens.
 * Signed/verified with `SUPABASE_JWT_SECRET` so the same `jwtMiddleware`
 * (STORY-003) accepts them.
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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

function encodeSegment(value: object): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)))
}

/** Sign an HS256 JWT with the given secret. */
export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' })
  const body = encodeSegment(payload)
  const data = `${header}.${body}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return `${data}.${bytesToBase64Url(new Uint8Array(signature))}`
}

/**
 * Verify an HS256 compact JWS and return its claims, or null if the signature is
 * invalid, the algorithm is not HS256, the token is malformed, or it has expired.
 */
export async function verifyJwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  let alg: unknown
  try {
    alg = (JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerB64))) as Record<string, unknown>).alg
  } catch {
    return null
  }
  if (alg !== 'HS256') return null

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  )
  if (!valid) return null

  const claims = decodeJwtClaims(token)
  if (!claims) return null
  if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) return null
  return claims
}

/** Decode (without verifying) the claims of a compact JWS. Returns null if malformed. */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(parts[1] as string))
    const parsed: unknown = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
