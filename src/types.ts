/**
 * Workers Rate Limiting API binding shape.
 * (Not yet shipped in @cloudflare/workers-types, so declared locally.)
 */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/**
 * Typed environment for every Worker handler — all bindings and secrets.
 * Mirrors the bindings declared in wrangler.toml plus secrets set via
 * `wrangler secret put` / `.dev.vars`.
 */
export interface Env {
  // --- KV namespaces ---
  MENU_CACHE: KVNamespace
  SETTINGS_CACHE: KVNamespace
  FLAGS_CACHE: KVNamespace
  SMTP_COUNTERS: KVNamespace
  DEVICE_TOKENS: KVNamespace

  // --- R2 ---
  MEDIA_BUCKET: R2Bucket

  // --- Rate limiting ---
  RATE_LIMITER: RateLimit

  // --- Vars (non-secret) ---
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string

  // --- Secrets ---
  SUPABASE_SERVICE_ROLE_KEY: string
  SUPABASE_JWT_SECRET: string
  MASTER_ENCRYPTION_KEY: string
  INTERNAL_CRON_SECRET: string
  /** Reserved, unused — no Stripe webhooks in this architecture. */
  STRIPE_WEBHOOK_SECRET: string
}

/**
 * Hono context variables, populated by middleware in later stories
 * (e.g. authenticated user, tenant id). Empty for the Slice 0 scaffold.
 */
export type Variables = Record<string, never>

/** Convenience alias for typing Hono handlers: `Context<HonoEnv>`. */
export interface HonoEnv {
  Bindings: Env
  Variables: Variables
}
