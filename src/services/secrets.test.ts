import { describe, expect, it, vi } from 'vitest'
import { SecretsService, getStripeClient } from './secrets'
import type { Env } from '../types'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockRpc = vi.fn()
const mockSchema = vi.fn()
const mockFrom = vi.fn()

vi.mock('./supabase', () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    schema: mockSchema,
    from: mockFrom,
  }),
}))

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
} as unknown as Env

function schemaChain(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null }
  const inner = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
  return inner
}

function fromChain(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
  }
}

describe('STORY-042 · SecretsService', () => {
  describe('put', () => {
    it('returns vault id on success', async () => {
      mockRpc.mockResolvedValue({ data: 'vault-uuid-1', error: null })
      const svc = new SecretsService(env)
      const id = await svc.put('smtp:rest-1', 'plaintextpass')
      expect(id).toBe('vault-uuid-1')
      expect(mockRpc).toHaveBeenCalledWith('vault_create_secret', {
        p_secret: 'plaintextpass',
        p_name: 'smtp:rest-1',
      })
    })

    it('throws on RPC error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
      const svc = new SecretsService(env)
      await expect(svc.put('smtp:rest-1', 'pass')).rejects.toThrow('vault.put failed: rpc failed')
    })

    it('throws when no id returned', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const svc = new SecretsService(env)
      await expect(svc.put('smtp:rest-1', 'pass')).rejects.toThrow('vault.put failed')
    })
  })

  describe('rotate', () => {
    it('calls vault_update_secret with correct params', async () => {
      mockRpc.mockResolvedValue({ error: null })
      const svc = new SecretsService(env)
      await svc.rotate('vault-uuid-1', 'newpass')
      expect(mockRpc).toHaveBeenCalledWith('vault_update_secret', {
        p_id: 'vault-uuid-1',
        p_secret: 'newpass',
      })
    })

    it('throws on error', async () => {
      mockRpc.mockResolvedValue({ error: { message: 'not found' } })
      const svc = new SecretsService(env)
      await expect(svc.rotate('vault-uuid-1', 'newpass')).rejects.toThrow('vault.rotate failed: not found')
    })
  })

  describe('get', () => {
    it('returns decrypted secret', async () => {
      mockRpc.mockResolvedValue({ data: 'sk_test_abc', error: null })
      const svc = new SecretsService(env)
      const secret = await svc.get('vault-uuid-1')
      expect(secret).toBe('sk_test_abc')
      expect(mockRpc).toHaveBeenCalledWith('vault_get_secret', { p_id: 'vault-uuid-1' })
    })

    it('throws when secret is null (not yet set)', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const svc = new SecretsService(env)
      await expect(svc.get('vault-uuid-1')).rejects.toThrow('vault.get: secret is null')
    })

    it('throws on DB error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'row not found' } })
      const svc = new SecretsService(env)
      await expect(svc.get('vault-uuid-1')).rejects.toThrow('vault.get failed: row not found')
    })
  })

  describe('delete', () => {
    it('deletes via vault_delete_secret RPC', async () => {
      mockRpc.mockResolvedValue({ error: null })
      const svc = new SecretsService(env)
      await svc.delete('vault-uuid-1')
      expect(mockRpc).toHaveBeenCalledWith('vault_delete_secret', { p_id: 'vault-uuid-1' })
    })

    it('throws on error', async () => {
      mockRpc.mockResolvedValue({ error: { message: 'delete failed' } })
      const svc = new SecretsService(env)
      await expect(svc.delete('vault-uuid-1')).rejects.toThrow('vault.delete failed: delete failed')
    })
  })
})

describe('STORY-042 · getStripeClient', () => {
  it('returns null when no payment_config row', async () => {
    mockFrom.mockReturnValue(fromChain({ data: null }))
    const result = await getStripeClient('rest-1', env)
    expect(result).toBeNull()
  })

  it('returns null when stripe_secret_vault_id is null', async () => {
    mockFrom.mockReturnValue(fromChain({ data: { stripe_secret_vault_id: null } }))
    const result = await getStripeClient('rest-1', env)
    expect(result).toBeNull()
  })

  it('returns StripeService when vault id is present', async () => {
    mockFrom.mockReturnValue(fromChain({ data: { stripe_secret_vault_id: 'vault-uuid-1' } }))

    const mockSecrets = { get: vi.fn().mockResolvedValue('sk_test_abc') } as unknown as SecretsService
    const result = await getStripeClient('rest-1', env, mockSecrets)
    expect(result).not.toBeNull()
    expect(mockSecrets.get).toHaveBeenCalledWith('vault-uuid-1')
  })

  it('resolves key via vault and returns a StripeService', async () => {
    mockFrom.mockReturnValue(fromChain({ data: { stripe_secret_vault_id: 'vault-uuid-abc' } }))

    const mockSecrets = { get: vi.fn().mockResolvedValue('sk_test_secret') } as unknown as SecretsService
    const result = await getStripeClient('rest-1', env, mockSecrets)
    // Key decrypted from vault and handed to StripeService — result is non-null
    expect(result).not.toBeNull()
    expect(mockSecrets.get).toHaveBeenCalledWith('vault-uuid-abc')
  })
})
