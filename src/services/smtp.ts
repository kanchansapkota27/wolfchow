import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../types'
import { createAdminClient } from './supabase'
import { EncryptionService } from './encryption'

/** Thrown when a fallback send would exceed the restaurant's monthly limit. */
export class SmtpLimitExceededError extends Error {
  constructor(message = 'smtp_monthly_limit_exceeded') {
    super(message)
    this.name = 'SmtpLimitExceededError'
  }
}

/** Thrown when neither an own nor a global SMTP config exists. */
export class NoSmtpConfigError extends Error {
  constructor(message = 'no_smtp_config') {
    super(message)
    this.name = 'NoSmtpConfigError'
  }
}

/** Which config the send resolved to. */
export type SmtpSource = 'own' | 'override' | 'global'

export interface SmtpCredentials {
  host: string
  port: number
  username: string
  password: string
  from_email: string
  from_name: string
}

export interface EmailMessage {
  credentials: SmtpCredentials
  to: string
  subject: string
  html: string
}

/**
 * Pluggable email transport. Cloudflare Workers cannot open raw SMTP (TCP)
 * connections, so the concrete transport must be an HTTP email provider — chosen
 * in a later story. Until then the default transport errors; callers/tests
 * inject their own.
 */
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>
}

/** Default transport: no provider configured yet (see STORY-039 ADR). */
export function notConfiguredTransport(): EmailTransport {
  return {
    send: () => Promise.reject(new Error('email transport not configured')),
  }
}

interface SmtpConfigRow {
  restaurant_id: string | null
  host: string
  port: number
  username: string
  encrypted_password: string
  from_email: string
  from_name: string
}

type ResolvedCredentials = SmtpCredentials & { source: SmtpSource; monthly_limit: number | null }

export interface SendOptions {
  restaurant_id: string
  to: string
  subject: string
  html: string
}

/**
 * Centralised SMTP send service.
 *
 * Resolution order: the restaurant's own `smtp_config` row (no limit) → the
 * global config (`restaurant_id IS NULL`), which is subject to the restaurant's
 * plan monthly limit enforced via a KV counter. The stored password is
 * decrypted with the EncryptionService (context = the row's restaurant_id, or
 * "global"). Limit breaches are audited and block the send; successful sends are
 * written to `email_log`.
 *
 * NOTE: the spec's middle "superadmin per-restaurant override" tier is not
 * representable in the current schema (`smtp_config` is unique per restaurant_id,
 * null = global), so it collapses into "own". See the STORY-039 ADR.
 */
export class SmtpService {
  private readonly admin: SupabaseClient
  private readonly encryption: EncryptionService
  private readonly kv: KVNamespace

  constructor(
    env: Env,
    private readonly transport: EmailTransport = notConfiguredTransport(),
  ) {
    this.admin = createAdminClient(env)
    this.encryption = new EncryptionService(env.MASTER_ENCRYPTION_KEY)
    this.kv = env.SMTP_COUNTERS
  }

  async send(opts: SendOptions): Promise<SmtpSource> {
    const resolved = await this.resolveCredentials(opts.restaurant_id)

    // Own SMTP is unlimited; fallback paths honour the plan's monthly limit.
    if (resolved.source !== 'own' && resolved.monthly_limit !== null) {
      await this.checkAndIncrementLimit(opts.restaurant_id, resolved.monthly_limit)
    }

    await this.transport.send({
      credentials: {
        host: resolved.host,
        port: resolved.port,
        username: resolved.username,
        password: resolved.password,
        from_email: resolved.from_email,
        from_name: resolved.from_name,
      },
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })

    await this.logEmail(opts.restaurant_id, opts.to, opts.subject, resolved.source)
    return resolved.source
  }

  private async resolveCredentials(restaurantId: string): Promise<ResolvedCredentials> {
    const own = await this.admin
      .from('smtp_config')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    const ownRow = own.data as SmtpConfigRow | null
    if (ownRow) {
      return { ...(await this.toCredentials(ownRow)), source: 'own', monthly_limit: null }
    }

    const global = await this.admin
      .from('smtp_config')
      .select('*')
      .is('restaurant_id', null)
      .limit(1)
      .maybeSingle()
    const globalRow = global.data as SmtpConfigRow | null
    if (globalRow) {
      const monthly_limit = await this.planMonthlyLimit(restaurantId)
      return { ...(await this.toCredentials(globalRow)), source: 'global', monthly_limit }
    }

    throw new NoSmtpConfigError()
  }

  private async toCredentials(row: SmtpConfigRow): Promise<SmtpCredentials> {
    const context = row.restaurant_id ?? 'global'
    const password = await this.encryption.open(row.encrypted_password, context)
    return {
      host: row.host,
      port: row.port,
      username: row.username,
      password,
      from_email: row.from_email,
      from_name: row.from_name,
    }
  }

  /** The restaurant's plan monthly SMTP limit; null = unlimited. */
  private async planMonthlyLimit(restaurantId: string): Promise<number | null> {
    const restaurant = await this.admin
      .from('restaurants')
      .select('plan_id')
      .eq('id', restaurantId)
      .maybeSingle()
    const planId = (restaurant.data as { plan_id: string | null } | null)?.plan_id
    if (!planId) return null

    const plan = await this.admin
      .from('plans')
      .select('smtp_monthly_limit')
      .eq('id', planId)
      .maybeSingle()
    return (plan.data as { smtp_monthly_limit: number | null } | null)?.smtp_monthly_limit ?? null
  }

  /**
   * Read-modify-write KV counter `smtp:{restaurant_id}:{YYYY-MM}`. Workers KV has
   * no atomic increment, so this is eventually consistent — acceptable for a soft
   * monthly cap. At/over limit: audit and throw without incrementing or sending.
   */
  private async checkAndIncrementLimit(restaurantId: string, limit: number): Promise<void> {
    const month = new Date().toISOString().slice(0, 7)
    const key = `smtp:${restaurantId}:${month}`
    const current = Number.parseInt((await this.kv.get(key)) ?? '0', 10) || 0

    if (current >= limit) {
      await this.admin.from('audit_log').insert({
        restaurant_id: restaurantId,
        table_name: 'smtp_config',
        operation: 'UPDATE',
        new_data: { event: 'smtp_limit_exceeded', limit, count: current },
      })
      throw new SmtpLimitExceededError()
    }

    await this.kv.put(key, String(current + 1))
  }

  private async logEmail(
    restaurantId: string,
    to: string,
    subject: string,
    source: SmtpSource,
  ): Promise<void> {
    await this.admin.from('email_log').insert({
      restaurant_id: restaurantId,
      to_address: to,
      subject,
      smtp_source: source,
    })
  }
}
