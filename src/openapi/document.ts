/**
 * Hand-authored OpenAPI 3.1 document for all currently-merged routes.
 * Served at `/openapi.json` with Swagger UI at `/docs`.
 *
 * Why hand-authored: every route is a plain Hono handler, so Chanfana's
 * class-based auto-generation produces an empty spec. Converting handlers to
 * `OpenAPIRoute` classes is the job of STORY-044 (Slice 5); until then this
 * module documents the live contract. Keep it in sync when routes change.
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
  ModifierGroup: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      restaurant_id: { type: 'string', format: 'uuid' },
      item_id: { type: 'string', format: 'uuid', nullable: true, description: 'null for global modifier groups' },
      name: { type: 'string' },
      type: { type: 'string', enum: ['single', 'multi'], description: 'single = pick one; multi = pick many' },
      required: { type: 'boolean' },
      availability_state: { type: 'string', enum: ['available', 'unavailable'] },
      sort_order: { type: 'integer' },
      options: { type: 'array', items: { $ref: '#/components/schemas/ModifierOption' } },
    },
  },
  ModifierOption: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      group_id: { type: 'string', format: 'uuid' },
      restaurant_id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      price_delta: { type: 'integer', description: 'Price adjustment in cents (can be negative)' },
      available: { type: 'boolean' },
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
      device_cap: { type: 'integer' },
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
  PlanUsage: {
    type: 'object',
    properties: {
      plan: ref('Plan'),
      usage: {
        type: 'object',
        properties: {
          categories: { type: 'integer' },
          items: { type: 'integer' },
          staff: { type: 'integer' },
          modifiers: { type: 'integer' },
        },
      },
      upgrade_message: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          html: { type: 'string' },
        },
      },
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
      smtp_source: { type: 'string', enum: ['own', 'global'], nullable: true },
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
  StaffMember: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      email: { type: 'string', format: 'email', nullable: true },
      phone: { type: 'string', nullable: true },
      permissions: {
        type: 'array',
        items: { type: 'string', enum: ['orders:accept_reject', 'orders:status', 'inventory:write', 'orders:pause'] },
      },
      active: { type: 'boolean' },
      device_id: { type: 'string', format: 'uuid', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  PauseState: {
    type: 'object',
    properties: {
      orders_paused: { type: 'boolean' },
      pause_mode: { type: 'string', enum: ['timed', 'manual', 'rest_of_day'], nullable: true },
      pause_until: { type: 'string', format: 'date-time', nullable: true },
      pause_reason: { type: 'string', nullable: true },
      pause_scheduled_orders: { type: 'boolean' },
    },
  },
  OperatingHour: {
    type: 'object',
    properties: {
      day_of_week: { type: 'integer', minimum: 0, maximum: 6, description: '0 = Sunday, 6 = Saturday' },
      open_time: { type: 'string', example: '09:00', description: 'HH:MM format' },
      close_time: { type: 'string', example: '21:00', description: 'HH:MM format' },
      active: { type: 'boolean' },
      last_order_offset_minutes: { type: 'integer', description: 'Minutes before close_time when last order is accepted' },
      crosses_midnight: { type: 'boolean', description: 'Computed — true when close_time < open_time' },
    },
  },
  SpecialClosure: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      restaurant_id: { type: 'string', format: 'uuid' },
      closure_type: { type: 'string', enum: ['full', 'partial', 'holiday', 'emergency', 'maintenance', 'special'] },
      date: { type: 'string', format: 'date', example: '2024-12-25' },
      partial_open: { type: 'string', nullable: true, example: '10:00', description: 'Required when closure_type = partial' },
      partial_close: { type: 'string', nullable: true, example: '14:00' },
      recurring: { type: 'boolean' },
      reason: { type: 'string', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  SchedulingConfig: {
    type: 'object',
    properties: {
      base_prep_minutes: { type: 'integer', minimum: 5, maximum: 120 },
      scheduling_interval: { type: 'integer', enum: [15, 30], description: 'Slot interval in minutes' },
      future_days_allowed: { type: 'integer', minimum: 0, maximum: 30 },
    },
  },
  TipsConfig: {
    type: 'object',
    properties: {
      tips_enabled: { type: 'boolean' },
      tip_presets: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 100 }, maxItems: 6, description: 'Percentage presets (e.g. [10, 15, 20])' },
      allow_custom_tip: { type: 'boolean' },
      show_no_tip: { type: 'boolean' },
    },
  },
  TaxConfig: {
    type: 'object',
    properties: {
      tax_enabled: { type: 'boolean' },
      tax_rate: { type: 'number', minimum: 0, maximum: 100, description: 'Tax rate in percent (e.g. 8.5)' },
      tax_inclusive: { type: 'boolean', description: 'true = prices already include tax' },
    },
  },
  AutomationConfig: {
    type: 'object',
    properties: {
      auto_accept: { type: 'boolean', description: 'Auto-accept incoming orders without tablet confirmation' },
      auto_reject_enabled: { type: 'boolean' },
      auto_reject_minutes: { type: 'integer', minimum: 5, maximum: 120, description: 'Minutes after arrival before auto-reject fires' },
    },
  },
  Promotion: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      restaurant_id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      description: { type: 'string', nullable: true },
      promo_code: { type: 'string', nullable: true },
      discount_type: { type: 'string', enum: ['percentage', 'fixed', 'free_item', 'bogo'] },
      discount_value: { type: 'number' },
      free_item_id: { type: 'string', format: 'uuid', nullable: true },
      minimum_order_amount: { type: 'number', nullable: true },
      usage_limit: { type: 'integer', nullable: true },
      usage_count: { type: 'integer' },
      auto_apply: { type: 'boolean' },
      active: { type: 'boolean' },
      start_time: { type: 'string', format: 'date-time', nullable: true },
      end_time: { type: 'string', format: 'date-time', nullable: true },
      active_days: { type: 'array', items: { type: 'string', enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }, nullable: true },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  Notice: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      restaurant_id: { type: 'string', format: 'uuid' },
      type: { type: 'string', enum: ['informational', 'warning', 'emergency', 'promotional'] },
      message: { type: 'string', maxLength: 200 },
      display_locations: {
        type: 'array',
        items: { type: 'string', enum: ['storefront', 'checkout', 'tracking', 'tablet', 'admin'] },
      },
      priority: { type: 'integer', minimum: 0, maximum: 100 },
      starts_at: { type: 'string', format: 'date-time', nullable: true },
      expires_at: { type: 'string', format: 'date-time', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  NotificationConfig: {
    type: 'object',
    properties: {
      trigger_status: {
        type: 'string',
        enum: ['pending_payment', 'scheduled', 'auth_success', 'accepted', 'preparing', 'ready', 'completed', 'rejected', 'missed', 'refunded'],
      },
      send_customer: { type: 'boolean', description: 'Always true for rejected, missed, refunded (non-configurable)' },
      internal_recipients: { type: 'array', items: { type: 'string', format: 'email' } },
      template_override: { type: 'string', nullable: true },
    },
  },
  Transaction: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      status: { type: 'string' },
      total: { type: 'integer', description: 'Total in cents' },
      stripe_intent_id: { type: 'string', nullable: true },
      customer_name: { type: 'string', nullable: true },
      customer_email: { type: 'string', format: 'email', nullable: true },
      refund_id: { type: 'string', nullable: true },
      refunded_at: { type: 'string', format: 'date-time', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  Order: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      restaurant_id: { type: 'string', format: 'uuid' },
      status: {
        type: 'string',
        enum: ['pending_payment', 'scheduled', 'auth_success', 'accepted', 'preparing', 'ready', 'completed', 'rejected', 'missed', 'refunded'],
      },
      payment_method: { type: 'string', enum: ['card', 'pickup', 'delivery'] },
      stripe_intent_id: { type: 'string', nullable: true },
      customer_name: { type: 'string', nullable: true },
      customer_email: { type: 'string', format: 'email', nullable: true },
      total_cents: { type: 'integer' },
      rejection_reason: { type: 'string', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      items: { type: 'array', items: { type: 'object' } },
    },
  },
  PlatformSettings: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      jwt_expiry_minutes: { type: 'integer' },
      global_rate_limit: { type: 'integer' },
      maintenance_mode: { type: 'boolean' },
      support_email: { type: 'string', format: 'email' },
      r2_public_domain: { type: 'string' },
      upgrade_message_title: { type: 'string', nullable: true },
      upgrade_message_html: { type: 'string', nullable: true },
      updated_at: { type: 'string', format: 'date-time' },
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
        description: 'Token carries `imp: true` and `imp_by` claims. Impersonation sessions cannot perform sensitive actions (Stripe key change, payment methods, device rotation). All starts are written to `audit_log`.',
        parameters: [uuidParam('id', 'Restaurant id')],
        responses: {
          '200': res('Impersonation token', {
            type: 'object',
            properties: {
              access_token: { type: 'string' },
              expires_in: { type: 'integer', example: 1800 },
              restaurant_name: { type: 'string' },
            },
          }),
          '404': errRes('Restaurant not found'),
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
    '/superadmin/settings': {
      get: secured({
        summary: 'Get platform settings (singleton row)',
        responses: {
          '200': res('Settings', { type: 'object', properties: { settings: ref('PlatformSettings') } }),
          '404': errRes('Settings row not found'),
        },
      }),
      patch: secured({
        summary: 'Update one or more platform settings fields',
        requestBody: body({
          type: 'object',
          properties: {
            jwt_expiry_minutes: { type: 'integer', minimum: 5, maximum: 10080 },
            global_rate_limit: { type: 'integer', minimum: 1 },
            maintenance_mode: { type: 'boolean' },
            support_email: { type: 'string', format: 'email' },
            r2_public_domain: { type: 'string' },
          },
        }),
        responses: {
          '200': res('Updated', { type: 'object', properties: { ok: { type: 'boolean' } } }),
          '422': errRes('Validation error (at least one field required)'),
        },
      }),
    },
    '/superadmin/settings/webhook-secret': {
      post: secured({
        summary: 'Rotate the platform webhook signing secret',
        description: 'Generates a new 64-character hex secret, saves it, and returns it. This is the only endpoint where the secret is returned — store it immediately.',
        responses: {
          '200': res('New secret', { type: 'object', properties: { webhook_signing_secret: { type: 'string' } } }),
          '500': errRes('DB update failed'),
        },
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
    // ── Restaurant profile ───────────────────────────────────────────────────────

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

    // ── Plan ─────────────────────────────────────────────────────────────────────

    '/admin/plan': {
      get: secured({
        summary: 'Get the plan, current usage counts, and upgrade message',
        description: 'Returns plan limits alongside real-time usage counts for categories, items, staff, and modifier groups. Used by the frontend to render cap indicators and disable buttons at plan limits.',
        responses: {
          '200': res('Plan + usage', ref('PlanUsage')),
          '404': errRes('No plan assigned to this restaurant'),
        },
      }),
    },

    // ── Menu categories ──────────────────────────────────────────────────────────

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

    // ── Menu items ───────────────────────────────────────────────────────────────

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

    // ── Item variants ────────────────────────────────────────────────────────────

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

    // ── Modifier groups & options ────────────────────────────────────────────────

    '/admin/menu/modifiers': {
      get: secured({
        summary: 'List all global modifier groups (item_id IS NULL) with their options',
        description: 'Requires `item_modifiers` feature flag. Returns groups ordered by sort_order, each embedding its options array.',
        responses: {
          '200': res('Modifier groups', {
            type: 'object',
            properties: { groups: { type: 'array', items: ref('ModifierGroup') } },
          }),
          '402': res('Feature locked — plan does not include item_modifiers', ref('Error')),
        },
      }),
      post: secured({
        summary: 'Create a global modifier group',
        description: 'Requires `item_modifiers` feature flag. Returns 402 with `plan_limit_reached` if the modifier cap is exceeded.',
        requestBody: body({
          type: 'object',
          required: ['name', 'type'],
          properties: {
            name: { type: 'string', maxLength: 100 },
            type: { type: 'string', enum: ['single', 'multi'] },
            required: { type: 'boolean', default: false },
            availability_state: { type: 'string', enum: ['available', 'unavailable'], default: 'available' },
          },
        }),
        responses: {
          '201': res('Created modifier group', ref('ModifierGroup')),
          '402': res('Feature locked or plan modifier cap reached', ref('Error')),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/admin/menu/modifiers/{group_id}': {
      patch: secured({
        summary: 'Update a modifier group',
        parameters: [uuidParam('group_id', 'Modifier group id')],
        requestBody: body({
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 100 },
            type: { type: 'string', enum: ['single', 'multi'] },
            required: { type: 'boolean' },
            availability_state: { type: 'string', enum: ['available', 'unavailable'] },
          },
        }),
        responses: {
          '200': res('Updated modifier group', ref('ModifierGroup')),
          '404': errRes('Not found'),
          '422': errRes('No updatable fields'),
        },
      }),
      delete: secured({
        summary: 'Delete a modifier group (hard delete — also deletes child options)',
        parameters: [uuidParam('group_id', 'Modifier group id')],
        responses: {
          '204': res('Deleted'),
          '404': errRes('Not found'),
        },
      }),
    },
    '/admin/menu/modifiers/{group_id}/options': {
      post: secured({
        summary: 'Add an option to a modifier group',
        parameters: [uuidParam('group_id', 'Modifier group id')],
        requestBody: body({
          type: 'object',
          required: ['name', 'price_delta'],
          properties: {
            name: { type: 'string', maxLength: 100 },
            price_delta: { type: 'number', description: 'Price adjustment as display value (e.g. 1.50); stored as cents internally' },
            available: { type: 'boolean', default: true },
          },
        }),
        responses: {
          '201': res('Created modifier option', ref('ModifierOption')),
          '404': errRes('Modifier group not found'),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/admin/menu/modifiers/options/{option_id}': {
      patch: secured({
        summary: 'Update a modifier option',
        parameters: [uuidParam('option_id', 'Modifier option id')],
        requestBody: body({
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 100 },
            price_delta: { type: 'number' },
            available: { type: 'boolean' },
          },
        }),
        responses: {
          '200': res('Updated modifier option', ref('ModifierOption')),
          '404': errRes('Not found'),
          '422': errRes('No updatable fields'),
        },
      }),
      delete: secured({
        summary: 'Delete a modifier option',
        parameters: [uuidParam('option_id', 'Modifier option id')],
        responses: {
          '204': res('Deleted'),
          '404': errRes('Not found'),
        },
      }),
    },

    // ── Operating hours ──────────────────────────────────────────────────────────

    '/admin/hours': {
      get: secured({
        summary: 'Get all 7 operating hour slots (always returns all days; closed days have active=false)',
        description: 'Time strings are normalised to HH:MM (Postgres returns HH:MM:SS, which is stripped).',
        responses: {
          '200': res('Operating hours', {
            type: 'object',
            properties: { hours: { type: 'array', minItems: 7, maxItems: 7, items: ref('OperatingHour') } },
          }),
        },
      }),
      put: secured({
        summary: 'Replace all 7 operating hour slots in one request',
        description: 'Upserts all 7 rows atomically. `crosses_midnight` is computed server-side.',
        requestBody: body({
          type: 'array',
          minItems: 7,
          maxItems: 7,
          items: {
            type: 'object',
            required: ['day_of_week', 'open_time', 'close_time'],
            properties: {
              day_of_week: { type: 'integer', minimum: 0, maximum: 6 },
              open_time: { type: 'string', example: '09:00' },
              close_time: { type: 'string', example: '21:00' },
              active: { type: 'boolean', default: true },
              last_order_offset_minutes: { type: 'integer', minimum: 0, maximum: 240, default: 0 },
            },
          },
        }),
        responses: {
          '200': res('Updated hours', {
            type: 'object',
            properties: { hours: { type: 'array', items: ref('OperatingHour') } },
          }),
          '422': errRes('Validation error (invalid time format, missing day, etc.)'),
        },
      }),
    },
    '/admin/hours/{day}': {
      patch: secured({
        summary: 'Update a single day slot (0 = Sunday … 6 = Saturday)',
        parameters: [{ name: 'day', in: 'path', required: true, schema: { type: 'integer', minimum: 0, maximum: 6 }, description: 'Day of week (0 = Sunday)' }],
        requestBody: body({
          type: 'object',
          properties: {
            open_time: { type: 'string', example: '09:00' },
            close_time: { type: 'string', example: '21:00' },
            active: { type: 'boolean' },
            last_order_offset_minutes: { type: 'integer', minimum: 0, maximum: 240 },
          },
        }),
        responses: {
          '200': res('Updated hour slot', ref('OperatingHour')),
          '404': errRes('No row for this day (PUT the full set first)'),
          '422': errRes('Validation error or invalid day'),
        },
      }),
    },

    // ── Special closures ─────────────────────────────────────────────────────────

    '/admin/closures': {
      get: secured({
        summary: 'List special closures',
        parameters: [queryParam('include_past', 'Include past closures (default: false — future only)', { type: 'boolean' })],
        responses: {
          '200': res('Closures', {
            type: 'object',
            properties: { closures: { type: 'array', items: ref('SpecialClosure') } },
          }),
        },
      }),
      post: secured({
        summary: 'Create a special closure',
        description: 'closure_type = partial requires both partial_open and partial_close. Adds X-Warning: closure-in-past header when the date is in the past.',
        requestBody: body({
          type: 'object',
          required: ['closure_type', 'date'],
          properties: {
            closure_type: { type: 'string', enum: ['full', 'partial', 'holiday', 'emergency', 'maintenance', 'special'] },
            date: { type: 'string', format: 'date', example: '2024-12-25' },
            partial_open: { type: 'string', example: '10:00', description: 'Required when closure_type = partial' },
            partial_close: { type: 'string', example: '14:00', description: 'Required when closure_type = partial' },
            recurring: { type: 'boolean', default: false },
            reason: { type: 'string', maxLength: 500 },
          },
        }),
        responses: {
          '201': res('Created closure', ref('SpecialClosure')),
          '422': errRes('Validation error (e.g. partial times missing)'),
        },
      }),
    },

    // ── Scheduled orders ─────────────────────────────────────────────────────────

    '/admin/scheduling': {
      get: secured({
        summary: 'Get scheduled-orders configuration (prep time, slot interval, future window)',
        responses: {
          '200': res('Scheduling config', ref('SchedulingConfig')),
          '404': errRes('Restaurant not found'),
        },
      }),
      patch: secured({
        summary: 'Update scheduled-orders configuration',
        requestBody: body({
          type: 'object',
          properties: {
            base_prep_minutes: { type: 'integer', minimum: 5, maximum: 120 },
            scheduling_interval: { type: 'integer', enum: [15, 30] },
            future_days_allowed: { type: 'integer', minimum: 0, maximum: 30 },
          },
        }),
        responses: {
          '200': res('Updated config', ref('SchedulingConfig')),
          '422': errRes('No updatable fields / validation error'),
        },
      }),
    },
    '/admin/scheduling/preview': {
      get: secured({
        summary: 'Preview the next 10 available order slots based on current config and hours',
        description: 'Reads scheduling config + hours KV cache, computes slot times from now + base_prep_minutes.',
        responses: {
          '200': res('Slot preview', {
            type: 'object',
            properties: {
              slots: { type: 'array', maxItems: 10, items: { type: 'string', format: 'date-time' } },
            },
          }),
          '404': errRes('Restaurant not found'),
        },
      }),
    },

    // ── Order pause / unpause ────────────────────────────────────────────────────

    '/admin/orders/pause': {
      get: secured({
        summary: 'Get the current pause state of the restaurant',
        responses: {
          '200': res('Pause state', ref('PauseState')),
          '404': errRes('Restaurant not found'),
        },
      }),
      post: secured({
        summary: 'Pause order intake',
        description: 'Kitchen role requires the `orders:pause` permission. Modes: timed (requires duration_minutes), manual (manual unpause required), rest_of_day (reads close_time from hours KV).',
        requestBody: body({
          type: 'object',
          required: ['mode'],
          properties: {
            mode: { type: 'string', enum: ['timed', 'manual', 'rest_of_day'] },
            duration_minutes: { type: 'integer', minimum: 5, maximum: 480, description: 'Required when mode = timed' },
            reason: { type: 'string', maxLength: 200 },
            pause_scheduled_orders: { type: 'boolean', default: false },
          },
        }),
        responses: {
          '200': res('Updated pause state', ref('PauseState')),
          '403': errRes('Kitchen user missing orders:pause permission'),
          '422': errRes('Validation error (e.g. mode = timed but no duration_minutes)'),
        },
      }),
    },
    '/admin/orders/unpause': {
      post: secured({
        summary: 'Resume order intake (clear pause state)',
        description: 'Kitchen role requires the `orders:pause` permission.',
        responses: {
          '200': res('Cleared pause state', ref('PauseState')),
          '403': errRes('Kitchen user missing orders:pause permission'),
        },
      }),
    },

    // ── Active orders ────────────────────────────────────────────────────────────

    '/admin/orders/active': {
      get: secured({
        summary: 'List all in-flight orders for the live admin Orders page',
        description: 'Returns orders in statuses: auth_success, accepted, preparing, ready — ordered newest-first with full order_items.',
        responses: {
          '200': res('Active orders', {
            type: 'object',
            properties: { orders: { type: 'array', items: ref('Order') } },
          }),
        },
      }),
    },

    // ── Order automation ─────────────────────────────────────────────────────────

    '/admin/orders/automation': {
      get: secured({
        summary: 'Get auto-accept and auto-reject settings',
        responses: {
          '200': res('Automation config', ref('AutomationConfig')),
          '404': errRes('Restaurant not found'),
        },
      }),
      patch: secured({
        summary: 'Update auto-accept / auto-reject settings',
        requestBody: body({
          type: 'object',
          properties: {
            auto_accept: { type: 'boolean' },
            auto_reject_enabled: { type: 'boolean' },
            auto_reject_minutes: { type: 'integer', minimum: 5, maximum: 120 },
          },
        }),
        responses: {
          '200': res('Updated config', ref('AutomationConfig')),
          '422': errRes('No updatable fields / validation error'),
        },
      }),
    },

    // ── Staff ────────────────────────────────────────────────────────────────────

    '/admin/staff': {
      get: secured({
        summary: 'List all kitchen staff members',
        responses: {
          '200': res('Staff', {
            type: 'object',
            properties: { staff: { type: 'array', items: ref('StaffMember') } },
          }),
        },
      }),
    },
    '/admin/staff/invite': {
      post: secured({
        summary: 'Invite a kitchen staff member by email (owner-only)',
        description: 'Sends a Supabase auth invite email, then creates a `users` row. Checks staff_cap from the plan.',
        requestBody: body({
          type: 'object',
          required: ['name', 'email', 'permissions'],
          properties: {
            name: { type: 'string', maxLength: 100 },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string', enum: ['orders:accept_reject', 'orders:status', 'inventory:write', 'orders:pause'] },
            },
          },
        }),
        responses: {
          '201': res('Created staff member', ref('StaffMember')),
          '402': res('Staff cap reached', ref('Error')),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/admin/staff/device': {
      post: secured({
        summary: 'Create a tablet device account and return a one-time device token (owner-only)',
        description: 'Generates a KV-backed device token (dt_…, 90-day TTL). The token is never stored in plaintext and never returned again — enter it on the tablet immediately.',
        requestBody: body({
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', maxLength: 100, description: 'Display name shown on the tablet' },
          },
        }),
        responses: {
          '201': res('Device token + staff row', {
            type: 'object',
            properties: {
              device_token: { type: 'string', example: 'dt_…', description: 'One-time token — store immediately, never returned again' },
              staff: ref('StaffMember'),
            },
          }),
          '402': res('Staff cap reached', ref('Error')),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/admin/staff/{id}': {
      patch: secured({
        summary: 'Update a kitchen staff member (name, phone, permissions)',
        parameters: [uuidParam('id', 'Staff member id (users.id)')],
        requestBody: body({
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 100 },
            phone: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string', enum: ['orders:accept_reject', 'orders:status', 'inventory:write', 'orders:pause'] },
            },
          },
        }),
        responses: {
          '200': res('Updated staff member', ref('StaffMember')),
          '404': errRes('Not found'),
          '422': errRes('No updatable fields / validation error'),
        },
      }),
      delete: secured({
        summary: 'Deactivate a kitchen staff member (soft-delete, sets active=false)',
        parameters: [uuidParam('id', 'Staff member id (users.id)')],
        responses: {
          '204': res('Deactivated'),
          '404': errRes('Not found'),
        },
      }),
    },
    '/admin/staff/device/{id}': {
      delete: secured({
        summary: 'Revoke a tablet device token and deactivate the device account (owner-only)',
        description: 'Looks up the users row by primary key, uses device_id from that row to O(1)-revoke both KV entries (primary token + secondary index), then sets users.active = false.',
        parameters: [uuidParam('id', 'Staff member id (users.id) — NOT the device_id')],
        responses: {
          '204': res('Revoked and deactivated'),
          '404': errRes('Not found or already deactivated'),
        },
      }),
    },

    // ── Stripe / payment config ──────────────────────────────────────────────────

    '/admin/payments/stripe': {
      get: secured({
        summary: 'Get Stripe connection status (publishable key + has_secret flag, never the secret)',
        responses: {
          '200': res('Stripe status', {
            type: 'object',
            properties: {
              publishable_key: { type: 'string', nullable: true },
              has_secret: { type: 'boolean' },
              updated_at: { type: 'string', format: 'date-time', nullable: true },
            },
          }),
        },
      }),
      post: secured({
        summary: 'Save Stripe keys (verifies with Stripe API before encrypting, owner-only)',
        description: 'Validates keys against Stripe, seals the secret key with AES-256-GCM. The secret is never returned after saving.',
        requestBody: body({
          type: 'object',
          required: ['secret_key', 'publishable_key'],
          properties: {
            secret_key: { type: 'string', pattern: '^sk_(live|test)_', description: 'Write-only — sealed at rest, never returned' },
            publishable_key: { type: 'string', pattern: '^pk_(live|test)_' },
          },
        }),
        responses: {
          '200': res('Saved', {
            type: 'object',
            properties: {
              publishable_key: { type: 'string' },
              has_secret: { type: 'boolean', example: true },
              updated_at: { type: 'string', format: 'date-time' },
            },
          }),
          '422': res('Invalid Stripe key (rejected by Stripe API)', ref('Error')),
        },
      }),
      delete: secured({
        summary: 'Remove Stripe keys (nulls both fields in payment_config, owner-only)',
        responses: { '204': res('Removed') },
      }),
    },
    '/admin/payments/methods': {
      patch: secured({
        summary: 'Set accepted payment methods (validated against plan allowlist)',
        requestBody: body({
          type: 'object',
          required: ['payment_methods'],
          properties: {
            payment_methods: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', enum: ['card', 'pickup', 'delivery'] },
            },
          },
        }),
        responses: {
          '200': res('Updated methods', {
            type: 'object',
            properties: {
              payment_methods: { type: 'array', items: { type: 'string' } },
              updated_at: { type: 'string', format: 'date-time' },
            },
          }),
          '402': res('One or more methods not allowed by plan', {
            type: 'object',
            properties: {
              error: { type: 'string' },
              disallowed: { type: 'array', items: { type: 'string' } },
              allowed: { type: 'array', items: { type: 'string' } },
            },
          }),
        },
      }),
    },
    '/admin/payments/note': {
      patch: secured({
        summary: 'Update the pickup/delivery customer note shown on the storefront',
        requestBody: body({
          type: 'object',
          required: ['pickup_delivery_note'],
          properties: {
            pickup_delivery_note: { type: 'string', maxLength: 500, nullable: true },
          },
        }),
        responses: {
          '200': res('Updated', {
            type: 'object',
            properties: { pickup_delivery_note: { type: 'string', nullable: true } },
          }),
        },
      }),
    },

    // ── Admin SMTP ───────────────────────────────────────────────────────────────

    '/admin/smtp': {
      get: secured({
        summary: 'Get SMTP config (own config takes priority over global fallback)',
        description: 'Returns smtp_source: "own" if the restaurant has its own config, "global" if using platform default, null if nothing is configured.',
        responses: {
          '200': res('SMTP config', ref('SmtpConfig')),
        },
      }),
      post: secured({
        summary: 'Save per-restaurant SMTP config (tests credentials before saving, owner-only)',
        description: 'Sends a test email to the owner\'s address before saving. Password is sealed at rest and never returned.',
        requestBody: body({
          type: 'object',
          required: ['host', 'port', 'username', 'password', 'from_email', 'from_name'],
          properties: {
            host: { type: 'string' },
            port: { type: 'integer', minimum: 1, maximum: 65535 },
            username: { type: 'string' },
            password: { type: 'string', description: 'Write-only — sealed at rest, never returned' },
            from_email: { type: 'string', format: 'email' },
            from_name: { type: 'string', maxLength: 100 },
          },
        }),
        responses: {
          '201': res('Saved SMTP config', ref('SmtpConfig')),
          '422': res('SMTP connection test failed or validation error', ref('Error')),
        },
      }),
      delete: secured({
        summary: 'Remove per-restaurant SMTP config (falls back to global, owner-only)',
        responses: { '204': res('Removed') },
      }),
    },
    '/admin/smtp/test': {
      post: secured({
        summary: 'Send a test email via the currently-configured SMTP to the owner\'s address',
        responses: {
          '200': res('Sent', { type: 'object', properties: { sent_to: { type: 'string', format: 'email' } } }),
          '422': res('SMTP send failed', ref('Error')),
        },
      }),
    },

    // ── Notification config ──────────────────────────────────────────────────────

    '/admin/notifications': {
      get: secured({
        summary: 'Get notification config for all 10 order statuses',
        description: 'Always returns all statuses. Statuses without a DB row use defaults. rejected/missed/refunded always have send_customer = true (non-configurable).',
        responses: {
          '200': res('Notification configs', {
            type: 'object',
            properties: { notifications: { type: 'array', items: ref('NotificationConfig') } },
          }),
        },
      }),
      put: secured({
        summary: 'Batch-upsert notification configs',
        description: 'Replaces configs for the supplied statuses. Returns 422 if send_customer = false is supplied for rejected/missed/refunded.',
        requestBody: body({
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['trigger_status', 'send_customer'],
            properties: {
              trigger_status: { type: 'string' },
              send_customer: { type: 'boolean' },
              internal_recipients: { type: 'array', items: { type: 'string', format: 'email' } },
              template_override: { type: 'string', nullable: true },
            },
          },
        }),
        responses: {
          '200': res('Updated configs', {
            type: 'object',
            properties: { notifications: { type: 'array', items: ref('NotificationConfig') } },
          }),
          '422': errRes('send_customer cannot be disabled for mandatory statuses'),
        },
      }),
    },
    '/admin/notifications/preview/{status}': {
      post: secured({
        summary: 'Send a preview notification email for a given status to the owner\'s address',
        parameters: [stringPathParam('status', 'Order status to preview (e.g. accepted, ready, rejected)')],
        responses: {
          '200': res('Sent', {
            type: 'object',
            properties: {
              sent_to: { type: 'string', format: 'email' },
              status: { type: 'string' },
            },
          }),
          '422': errRes('Invalid status or send failed'),
        },
      }),
    },

    // ── Tips & tax ───────────────────────────────────────────────────────────────

    '/admin/tips': {
      get: secured({
        summary: 'Get tip settings',
        responses: { '200': res('Tips config', ref('TipsConfig')), '404': errRes('Not found') },
      }),
      patch: secured({
        summary: 'Update tip settings',
        description: 'If tips_enabled = true, at least one of allow_custom_tip or show_no_tip must be true.',
        requestBody: body({
          type: 'object',
          properties: {
            tips_enabled: { type: 'boolean' },
            tip_presets: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 100 }, maxItems: 6 },
            allow_custom_tip: { type: 'boolean' },
            show_no_tip: { type: 'boolean' },
          },
        }),
        responses: {
          '200': res('Updated tips config', ref('TipsConfig')),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/admin/tax': {
      get: secured({
        summary: 'Get tax settings',
        responses: { '200': res('Tax config', ref('TaxConfig')), '404': errRes('Not found') },
      }),
      patch: secured({
        summary: 'Update tax settings',
        description: 'When tax_enabled = true and tax_rate is supplied, tax_rate must be positive.',
        requestBody: body({
          type: 'object',
          properties: {
            tax_enabled: { type: 'boolean' },
            tax_rate: { type: 'number', minimum: 0, maximum: 100 },
            tax_inclusive: { type: 'boolean' },
          },
        }),
        responses: {
          '200': res('Updated tax config', ref('TaxConfig')),
          '422': errRes('Validation error'),
        },
      }),
    },

    // ── Promotions ───────────────────────────────────────────────────────────────

    '/admin/promotions': {
      get: secured({
        summary: 'List all promotions (newest first)',
        responses: {
          '200': res('Promotions', {
            type: 'object',
            properties: { promotions: { type: 'array', items: ref('Promotion') } },
          }),
        },
      }),
      post: secured({
        summary: 'Create a promotion (requires promotions_enabled feature flag)',
        description: 'Either promo_code or auto_apply must be set. free_item_id required for free_item/bogo types.',
        requestBody: body({
          type: 'object',
          required: ['title', 'discount_type', 'discount_value'],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            promo_code: { type: 'string', maxLength: 20 },
            discount_type: { type: 'string', enum: ['percentage', 'fixed', 'free_item', 'bogo'] },
            discount_value: { type: 'number', minimum: 0 },
            free_item_id: { type: 'string', format: 'uuid' },
            minimum_order_amount: { type: 'number', minimum: 0 },
            usage_limit: { type: 'integer', minimum: 1 },
            auto_apply: { type: 'boolean', default: false },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            active_days: { type: 'array', items: { type: 'string', enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } },
          },
        }),
        responses: {
          '201': res('Created promotion', { type: 'object', properties: { promotion: ref('Promotion') } }),
          '402': res('Feature locked — promotions_enabled is false', ref('Error')),
          '409': errRes('Duplicate promo_code'),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/admin/promotions/{id}': {
      patch: secured({
        summary: 'Update a promotion (title, dates, limits — not type or promo code)',
        parameters: [uuidParam('id', 'Promotion id')],
        requestBody: body({
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            discount_value: { type: 'number', minimum: 0.01 },
            minimum_order_amount: { type: 'number', minimum: 0 },
            usage_limit: { type: 'integer', minimum: 1 },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            active_days: { type: 'array', items: { type: 'string', enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } },
          },
        }),
        responses: {
          '200': res('Updated promotion', { type: 'object', properties: { promotion: ref('Promotion') } }),
          '404': errRes('Not found'),
          '422': errRes('Validation error'),
        },
      }),
      delete: secured({
        summary: 'Delete a promotion (fails with 409 if usage_count > 0)',
        description: 'Deactivate via PATCH /{id}/toggle instead of deleting a used promotion.',
        parameters: [uuidParam('id', 'Promotion id')],
        responses: {
          '204': res('Deleted'),
          '404': errRes('Not found'),
          '409': errRes('Promotion has usage — deactivate instead'),
        },
      }),
    },
    '/admin/promotions/{id}/toggle': {
      patch: secured({
        summary: 'Toggle the active state of a promotion',
        parameters: [uuidParam('id', 'Promotion id')],
        responses: {
          '200': res('Updated promotion', ref('Promotion')),
          '404': errRes('Not found'),
        },
      }),
    },

    // ── Notices ──────────────────────────────────────────────────────────────────

    '/admin/notices': {
      get: secured({
        summary: 'List all notices (ordered by priority descending)',
        responses: {
          '200': res('Notices', {
            type: 'object',
            properties: { notices: { type: 'array', items: ref('Notice') } },
          }),
        },
      }),
      post: secured({
        summary: 'Create a notice (broadcasts notice_created on Realtime channel)',
        requestBody: body({
          type: 'object',
          required: ['type', 'message', 'display_locations'],
          properties: {
            type: { type: 'string', enum: ['informational', 'warning', 'emergency', 'promotional'] },
            message: { type: 'string', maxLength: 200 },
            display_locations: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', enum: ['storefront', 'checkout', 'tracking', 'tablet', 'admin'] },
            },
            priority: { type: 'integer', minimum: 0, maximum: 100, default: 0 },
            starts_at: { type: 'string', format: 'date-time' },
            expires_at: { type: 'string', format: 'date-time' },
          },
        }),
        responses: {
          '201': res('Created notice', ref('Notice')),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/admin/notices/{id}': {
      patch: secured({
        summary: 'Update a notice (broadcasts notice_created on Realtime channel)',
        parameters: [uuidParam('id', 'Notice id')],
        requestBody: body({
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['informational', 'warning', 'emergency', 'promotional'] },
            message: { type: 'string', maxLength: 200 },
            display_locations: { type: 'array', minItems: 1, items: { type: 'string' } },
            priority: { type: 'integer', minimum: 0, maximum: 100 },
            starts_at: { type: 'string', format: 'date-time' },
            expires_at: { type: 'string', format: 'date-time' },
          },
        }),
        responses: {
          '200': res('Updated notice', ref('Notice')),
          '404': errRes('Not found'),
        },
      }),
      delete: secured({
        summary: 'Delete a notice (broadcasts notice_removed on Realtime channel)',
        parameters: [uuidParam('id', 'Notice id')],
        responses: {
          '204': res('Deleted'),
          '404': errRes('Not found'),
        },
      }),
    },

    // ── Transactions ─────────────────────────────────────────────────────────────

    '/admin/transactions': {
      get: secured({
        summary: 'List transactions (paginated, limited by plan transaction_history_days)',
        description: 'Page size is 50. The history window is controlled by `transaction_history_days` in the plan (default 30 days).',
        parameters: [queryParam('page', 'Page number', { type: 'integer' })],
        responses: {
          '200': res('Transactions', {
            type: 'object',
            properties: {
              transactions: { type: 'array', items: ref('Transaction') },
              total: { type: 'integer' },
              page: { type: 'integer' },
              page_size: { type: 'integer', example: 50 },
              history_days: { type: 'integer' },
            },
          }),
        },
      }),
    },
    '/admin/transactions/{order_id}': {
      get: secured({
        summary: 'Get full order details for a single transaction',
        parameters: [uuidParam('order_id', 'Order id')],
        responses: {
          '200': res('Order detail', ref('Order')),
          '404': errRes('Not found'),
        },
      }),
    },
    '/admin/transactions/{order_id}/refund': {
      post: secured({
        summary: 'Issue a Stripe refund for a completed/missed/rejected order',
        description: 'Decrypts the restaurant\'s Stripe secret key, calls Stripe refunds API, then sets order.status = refunded. Returns 409 if already refunded.',
        parameters: [uuidParam('order_id', 'Order id')],
        requestBody: body({
          type: 'object',
          properties: {
            amount_cents: { type: 'integer', minimum: 1, description: 'Partial refund amount in cents. Omit for full refund.' },
            reason: { type: 'string', enum: ['duplicate', 'fraudulent', 'requested_by_customer'] },
          },
        }),
        responses: {
          '200': res('Refunded order', ref('Order')),
          '409': errRes('Already refunded'),
          '422': errRes('Order not in a refundable status or no payment intent'),
          '502': errRes('Stripe refund API error'),
        },
      }),
    },
  }
}

function tabletPaths(): Record<string, PathItem> {
  const tags = ['tablet']
  const secured = (op: OperationObject): OperationObject => ({ ...op, tags, security: bearer })

  return {
    // ── Session ──────────────────────────────────────────────────────────────────

    '/tablet/session': {
      get: secured({
        summary: 'Confirm device login and get restaurant pause state',
        description: 'Called on tablet PWA load to validate the device JWT and fetch current pause state.',
        responses: {
          '200': res('Session identity + pause state', {
            type: 'object',
            properties: {
              identity: {
                type: 'object',
                properties: {
                  sub: { type: 'string', format: 'uuid' },
                  role: { type: 'string', example: 'kitchen' },
                  restaurant_id: { type: 'string', format: 'uuid' },
                  device_id: { type: 'string', format: 'uuid' },
                  permissions: { type: 'array', items: { type: 'string' } },
                },
              },
              pause_state: ref('PauseState'),
            },
          }),
        },
      }),
    },

    // ── Orders ───────────────────────────────────────────────────────────────────

    '/tablet/orders': {
      get: secured({
        summary: 'List active orders (auth_success, accepted, preparing, ready) for the kitchen display',
        description: 'Ordered oldest-first (FIFO). Each order embeds order_items and order_item_modifiers.',
        responses: {
          '200': res('Active orders', {
            type: 'object',
            properties: { orders: { type: 'array', items: ref('Order') } },
          }),
        },
      }),
    },
    '/tablet/orders/{id}': {
      get: secured({
        summary: 'Get a single order with full line items and modifiers',
        parameters: [uuidParam('id', 'Order id')],
        responses: {
          '200': res('Order', ref('Order')),
          '404': errRes('Not found'),
        },
      }),
    },
    '/tablet/orders/{id}/accept': {
      post: secured({
        summary: 'Accept an order (requires orders:accept_reject permission)',
        description: 'Order must be in auth_success status. For card payments, captures the Stripe payment intent first. Broadcasts order_accepted on Realtime channel.',
        parameters: [uuidParam('id', 'Order id')],
        responses: {
          '200': res('Accepted order', ref('Order')),
          '403': errRes('Device missing orders:accept_reject permission'),
          '404': errRes('Not found'),
          '409': errRes('Order already accepted'),
          '422': errRes('Order not in auth_success status'),
          '502': errRes('Stripe capture failed'),
        },
      }),
    },
    '/tablet/orders/{id}/reject': {
      post: secured({
        summary: 'Reject an order (requires orders:accept_reject permission)',
        description: 'Order must be in auth_success or accepted. Attempts to cancel the Stripe intent for card orders (failure is logged but does not block). Broadcasts order_rejected.',
        parameters: [uuidParam('id', 'Order id')],
        requestBody: body({
          type: 'object',
          properties: {
            reason: { type: 'string', maxLength: 500, description: 'Optional rejection reason shown to customer' },
          },
        }, false),
        responses: {
          '200': res('Rejected order', ref('Order')),
          '403': errRes('Device missing orders:accept_reject permission'),
          '404': errRes('Not found'),
          '422': errRes('Order not in a rejectable status'),
        },
      }),
    },
    '/tablet/orders/{id}/status': {
      post: secured({
        summary: 'Advance order status (requires orders:status permission)',
        description: 'Valid transitions: accepted → preparing → ready → completed. Any other transition returns 422 with the allowed next statuses.',
        parameters: [uuidParam('id', 'Order id')],
        requestBody: body({
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['preparing', 'ready', 'completed'] },
          },
        }),
        responses: {
          '200': res('Updated order', ref('Order')),
          '403': errRes('Device missing orders:status permission'),
          '404': errRes('Not found'),
          '422': res('Invalid transition', {
            type: 'object',
            properties: {
              error: { type: 'string' },
              current: { type: 'string' },
              allowed: { type: 'array', items: { type: 'string' } },
            },
          }),
        },
      }),
    },

    // ── Inventory ────────────────────────────────────────────────────────────────

    '/tablet/inventory': {
      get: secured({
        summary: 'Get all categories and items with their availability states',
        responses: {
          '200': res('Inventory snapshot', {
            type: 'object',
            properties: {
              categories: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, availability_state: { type: 'string' } } } },
              items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, category_id: { type: 'string', format: 'uuid' }, availability_state: { type: 'string' }, restore_at: { type: 'string', format: 'date-time', nullable: true } } } },
            },
          }),
        },
      }),
    },
    '/tablet/inventory/items/{id}': {
      patch: secured({
        summary: 'Update item availability state from the tablet (requires inventory:write)',
        description: 'Invalidates menu KV cache and broadcasts menu_availability_changed.',
        parameters: [uuidParam('id', 'Item id')],
        requestBody: body({
          type: 'object',
          required: ['availability_state'],
          properties: {
            availability_state: { type: 'string', enum: ['available', 'unavailable', 'scheduled', 'out_of_stock'] },
            restore_at: { type: 'string', format: 'date-time', description: 'Auto-restore timestamp' },
          },
        }),
        responses: {
          '200': res('Updated item', { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, availability_state: { type: 'string' }, restore_at: { type: 'string', nullable: true } } }),
          '403': errRes('Device missing inventory:write permission'),
          '404': errRes('Not found'),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/tablet/inventory/categories/{id}': {
      patch: secured({
        summary: 'Update category availability state from the tablet (requires inventory:write)',
        description: 'Invalidates menu KV cache and broadcasts menu_availability_changed.',
        parameters: [uuidParam('id', 'Category id')],
        requestBody: body({
          type: 'object',
          required: ['availability_state'],
          properties: {
            availability_state: { type: 'string', enum: ['available', 'unavailable', 'scheduled', 'out_of_stock'] },
            restore_at: { type: 'string', format: 'date-time' },
          },
        }),
        responses: {
          '200': res('Updated category', { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, availability_state: { type: 'string' }, restore_at: { type: 'string', nullable: true } } }),
          '403': errRes('Device missing inventory:write permission'),
          '404': errRes('Not found'),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/tablet/inventory/modifiers/options/{id}': {
      patch: secured({
        summary: 'Toggle a modifier option available/unavailable from the tablet (requires inventory:write)',
        description: 'Scope-checks via modifier_groups → menu_items → restaurants. Invalidates menu KV and broadcasts menu_availability_changed.',
        parameters: [uuidParam('id', 'Modifier option id')],
        requestBody: body({
          type: 'object',
          required: ['available'],
          properties: {
            available: { type: 'boolean' },
          },
        }),
        responses: {
          '200': res('Updated option', { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, available: { type: 'boolean' } } }),
          '403': errRes('Device missing inventory:write permission or wrong restaurant'),
          '404': errRes('Not found'),
          '422': errRes('available (boolean) is required'),
        },
      }),
    },

    // ── Tablet pause ─────────────────────────────────────────────────────────────

    '/tablet/orders/pause': {
      post: secured({
        summary: 'Pause order intake from the tablet (requires orders:pause permission)',
        description: 'Supports timed and manual modes only (no rest_of_day on tablet). Broadcasts pause_state_changed.',
        requestBody: body({
          type: 'object',
          required: ['mode'],
          properties: {
            mode: { type: 'string', enum: ['timed', 'manual'] },
            duration_minutes: { type: 'integer', minimum: 5, maximum: 480, description: 'Required when mode = timed' },
            reason: { type: 'string', maxLength: 200 },
            pause_scheduled_orders: { type: 'boolean', default: false },
          },
        }),
        responses: {
          '200': res('Updated pause state', ref('PauseState')),
          '403': errRes('Device missing orders:pause permission'),
          '422': errRes('Validation error'),
        },
      }),
    },
    '/tablet/orders/unpause': {
      post: secured({
        summary: 'Resume order intake from the tablet (requires orders:pause permission)',
        description: 'Broadcasts pause_state_changed with paused: false.',
        responses: {
          '200': res('Cleared pause state', ref('PauseState')),
          '403': errRes('Device missing orders:pause permission'),
        },
      }),
    },
  }
}

/** Build the OpenAPI 3.1 document for all currently-merged routes. */
export function buildOpenApiDocument(): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: {
      title: 'RestroAPI',
      version: '0.3.0',
      description:
        'Multi-tenant restaurant ordering SaaS API. ' +
        'Covers: auth (login/refresh/logout/device/invite/signup), ' +
        'superadmin (plans, invites, restaurants, SMTP, billing, audit, platform settings, impersonation), ' +
        'admin (restaurant profile, plan usage, menu categories/items/variants/modifiers, ' +
        'operating hours, closures, scheduling, pause/unpause, active orders, automation, ' +
        'staff management, Stripe payment config, SMTP, notifications, tips, tax, ' +
        'promotions, notices, transactions/refunds), and ' +
        'tablet (session, orders CRUD/accept/reject/status, inventory, pause/unpause).',
    },
    tags: [
      { name: 'auth', description: 'Login, refresh, logout, device auth, invite validation, signup' },
      { name: 'superadmin', description: 'Platform control plane (Bearer JWT + platform role + MFA required)' },
      { name: 'admin', description: 'Restaurant owner operations (Bearer JWT, restaurant_owner role)' },
      { name: 'tablet', description: 'Kitchen tablet operations (Bearer JWT issued from device token, kitchen role)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas,
    },
    paths: { ...authPaths(), ...superadminPaths(), ...adminPaths(), ...tabletPaths() },
  }
}
