import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'
import type { Env, HonoEnv } from '../types'

// Regex that matches any http://localhost:* or http://127.0.0.1:* origin.
// Used in dev (when CORS_ALLOWED_ORIGINS is not set) so any local server —
// Vite, VS Code Live Server, http-server, etc. — can reach the Worker without
// needing to whitelist individual ports.
const DEV_LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

/**
 * CORS for the browser apps, which run on their own origins (Vite dev servers
 * locally, separate Cloudflare Pages domains in production) and call this Worker
 * cross-origin. Allowed origins come from `CORS_ALLOWED_ORIGINS` (comma-
 * separated); when unset we allow any localhost/127.0.0.1 origin (dev only).
 * Auth is via Bearer tokens (no cookies), so credentials mode is not enabled.
 */
export function corsMiddleware(): MiddlewareHandler<HonoEnv> {
  return cors({
    origin: (origin, c) => {
      const env = (c.env ?? {}) as Env
      const configured = (env.CORS_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

      if (configured.length > 0) {
        // Production: exact allow-list only.
        return origin && configured.includes(origin) ? origin : null
      }

      // Dev: allow any local origin. Reject null-origin (file:// / sandboxed iframes).
      if (!origin || origin === 'null') return null
      return DEV_LOCAL_ORIGIN_RE.test(origin) ? origin : null
    },
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })
}
