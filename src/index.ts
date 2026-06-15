import { Hono } from 'hono'
import { fromHono } from 'chanfana'
import type { HonoEnv } from './types'
import { registerHealthRoutes } from './routes/health'

const app = new Hono<HonoEnv>()

// Chanfana wraps the Hono app and serves Swagger UI at /docs and the
// OpenAPI 3.1 document at /openapi.json.
fromHono(app, {
  docs_url: '/docs',
  openapi_url: '/openapi.json',
  schema: {
    info: {
      title: 'RestroAPI',
      version: '0.1.0',
      description: 'Multi-tenant restaurant ordering SaaS API',
    },
  },
})

registerHealthRoutes(app)

export default app
export { app }
