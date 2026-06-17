import { describe, expect, it } from 'vitest'
import app from '../index'
import { buildOpenApiDocument } from './document'

describe('STORY-044 · OpenAPI documentation (auth + superadmin)', () => {
  it('GET /docs returns 200 Swagger UI HTML', async () => {
    const res = await app.request('/docs')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('swagger-ui')
    expect(html).toContain('/openapi.json')
  })

  it('GET /openapi.json returns a valid OpenAPI 3.1 document', async () => {
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const doc = (await res.json()) as ReturnType<typeof buildOpenApiDocument>
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info.title).toBe('RestroAPI')
  })

  it('documents the key auth and superadmin paths', async () => {
    const res = await app.request('/openapi.json')
    const doc = (await res.json()) as ReturnType<typeof buildOpenApiDocument>
    expect(Object.keys(doc.paths)).toContain('/auth/login')
    expect(Object.keys(doc.paths)).toContain('/superadmin/plans')
    expect(doc.paths['/auth/login']?.post).toBeDefined()
    expect(doc.paths['/superadmin/plans']?.get).toBeDefined()
  })

  it('declares a bearer security scheme and tags', () => {
    const doc = buildOpenApiDocument()
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' })
    expect(doc.tags.map((t) => t.name)).toEqual(['auth', 'superadmin'])
  })

  it('secures superadmin routes with bearer auth but leaves login public', () => {
    const doc = buildOpenApiDocument()
    const plansGet = doc.paths['/superadmin/plans']?.get as { security?: unknown[] }
    const login = doc.paths['/auth/login']?.post as { security?: unknown[] }
    expect(plansGet.security).toEqual([{ bearerAuth: [] }])
    expect(login.security).toBeUndefined()
  })
})
