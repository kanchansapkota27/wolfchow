/**
 * Hand-authored OpenAPI 3.1 document for the currently-merged routes (auth +
 * superadmin). Served at `/openapi.json` with Swagger UI at `/docs`.
 *
 * Why hand-authored: every route is a plain Hono handler, so Chanfana's
 * class-based auto-generation produces an empty spec. Converting ~29 tested
 * handlers to `OpenAPIRoute` classes is the job of the full STORY-044 (Slice 5);
 * until then this module documents the live contract without touching handler
 * logic. Keep it in sync when these routes change.
 */

type OperationObject = Record<string, unknown>
type PathItem = Record<string, OperationObject>

export interface OpenApiDocument {
  openapi: string
  info: { title: string; version: string; description?: string }
  tags: Array<{ name: string; description?: string }>
  components: {
    securitySchemes: Record<string, unknown>
    schemas: Record<string, unknown>
  }
  paths: Record<string, PathItem>
}

const bearer = [{ bearerAuth: [] as string[] }]
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const jsonContent = (schema: unknown) => ({ 'application/json': { schema } })
const body = (schema: unknown, required = true) => ({ required, content: jsonContent(schema) })
const res = (description: string, schema?: unknown): OperationObject =>
  schema ? { description, content: jsonContent(schema) } : { description }
const errRes = (description: string) => res(description, ref('Error'))

const uuidParam = (name: string, description: string) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description,
})
const stringPathParam = (name: string, description: string) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description,
})
const queryParam = (name: string, description: string, schema: unknown = { type: 'string' }) => ({
  name,
  in: 'query',
  required: false,
  schema,
  description,
})

const schemas: Record<string, unknown> = {
  Error: {
    type: 'object',
    required: ['error'],
    properties: {
      error: { type: 'string', description: 'Machine-readable error code' },
      code: { type: 'string' },
    },
  },
  PaymentMethod: { type: 'string', enum: ['card', 'pickup', 'delivery'] },
  FeatureFlags: {
    type: 'object',
    properties: Object.fromEntries(
      [
        'menu_photos',
        'item_modifiers',
        'category_scheduling',
        'email_notifications',
        'order_tracking_page',
        'analytics_dashboard',
        'export_orders_csv',
        'custom_brand_color',
        'remove_powered_by',
        'promotions_enabled',
        'scheduled_orders_enabled',
        'webhook_export',
      ].map((key) => [key, { type: 'boolean' }]),
    ),
  },
  Plan: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      staff_cap: { type: 'integer' },
      item_cap: { type: 'integer' },
      category_cap: { type: 'integer' },
      modifier_cap: { type: 'integer' },
      smtp_monthly_limit: { type: 'integer', nullable: true },
      transaction_history_days: { type: 'integer', nullable: true },
      feature_flags: ref('FeatureFlags'),
      payment_methods_allowed: { type: 'array', items: ref('PaymentMethod') },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  Invite: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      token: { type: 'string', example: 'inv_…' },
      plan_id: { type: 'string', format: 'uuid' },
      commission_rate: { type: 'number' },
      billing_note: { type: 'string', nullable: true },
      email: { type: 'string', format: 'email', nullable: true },
      used: { type: 'boolean' },
      used_at: { type: 'string', format: 'date-time', nullable: true },
      expires_at: { type: 'string', format: 'date-time' },
      created_at: { type: 'string', format: 'date-time' },
      status: { type: 'string', enum: ['pending', 'used', 'expired', 'revoked'] },
    },
  },
  Restaurant: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      slug: { type: 'string' },
      display_name: { type: 'string' },
      business_name: { type: 'string' },
      timezone: { type: 'string' },
      currency: { type: 'string' },
      plan_id: { type: 'string', format: 'uuid', nullable: true },
      commission_rate: { type: 'number' },
      billing_note: { type: 'string', nullable: true },
      active: { type: 'boolean' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  SmtpConfig: {
    type: 'object',
    description: 'SMTP config as returned to the client — never includes the password.',
    properties: {
      host: { type: 'string' },
      port: { type: 'integer' },
      username: { type: 'string' },
      from_email: { type: 'string', format: 'email' },
      from_name: { type: 'string' },
      has_password: { type: 'boolean' },
      monthly_limit: { type: 'integer', nullable: true },
      monthly_used: { type: 'integer' },
    },
  },
  AuthSession: {
    type: 'object',
    properties: {
      access_token: { type: 'string' },
      refresh_token: { type: 'string' },
      expires_in: { type: 'integer' },
      user: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string' },
        },
      },
    },
  },
}

function authPaths(): Record<string, PathItem> {
  const tags = ['auth']
  return {
    '/auth/login': {
      post: {
        tags,
        summary: 'Log in with email and password',
        requestBody: body({
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        }),
        responses: {
          '200': res('Authenticated session', ref('AuthSession')),
          '401': errRes('Invalid credentials'),
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags,
        summary: 'Exchange a refresh token for a new session',
        requestBody: body({
          type: 'object',
          required: ['refresh_token'],
          properties: { refresh_token: { type: 'string' } },
        }),
        responses: {
          '200': res('Refreshed session', ref('AuthSession')),
          '401': errRes('Invalid or expired refresh token'),
        },
      },
    },
    '/auth/logout': {
      post: {
        tags,
        summary: 'Revoke the current session',
        requestBody: body({
          type: 'object',
          properties: { refresh_token: { type: 'string' } },
        }),
        responses: { '204': res('Logged out') },
      },
    },
    '/auth/device': {
      post: {
        tags,
        summary: 'Exchange a device token for a tablet session',
        requestBody: body({
          type: 'object',
          required: ['device_token'],
          properties: { device_token: { type: 'string' } },
        }),
        responses: {
          '200': res('Tablet session', ref('AuthSession')),
          '401': errRes('Invalid device token'),
        },
      },
    },
    '/auth/invite/{token}': {
      get: {
        tags,
        summary: 'Validate an invite token (public)',
        parameters: [stringPathParam('token', 'Invite token (inv_…)')],
        responses: {
          '200': res('Invite details', ref('Invite')),
          '404': errRes('Invite not found'),
          '409': errRes('Invite already used'),
          '410': errRes('Invite expired or revoked'),
        },
      },
    },
  }
}

function superadminPaths(): Record<string, PathItem> {
  const tags = ['superadmin']
  const secured = (op: OperationObject): OperationObject => ({ ...op, tags, security: bearer })
  return {
    '/superadmin/session': {
      get: secured({
        summary: 'Probe the guard stack and echo the caller identity',
        responses: { '200': res('Identity'), '403': errRes('Forbidden / MFA required') },
      }),
    },
    '/superadmin/plans': {
      get: secured({
        summary: 'List all plans',
        responses: { '200': res('Plans', { type: 'object', properties: { plans: { type: 'array', items: ref('Plan') } } }) },
      }),
      post: secured({
        summary: 'Create a plan',
        requestBody: body(ref('Plan')),
        responses: { '201': res('Created plan', ref('Plan')), '422': errRes('Validation error') },
      }),
    },
    '/superadmin/plans/{id}': {
      patch: secured({
        summary: 'Update a plan (partial)',
        parameters: [uuidParam('id', 'Plan id')],
        requestBody: body(ref('Plan')),
        responses: { '200': res('Updated plan', ref('Plan')), '422': errRes('Validation error') },
      }),
      delete: secured({
        summary: 'Soft-delete a plan',
        parameters: [uuidParam('id', 'Plan id')],
        responses: { '200': res('Deleted'), '409': errRes('Plan still in use') },
      }),
    },
    '/superadmin/invites': {
      get: secured({
        summary: 'List invites',
        responses: { '200': res('Invites', { type: 'object', properties: { invites: { type: 'array', items: ref('Invite') } } }) },
      }),
      post: secured({
        summary: 'Create an invite',
        requestBody: body({
          type: 'object',
          required: ['plan_id'],
          properties: {
            plan_id: { type: 'string', format: 'uuid' },
            commission_rate: { type: 'number' },
            billing_note: { type: 'string' },
            email: { type: 'string', format: 'email' },
          },
        }),
        responses: { '201': res('Created invite', ref('Invite')), '422': errRes('Validation error') },
      }),
    },
    '/superadmin/invites/{id}': {
      delete: secured({
        summary: 'Revoke an invite',
        parameters: [uuidParam('id', 'Invite id')],
        responses: { '200': res('Revoked'), '404': errRes('Not found') },
      }),
    },
    '/superadmin/restaurants': {
      get: secured({
        summary: 'List restaurants (paginated)',
        parameters: [
          queryParam('page', 'Page number', { type: 'integer' }),
          queryParam('active', 'Filter by active state', { type: 'boolean' }),
          queryParam('plan_id', 'Filter by plan'),
          queryParam('search', 'Search display/business name'),
        ],
        responses: {
          '200': res('Restaurants', {
            type: 'object',
            properties: {
              restaurants: { type: 'array', items: ref('Restaurant') },
              page: { type: 'integer' },
              total: { type: 'integer' },
            },
          }),
        },
      }),
    },
    '/superadmin/restaurants/{id}': {
      get: secured({
        summary: 'Get a restaurant',
        parameters: [uuidParam('id', 'Restaurant id')],
        responses: { '200': res('Restaurant', ref('Restaurant')), '404': errRes('Not found') },
      }),
      patch: secured({
        summary: 'Update billing/plan/active fields',
        parameters: [uuidParam('id', 'Restaurant id')],
        requestBody: body({
          type: 'object',
          properties: {
            plan_id: { type: 'string', format: 'uuid' },
            commission_rate: { type: 'number' },
            billing_note: { type: 'string', nullable: true },
            active: { type: 'boolean' },
          },
        }),
        responses: { '200': res('Updated', ref('Restaurant')), '422': errRes('Validation error') },
      }),
    },
    '/superadmin/restaurants/{id}/suspend': {
      post: secured({
        summary: 'Suspend a restaurant',
        parameters: [uuidParam('id', 'Restaurant id')],
        responses: { '200': res('Suspended', ref('Restaurant')) },
      }),
    },
    '/superadmin/restaurants/{id}/reactivate': {
      post: secured({
        summary: 'Reactivate a restaurant',
        parameters: [uuidParam('id', 'Restaurant id')],
        responses: { '200': res('Reactivated', ref('Restaurant')) },
      }),
    },
    '/superadmin/restaurants/{id}/impersonate': {
      post: secured({
        summary: 'Mint a 30-minute impersonation token for a restaurant owner',
        parameters: [uuidParam('id', 'Restaurant id')],
        responses: {
          '200': res('Impersonation token', {
            type: 'object',
            properties: { access_token: { type: 'string' }, expires_in: { type: 'integer' } },
          }),
        },
      }),
    },
    '/superadmin/smtp/global': {
      get: secured({ summary: 'Get global SMTP config', responses: { '200': res('Global SMTP', ref('SmtpConfig')) } }),
      post: secured({
        summary: 'Set global SMTP config',
        requestBody: body({
          type: 'object',
          required: ['host', 'port', 'username', 'password', 'from_email', 'from_name'],
          properties: {
            host: { type: 'string' },
            port: { type: 'integer' },
            username: { type: 'string' },
            password: { type: 'string', description: 'Write-only; sealed at rest, never returned' },
            from_email: { type: 'string', format: 'email' },
            from_name: { type: 'string' },
          },
        }),
        responses: { '200': res('Saved', ref('SmtpConfig')), '422': errRes('Validation error') },
      }),
    },
    '/superadmin/smtp/test': {
      post: secured({
        summary: 'Send a test email via the global SMTP config',
        requestBody: body({ type: 'object', properties: { to: { type: 'string', format: 'email' } } }),
        responses: { '200': res('Sent'), '503': errRes('Email transport not configured') },
      }),
    },
    '/superadmin/smtp/restaurants/{id}': {
      get: secured({
        summary: 'Get a per-restaurant SMTP override',
        parameters: [uuidParam('id', 'Restaurant id')],
        responses: { '200': res('Override', ref('SmtpConfig')), '404': errRes('No override') },
      }),
      post: secured({
        summary: 'Upsert a per-restaurant SMTP override',
        parameters: [uuidParam('id', 'Restaurant id')],
        requestBody: body(ref('SmtpConfig')),
        responses: { '200': res('Saved', ref('SmtpConfig')), '422': errRes('Validation error') },
      }),
      delete: secured({
        summary: 'Remove a per-restaurant SMTP override',
        parameters: [uuidParam('id', 'Restaurant id')],
        responses: { '204': res('Removed') },
      }),
    },
    '/superadmin/billing': {
      get: secured({
        summary: 'Commission & billing summary across all restaurants',
        responses: { '200': res('Summary', { type: 'object', properties: { summary: { type: 'array', items: { type: 'object' } } } }) },
      }),
    },
    '/superadmin/billing/{restaurant_id}': {
      get: secured({
        summary: 'Monthly billing breakdown for one restaurant (last 12 months)',
        parameters: [uuidParam('restaurant_id', 'Restaurant id')],
        responses: { '200': res('Months', { type: 'object', properties: { months: { type: 'array', items: { type: 'object' } } } }) },
      }),
    },
    '/superadmin/audit': {
      get: secured({
        summary: 'Platform audit log (paginated, cross-tenant)',
        parameters: [
          queryParam('page', 'Page number', { type: 'integer' }),
          queryParam('restaurant_id', 'Filter by restaurant'),
          queryParam('table_name', 'Filter by table'),
          queryParam('operation', 'Filter by operation'),
          queryParam('date_from', 'ISO timestamp lower bound'),
          queryParam('date_to', 'ISO timestamp upper bound'),
        ],
        responses: { '200': res('Audit entries', { type: 'object', properties: { entries: { type: 'array', items: { type: 'object' } }, page: { type: 'integer' }, total: { type: 'integer' } } }) },
      }),
    },
    '/superadmin/audit/{restaurant_id}': {
      get: secured({
        summary: 'Audit log scoped to one restaurant',
        parameters: [uuidParam('restaurant_id', 'Restaurant id')],
        responses: { '200': res('Audit entries', { type: 'object', properties: { entries: { type: 'array', items: { type: 'object' } } } }) },
      }),
    },
  }
}

/** Build the OpenAPI 3.1 document for the currently-documented routes. */
export function buildOpenApiDocument(): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: {
      title: 'RestroAPI',
      version: '0.1.0',
      description:
        'Multi-tenant restaurant ordering SaaS API. Documents the auth and superadmin routes; admin/tablet/public routes are added as those slices land (STORY-044).',
    },
    tags: [
      { name: 'auth', description: 'Login, refresh, logout, device, invite validation' },
      { name: 'superadmin', description: 'Platform control plane (Bearer JWT + MFA required)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas,
    },
    paths: { ...authPaths(), ...superadminPaths() },
  }
}
