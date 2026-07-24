import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../types'
import { createAdminClient } from './supabase'
import { SecretsService } from './secrets'

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
  /** Additional recipients CC'd on the same email (visible to all recipients). */
  cc?: string[]
  subject: string
  html: string
}

/**
 * Pluggable email transport. Cloudflare Workers cannot open raw SMTP (TCP)
 * connections, so the concrete transport must be an HTTP email provider.
 */
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>
}

/** Default transport: no provider configured yet. */
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
  password_vault_id: string
  from_email: string
  from_name: string
}

type ResolvedCredentials = SmtpCredentials & { source: SmtpSource; monthly_limit: number | null }

export interface SendOptions {
  restaurant_id: string
  to: string
  cc?: string[]
  subject: string
  html: string
}

/**
 * Centralised SMTP send service.
 *
 * Resolution order: the restaurant's own `smtp_config` row (no limit) → the
 * global config (`restaurant_id IS NULL`), which is subject to the restaurant's
 * plan monthly limit enforced via TenantCounterDO (atomic). Passwords are
 * read from Supabase Vault via SecretsService.
 */
export class SmtpService {
  private readonly admin: SupabaseClient
  private readonly secrets: SecretsService

  constructor(
    private readonly env: Env,
    private readonly transport: EmailTransport = notConfiguredTransport(),
    secrets?: SecretsService,
  ) {
    this.admin = createAdminClient(env)
    this.secrets = secrets ?? new SecretsService(env)
  }

  async send(opts: SendOptions): Promise<SmtpSource> {
    let resolved: ResolvedCredentials | null = null
    try {
      resolved = await this.resolveCredentials(opts.restaurant_id)

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
        cc: opts.cc,
        subject: opts.subject,
        html: opts.html,
      })

      await this.logEmail(opts.restaurant_id, opts.to, opts.subject, resolved.source)
      return resolved.source
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown_error'
      await this.logEmail(
        opts.restaurant_id,
        opts.to,
        opts.subject,
        resolved?.source ?? null,
        reason,
      ).catch(() => {})
      throw err
    }
  }

  async sendGlobalTest(to: string, subject: string, html: string): Promise<void> {
    const global = await this.admin
      .from('smtp_config')
      .select('*')
      .is('restaurant_id', null)
      .limit(1)
      .maybeSingle()
    const row = global.data as SmtpConfigRow | null
    if (!row) throw new NoSmtpConfigError()
    await this.transport.send({ credentials: await this.toCredentials(row), to, subject, html })
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
    const password = await this.secrets.get(row.password_vault_id)
    return {
      host: row.host,
      port: row.port,
      username: row.username,
      password,
      from_email: row.from_email,
      from_name: row.from_name,
    }
  }

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
   * Atomic monthly counter via TenantCounterDO.
   * 429 from the DO = at limit; throw SmtpLimitExceededError without incrementing.
   */
  private async checkAndIncrementLimit(restaurantId: string, limit: number): Promise<void> {
    const period = new Date().toISOString().slice(0, 7) // YYYY-MM
    const stub = this.env.TENANT_COUNTER.get(this.env.TENANT_COUNTER.idFromName(restaurantId))
    const res = await stub.fetch('https://do/increment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counter: 'smtp', period, limit }),
    })

    if (res.status === 429) {
      const body = (await res.json()) as { count: number }
      await this.admin.from('audit_log').insert({
        restaurant_id: restaurantId,
        table_name: 'smtp_config',
        operation: 'UPDATE',
        new_data: { event: 'smtp_limit_exceeded', limit, count: body.count },
      })
      throw new SmtpLimitExceededError()
    }
  }

  private async logEmail(
    restaurantId: string,
    to: string,
    subject: string,
    source: SmtpSource | null,
    failureReason?: string,
  ): Promise<void> {
    await this.admin.from('email_log').insert({
      restaurant_id: restaurantId,
      to_address: to,
      subject,
      smtp_source: source,
      status: failureReason ? 'failed' : 'sent',
      failure_reason: failureReason ?? null,
    })
  }
}
