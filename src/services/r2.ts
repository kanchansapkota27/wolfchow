/**
 * R2 presigned PUT URL generation using the S3-compatible API.
 *
 * CF Workers have no built-in presigning on R2Bucket; this implements a minimal
 * AWS Signature Version 4 presigned URL for the R2 S3-compatible endpoint.
 * Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 * from the Worker environment (set via `wrangler secret put`).
 */

import type { Env } from '../types'

/** Generate a URL-safe random ID (21 chars, alphanumeric). */
export function randomId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 21)
}

/**
 * Generate a presigned PUT URL for R2 (S3-compatible endpoint).
 * `expiresIn` is in seconds.
 */
export async function generatePresignedPutUrl(
  env: Env,
  key: string,
  expiresIn: number,
): Promise<string> {
  const now = new Date()
  const date = formatDate(now)
  const datetime = formatDatetime(now)
  const region = 'auto'
  const service = 's3'
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  const endpoint = `https://${host}/${env.R2_BUCKET_NAME}/${key}`

  const credential = `${env.R2_ACCESS_KEY_ID}/${date}/${region}/${service}/aws4_request`

  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': datetime,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  })
  // Sort params as required by SigV4
  queryParams.sort()

  const canonicalRequest = [
    'PUT',
    `/${env.R2_BUCKET_NAME}/${key}`,
    queryParams.toString(),
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const credentialScope = `${date}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    datetime,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = await deriveSigningKey(env.R2_SECRET_ACCESS_KEY, date, region, service)
  const signature = await hmacHex(signingKey, stringToSign)

  return `${endpoint}?${queryParams.toString()}&X-Amz-Signature=${signature}`
}

// ── AWS SigV4 helpers ──────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function formatDatetime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(hash))
}

async function hmacBytes(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message))
}

async function hmacHex(key: ArrayBuffer, message: string): Promise<string> {
  const sig = await hmacBytes(key, message)
  return bytesToHex(new Uint8Array(sig))
}

async function deriveSigningKey(
  secret: string,
  date: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const dateKey = await hmacBytes(new TextEncoder().encode(`AWS4${secret}`), date)
  const regionKey = await hmacBytes(dateKey, region)
  const serviceKey = await hmacBytes(regionKey, service)
  return hmacBytes(serviceKey, 'aws4_request')
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
