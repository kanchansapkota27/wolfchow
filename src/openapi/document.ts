/**
 * Hand-authored OpenAPI 3.1 document for all currently-merged routes.
 * Served at `/openapi.json` with Swagger UI at `/docs`.
 *
 * Why hand-authored: every route is a plain Hono handler, so Chanfana's
 * class-based auto-generation produces an empty spec. Converting handlers to
 * `OpenAPIRoute` classes is the job of STORY-044 (Slice 5); until then this
 * module documents the live contract. Keep it in sync when routes change.
 *
 * Covered: auth (login/refresh/logout/device/invite/signup) +
 *          superadmin (plans/invites/restaurants/smtp/billing/audit) +
 *          admin (restaurant profile, menu categories, menu items, variants)
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
  MenuCategory: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      restaurant_id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      sort_order: { type: 'integer' },
      active: { type: 'boolean' },
      availability_state: { type: 'string', enum: ['available', 'unavailable', 'scheduled'] },
      item_count: { type: 'integer', description: 'Number of active items in this category' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  MenuItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      restaurant_id: { type: 'string', format: 'uuid' },
      category_id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      price: { type: 'integer', description: 'Price in cents (e.g. 1200 = $12.00)' },
      availability_state: { type: 'string', enum: ['available', 'out_of_stock', 'hidden', 'scheduled'] },
      restore_at: { type: 'string', format: 'date-time', nullable: true },
      active: { type: 'boolean' },
      has_variants: { type: 'boolean' },
      tags: { type: 'array', items: { type: 'string', enum: ['vegan', 'vegetarian', 'spicy', 'gluten_free', 'contains_nuts', 'halal', 'dairy_free', 'contains_alcohol'] } },
      image_key: { type: 'string', nullable: true, description: 'R2 object key for the item image' },
      sort_order: { type: 'integer' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  ItemVariant: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      item_id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      price: { type: 'integer', description: 'Price in cents' },
      is_default: { type: 'boolean' },
      available: { type: 'boolean' },
      sort_order: { type: 'integer' },
    },
  },
  PresignedUrl: {
    type: 'object',
    properties: {
      upload_url: { type: 'string', format: 'uri', description: 'Pre-signed PUT URL valid for 15 minutes' },
      r2_key: { type: 'string', description: 'Object key; store this and write back via PATCH after upload' },
    },
  },
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
    '/auth/signup': {
      post: {
        tags,
        summary: 'Complete restaurant signup from an invite token',
        description:
          'Creates the Supabase auth user, the `restaurants` row, and the `profiles` row in a single transaction. The invite token is consumed and marked used. Returns a full session.',
        requestBody: body({
          type: 'object',
          required: ['invite_token', 'admin_name', 'admin_email', 'password', 'business_name', 'timezone', 'currency', 'address'],
          properties: {
            invite_token: { type: 'string', example: 'inv_…' },
            admin_name: { type: 'string' },
            admin_phone: { type: 'string' },
            admin_email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            business_name: { type: 'string' },
            display_name: { type: 'string' },
            timezone: { type: 'string', example: 'America/Chicago' },
            currency: { type: 'string', minLength: 3, maxLength: 3, example: 'USD' },
            address: {
              type: 'object',
              required: ['line1', 'city', 'country'],
              properties: {
                line1: { type: 'string' },
                city: { type: 'string' },
                country: { type: 'string' },
              },
            },
            slug: { type: 'string', description: 'Optional URL slug (3–50 lowercase alphanumeric + hyphens). Auto-generated from business_name if omitted.' },
          },
        }),
        responses: {
          '201': res('Signup complete — session returned', ref('AuthSession')),
          '404': errRes('Invite not found'),
          '409': errRes('Invite already used or slug taken'),
          '410': errRes('Invite expired or revoked'),
          '422': res('Validation error (timezone, email format, etc.)', ref('Error')),
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

function adminPaths(): Record<string, PathItem> {
  const tags = ['admin']
  const secured = (op: OperationObject): OperationObject => ({ ...op, tags, security: bearer })

  const reorderBody = body({
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'sort_order'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        sort_order: { type: 'integer', minimum: 0 },
      },
    },
  })

  return {
    // ── Restaurant profile (STORY-013) ──────────────────────────────────────────

    '/admin/restaurant': {
      get: secured({
        summary: "Get the caller's restaurant row",
        responses: { '200': res('Restaurant', ref('Restaurant')) },
      }),
      patch: secured({
        summary: 'Update mutable restaurant fields (display_name, address, logo_key, etc.)',
        description:
          'Protected fields (timezone, currency, slug, plan_id, commission_rate, active) are silently stripped. ' +
          'Writes invalidate the settings and theme KV caches.',
        requestBody: body({
          type: 'object',
          properties: {
            display_name: { type: 'string' },
            address: { type: 'object' },
            logo_key: { type: 'string', nullable: true },
          },
        }),
        responses: {
          '200': res('Updated restaurant', ref('Restaurant')),
          '422': errRes('No updatable fields supplied'),
        },
      }),
    },
    '/admin/restaurant/logo': {
      post: secured({
        summary: 'Request a presigned PUT URL for uploading a new logo to R2',
        description: 'Returns a pre-signed URL (15 min) and the R2 key. After upload, write the key back via PATCH /admin/restaurant.',
        responses: {
          '201': res('Presigned URL', ref('PresignedUrl')),
        },
      }),
    },
    '/admin/restaurant/profile': {
      patch: secured({
        summary: "Update the owner's auth profile (name, phone)",
        requestBody: body({
          type: 'object',
          properties: {
            admin_name: { type: 'string' },
            admin_phone: { type: 'string', nullable: true },
          },
        }),
        responses: { '204': res('Updated') },
      }),
    },
    '/admin/restaurant/password': {
      patch: secured({
        summary: "Change the owner's password",
        requestBody: body({
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string', minLength: 8 } },
        }),
        responses: { '204': res('Password updated') },
      }),
    },

    // ── Menu categories (STORY-014) ──────────────────────────────────────────────

    '/admin/menu/categories': {
      get: secured({
        summary: 'List all categories for the restaurant (ordered by sort_order)',
        responses: {
          '200': res('Categories', {
            type: 'object',
            properties: { categories: { type: 'array', items: ref('MenuCategory') } },
          }),
        },
      }),
      post: secured({
        summary: 'Create a category',
        requestBody: body({
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', maxLength: 100 },
            sort_order: { type: 'integer', minimum: 0, default: 0 },
            availability_state: { type: 'string', enum: ['available', 'unavailable', 'scheduled'], default: 'available' },
          },
        }),
        responses: {
          '201': res('Created category', ref('MenuCategory')),
          '402': res('Plan category cap reached', ref('Error')),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/admin/menu/categories/reorder': {
      post: secured({
        summary: 'Batch-update sort_order for multiple categories',
        requestBody: reorderBody,
        responses: { '204': res('Reordered'), '422': errRes('Validation error') },
      }),
    },
    '/admin/menu/categories/{id}': {
      patch: secured({
        summary: 'Update a category',
        parameters: [uuidParam('id', 'Category id')],
        requestBody: body({
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 100 },
            sort_order: { type: 'integer', minimum: 0 },
            active: { type: 'boolean' },
            availability_state: { type: 'string', enum: ['available', 'unavailable', 'scheduled'] },
          },
        }),
        responses: {
          '200': res('Updated category', ref('MenuCategory')),
          '404': errRes('Not found'),
          '422': errRes('No updatable fields / validation error'),
        },
      }),
      delete: secured({
        summary: 'Soft-delete a category (sets active=false)',
        description: 'Returns 409 if the category still has active items.',
        parameters: [uuidParam('id', 'Category id')],
        responses: {
          '204': res('Deleted'),
          '404': errRes('Not found'),
          '409': res('Category has active items', {
            type: 'object',
            properties: { error: { type: 'string' }, item_count: { type: 'integer' } },
          }),
        },
      }),
    },

    // ── Menu items (STORY-015) ────────────────────────────────────────────────────

    '/admin/menu/items': {
      get: secured({
        summary: 'List all items for the restaurant',
        parameters: [queryParam('category_id', 'Filter by category UUID')],
        responses: {
          '200': res('Items', {
            type: 'object',
            properties: { items: { type: 'array', items: ref('MenuItem') } },
          }),
        },
      }),
      post: secured({
        summary: 'Create an item',
        requestBody: body({
          type: 'object',
          required: ['name', 'price', 'category_id'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number', exclusiveMinimum: 0, description: 'Display price (e.g. 12.50); stored as cents internally' },
            category_id: { type: 'string', format: 'uuid' },
            tags: { type: 'array', items: { type: 'string' } },
            sort_order: { type: 'integer', minimum: 0, default: 0 },
          },
        }),
        responses: {
          '201': res('Created item', ref('MenuItem')),
          '402': res('Plan item cap reached', ref('Error')),
          '422': errRes('Validation error (price ≤ 0, invalid tag, etc.)'),
        },
      }),
    },
    '/admin/menu/items/{id}': {
      patch: secured({
        summary: 'Update an item',
        parameters: [uuidParam('id', 'Item id')],
        requestBody: body({
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            price: { type: 'number', exclusiveMinimum: 0 },
            category_id: { type: 'string', format: 'uuid' },
            tags: { type: 'array', items: { type: 'string' } },
            sort_order: { type: 'integer', minimum: 0 },
            active: { type: 'boolean' },
          },
        }),
        responses: {
          '200': res('Updated item', ref('MenuItem')),
          '404': errRes('Not found'),
          '422': errRes('Validation error'),
        },
      }),
      delete: secured({
        summary: 'Soft-delete an item (sets active=false)',
        parameters: [uuidParam('id', 'Item id')],
        responses: { '204': res('Deleted'), '404': errRes('Not found') },
      }),
    },
    '/admin/menu/items/{id}/image': {
      post: secured({
        summary: 'Request a presigned PUT URL for an item image',
        description: 'Requires `menu_photos` feature flag on the restaurant plan. Returns a 15-minute PUT URL and R2 key. After upload, PATCH the item with the key.',
        parameters: [uuidParam('id', 'Item id')],
        responses: {
          '201': res('Presigned URL', ref('PresignedUrl')),
          '402': res('Feature locked — plan does not include menu_photos', ref('Error')),
        },
      }),
    },
    '/admin/menu/items/{id}/availability': {
      patch: secured({
        summary: 'Set item availability state',
        parameters: [uuidParam('id', 'Item id')],
        requestBody: body({
          type: 'object',
          required: ['state'],
          properties: {
            state: { type: 'string', enum: ['available', 'out_of_stock', 'hidden', 'scheduled'] },
            restore_at: { type: 'string', format: 'date-time', nullable: true, description: 'ISO timestamp for auto-restore (used with out_of_stock or scheduled)' },
          },
        }),
        responses: {
          '200': res('Updated item', ref('MenuItem')),
          '404': errRes('Not found'),
        },
      }),
    },

    // ── Item variants (STORY-015) ─────────────────────────────────────────────────

    '/admin/menu/items/{item_id}/variants': {
      get: secured({
        summary: 'List variants for an item',
        parameters: [uuidParam('item_id', 'Item id')],
        responses: {
          '200': res('Variants', {
            type: 'object',
            properties: { variants: { type: 'array', items: ref('ItemVariant') } },
          }),
        },
      }),
      post: secured({
        summary: 'Add a variant to an item',
        description: 'Adding the first variant sets `has_variants = true` on the parent item. If `is_default = true`, sibling defaults are unset first.',
        parameters: [uuidParam('item_id', 'Item id')],
        requestBody: body({
          type: 'object',
          required: ['name', 'price'],
          properties: {
            name: { type: 'string' },
            price: { type: 'number', exclusiveMinimum: 0 },
            is_default: { type: 'boolean', default: false },
            sort_order: { type: 'integer', minimum: 0, default: 0 },
          },
        }),
        responses: {
          '201': res('Created variant', ref('ItemVariant')),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/admin/menu/items/{item_id}/variants/reorder': {
      post: secured({
        summary: 'Batch-update sort_order for multiple variants',
        parameters: [uuidParam('item_id', 'Item id')],
        requestBody: reorderBody,
        responses: { '204': res('Reordered'), '422': errRes('Validation error') },
      }),
    },
    '/admin/menu/variants/{id}': {
      patch: secured({
        summary: 'Update a variant',
        parameters: [uuidParam('id', 'Variant id')],
        requestBody: body({
          type: 'object',
          properties: {
            name: { type: 'string' },
            price: { type: 'number', exclusiveMinimum: 0 },
            is_default: { type: 'boolean' },
            available: { type: 'boolean' },
            sort_order: { type: 'integer', minimum: 0 },
          },
        }),
        responses: {
          '200': res('Updated variant', ref('ItemVariant')),
          '404': errRes('Not found'),
        },
      }),
      delete: secured({
        summary: 'Delete a variant',
        description: 'Returns 409 if this is the last variant on the item. If the deleted variant was the default and siblings remain, the next by sort_order is promoted to default.',
        parameters: [uuidParam('id', 'Variant id')],
        responses: {
          '204': res('Deleted'),
          '404': errRes('Not found'),
          '409': res('Last variant on item — delete the item instead', ref('Error')),
        },
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
      version: '0.2.0',
      description:
        'Multi-tenant restaurant ordering SaaS API. ' +
        'Currently covers: auth (login/refresh/logout/device/invite/signup), ' +
        'superadmin (plans, invites, restaurants, SMTP, billing, audit), and ' +
        'admin (restaurant profile, menu categories, menu items, variants). ' +
        'Tablet and public widget routes land with Slice 3/4 (STORY-044).',
    },
    tags: [
      { name: 'auth', description: 'Login, refresh, logout, device auth, invite validation, signup' },
      { name: 'superadmin', description: 'Platform control plane (Bearer JWT + MFA required)' },
      { name: 'admin', description: 'Restaurant owner operations — profile, menu categories, items, variants (Bearer JWT, restaurant_owner role)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas,
    },
    paths: { ...authPaths(), ...superadminPaths(), ...adminPaths() },
  }
}
