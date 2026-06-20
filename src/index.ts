import { Hono } from 'hono'
import { getSwaggerUI } from 'chanfana'
import type { HonoEnv } from './types'
import { corsMiddleware } from './middleware/cors'
import { buildOpenApiDocument } from './openapi/document'
import { registerHealthRoutes } from './routes/health'
import { registerAuthRoutes } from './routes/auth'
import { registerAdminRoutes } from './routes/admin'
import { registerSuperadminRoutes } from './routes/superadmin'

const app = new Hono<HonoEnv>()

// CORS first so cross-origin browser apps (and their preflights) are handled
// before any route logic.
app.use('*', corsMiddleware())

// API documentation. Routes are plain Hono handlers (not Chanfana route
// classes), so we serve a hand-authored OpenAPI 3.1 document and render it with
// Chanfana's Swagger UI helper. Full decorator-based generation lands in the
// complete STORY-044.
const openApiDocument = buildOpenApiDocument()
app.get('/openapi.json', () => Response.json(openApiDocument))
app.get('/docs', (c) => c.html(getSwaggerUI('/openapi.json')))

registerHealthRoutes(app)
registerAuthRoutes(app)
registerAdminRoutes(app)
registerSuperadminRoutes(app)

export default app
export { app }
