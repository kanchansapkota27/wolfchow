import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'
import type { Env, HonoEnv } from '../types'

/** Local app dev ports (Vite) used when `CORS_ALLOWED_ORIGINS` is unset. */
const DEFAULT_DEV_ORIGINS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180].flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
])

/**
 * CORS for the browser apps, which run on their own origins (Vite dev servers
 * locally, separate Cloudflare Pages domains in production) and call this Worker
 * cross-origin. Allowed origins come from `CORS_ALLOWED_ORIGINS` (comma-
 * separated); when unset we fall back to the local Vite dev ports. Auth is via
 * Bearer tokens (no cookies), so credentials mode is not enabled.
 */
export function corsMiddleware(): MiddlewareHandler<HonoEnv> {
  return cors({
    origin: (origin, c) => {
      const env = (c.env ?? {}) as Env
      const configured = (env.CORS_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      const allowed = configured.length > 0 ? configured : DEFAULT_DEV_ORIGINS
      return origin && allowed.includes(origin) ? origin : null
    },
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })
}
