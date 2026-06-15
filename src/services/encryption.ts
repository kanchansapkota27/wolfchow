/**
 * AES-256-GCM encryption for sensitive credentials (SMTP passwords, Stripe
 * secret keys). Uses the Web Crypto API natively available in Workers — no npm
 * dependency. A per-restaurant key is derived from the `MASTER_ENCRYPTION_KEY`
 * secret via HKDF-SHA256 with `restaurant_id` as the `info`, so each tenant's
 * blobs use a distinct key and a leak of one restaurant's blobs cannot be
 * decrypted with another's derived key.
 */

/** Base64-encoded encrypted blob. */
export interface EncryptedBlob {
  ciphertext: string
  iv: string
  salt: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export class EncryptionService {
  /** @param masterKeyBase64 the `MASTER_ENCRYPTION_KEY` secret (32 random bytes, base64). */
  constructor(private readonly masterKeyBase64: string) {}

  async encrypt(plaintext: string, restaurantId: string): Promise<EncryptedBlob> {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await this.deriveKey(restaurantId, salt)
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    )
    return {
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      iv: bytesToBase64(iv),
      salt: bytesToBase64(salt),
    }
  }

  async decrypt(blob: EncryptedBlob, restaurantId: string): Promise<string> {
    const key = await this.deriveKey(restaurantId, base64ToBytes(blob.salt))
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(blob.iv) },
      key,
      base64ToBytes(blob.ciphertext),
    )
    return new TextDecoder().decode(plaintext)
  }

  /** Encrypt to a single base64(JSON) string for storage in one text column. */
  async seal(plaintext: string, restaurantId: string): Promise<string> {
    const blob = await this.encrypt(plaintext, restaurantId)
    return btoa(JSON.stringify(blob))
  }

  /** Decrypt a string produced by {@link seal}. Throws on malformed or tampered input. */
  async open(sealed: string, restaurantId: string): Promise<string> {
    const parsed: unknown = JSON.parse(atob(sealed))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as EncryptedBlob).ciphertext !== 'string' ||
      typeof (parsed as EncryptedBlob).iv !== 'string' ||
      typeof (parsed as EncryptedBlob).salt !== 'string'
    ) {
      throw new Error('malformed encrypted blob')
    }
    return this.decrypt(parsed as EncryptedBlob, restaurantId)
  }

  private async deriveKey(restaurantId: string, salt: Uint8Array): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      base64ToBytes(this.masterKeyBase64),
      'HKDF',
      false,
      ['deriveKey'],
    )
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: new TextEncoder().encode(restaurantId),
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  }
}
