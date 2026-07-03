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
  /** Cloudflare account ID — used to build the R2 S3-compatible endpoint. */
  R2_ACCOUNT_ID: string
  /** R2 API token access key ID (for presigned URL signing). */
  R2_ACCESS_KEY_ID: string
  /** R2 API token secret access key (for presigned URL signing). */
  R2_SECRET_ACCESS_KEY: string
  /** R2 bucket name — must match MEDIA_BUCKET. */
  R2_BUCKET_NAME: string

  // --- Rate limiting (one binding per route group; see wrangler.toml) ---
  RATE_LIMITER_PUBLIC: RateLimit
  RATE_LIMITER_ORDER: RateLimit
  RATE_LIMITER_WRITE: RateLimit
  RATE_LIMITER_TRACKING: RateLimit

  // --- Vars (non-secret) ---
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string

  // --- Secrets ---
  SUPABASE_SERVICE_ROLE_KEY: string
  /**
   * Set for HS256 Supabase projects (older). When present the JWT middleware
   * uses HMAC-SHA256 verification. When absent it falls back to ES256 via JWKS.
   * Never read from the token header — algorithm is always derived from config.
   */
  SUPABASE_JWT_SECRET?: string
  MASTER_ENCRYPTION_KEY: string
  INTERNAL_CRON_SECRET: string
  /** Reserved, unused — no Stripe webhooks in this architecture. */
  STRIPE_WEBHOOK_SECRET: string

  /**
   * LOCAL DEV ONLY. When `'true'`, `requireMFA` skips the TOTP check so a seeded
   * superadmin can use the panel before the MFA enroll/challenge flow exists.
   * Lives only in `.dev.vars`; never set in `wrangler.toml` or a prod secret.
   */
  MFA_DEV_BYPASS?: string

  /**
   * Comma-separated list of browser origins allowed to call the API (CORS).
   * In production set the apps' Cloudflare Pages origins; when unset, local Vite
   * dev ports are allowed. Safe to keep in `wrangler.toml [vars]` (not a secret).
   */
  CORS_ALLOWED_ORIGINS?: string

  /**
   * Base URL of the admin signup page used in generated invite links. Defaults
   * to the production admin origin; set per environment (the admin app deploys
   * independently). Not a secret — fine in `wrangler.toml [vars]`.
   */
  SIGNUP_BASE_URL?: string

  /**
   * Base URL of the widget / customer-facing app. Used to build order tracking
   * links in transactional emails. e.g. `https://order.yourrestaurant.com`.
   * When unset, emails omit the tracking link. Not a secret.
   */
  WIDGET_BASE_URL?: string
}

/**
 * A single Supabase `amr` (authenticator method reference) entry — which method
 * the session authenticated with (e.g. `password`, `otp`, `totp`) and when.
 */
export interface AuthMethodReference {
  method: string
  timestamp: number | null
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
  /** Authenticator method references — used by `requireMFA` to detect TOTP. */
  amr: AuthMethodReference[]
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
