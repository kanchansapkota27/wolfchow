import { describe, expect, it } from 'vitest'
import { EncryptionService } from './encryption'

// 32 random bytes, base64 — stands in for the MASTER_ENCRYPTION_KEY secret.
const MASTER = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
const svc = new EncryptionService(MASTER)

// Flip the first byte of a base64 payload, preserving valid base64.
function tamperBase64(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  bytes[0] = (bytes[0] ?? 0) ^ 0xff
  let out = ''
  for (const b of bytes) out += String.fromCharCode(b)
  return btoa(out)
}

describe('STORY-042 · encryption service', () => {
  it('encrypt then decrypt: plaintext preserved', async () => {
    const blob = await svc.encrypt('sk_live_secret', 'rest-1')
    expect(await svc.decrypt(blob, 'rest-1')).toBe('sk_live_secret')
  })

  it('different restaurant_ids: different ciphertext and not cross-decryptable', async () => {
    const a = await svc.encrypt('same-plaintext', 'rest-a')
    const b = await svc.encrypt('same-plaintext', 'rest-b')
    expect(a.ciphertext).not.toBe(b.ciphertext)
    // A blob encrypted for rest-a cannot be decrypted under rest-b's derived key.
    await expect(svc.decrypt(a, 'rest-b')).rejects.toThrow()
  })

  it('tampered ciphertext: decrypt throws', async () => {
    const blob = await svc.encrypt('secret', 'rest-1')
    await expect(
      svc.decrypt({ ...blob, ciphertext: tamperBase64(blob.ciphertext) }, 'rest-1'),
    ).rejects.toThrow()
  })

  it('tampered salt: decrypt throws', async () => {
    const blob = await svc.encrypt('secret', 'rest-1')
    await expect(
      svc.decrypt({ ...blob, salt: tamperBase64(blob.salt) }, 'rest-1'),
    ).rejects.toThrow()
  })

  it('two encryptions of same input: different iv and ciphertext', async () => {
    const a = await svc.encrypt('secret', 'rest-1')
    const b = await svc.encrypt('secret', 'rest-1')
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('seal then open: single-string blob round-trips', async () => {
    const sealed = await svc.seal('smtp-password', 'rest-1')
    expect(await svc.open(sealed, 'rest-1')).toBe('smtp-password')
  })
})
