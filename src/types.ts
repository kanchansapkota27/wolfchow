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
 * Verified Supabase JWT claims attached to the Hono context by `jwtMiddleware`.
 * All values come from the token itself — no database lookup during auth.
 */
export interface JwtClaims {
  /** Supabase auth user id (`sub` claim). */
  sub: string
  /** superadmin | support | restaurant_owner | kitchen */
  role: string
  /** Tenant id, or null for platform-level roles (superadmin/support). */
  restaurant_id: string | null
  /** Fine-grained permissions, e.g. `orders:accept`. */
  permissions: string[]
  /** Set for tablet device accounts, otherwise null. */
  device_id: string | null
  /** True when this session is a superadmin impersonating a tenant. */
  imp: boolean
  /** User id of the impersonator, or null. */
  imp_by: string | null
}

/**
 * Hono context variables. `jwt` is populated by `jwtMiddleware` on protected
 * routes; public routes (e.g. /health) never read it.
 */
export interface Variables {
  jwt: JwtClaims
}

/** Convenience alias for typing Hono handlers: `Context<HonoEnv>`. */
export interface HonoEnv {
  Bindings: Env
  Variables: Variables
}
