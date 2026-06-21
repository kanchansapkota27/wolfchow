import type {
  AuditEntry,
  AuthSession,
  BillingMonthRow,
  BillingSummaryRow,
  CreateInviteInput,
  CreateInviteResult,
  CreateRestaurantInput,
  Invite,
  InviteSummary,
  ItemVariant,
  MenuCategory,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  Order,
  Plan,
  PlanInput,
  Restaurant,
  RestaurantListItem,
  RestaurantUpdate,
  SmtpConfig,
  SmtpGlobalInput,
  SmtpOverrideInput,
  SmtpOverrideItem,
} from '@wolfchow/types'
import { ApiError } from './errors'

export interface HoursRow {
  day_of_week: number
  open_time: string
  close_time: string
  active: boolean
  last_order_offset_minutes: number
  crosses_midnight?: boolean
}

export interface SchedulingConfig {
  base_prep_minutes: number
  scheduling_interval: 15 | 30
  future_days_allowed: number
}

export interface SpecialClosure {
  id: string
  restaurant_id: string
  closure_type: 'full' | 'partial' | 'holiday' | 'emergency' | 'maintenance' | 'special'
  date: string
  partial_open: string | null
  partial_close: string | null
  recurring: boolean
  reason: string | null
  created_at: string
}

export interface CreateClosureInput {
  closure_type: SpecialClosure['closure_type']
  date: string
  partial_open?: string
  partial_close?: string
  recurring?: boolean
  reason?: string
}

export type StaffPermission = 'orders:accept_reject' | 'orders:status' | 'inventory:write' | 'orders:pause'

export interface StaffMember {
  id: string
  restaurant_id: string
  name: string
  email: string
  phone: string | null
  role: string
  permissions: StaffPermission[]
  active: boolean
  created_at: string
}

export interface DeviceLogin {
  id: string
  name: string
  device_id: string
  permissions: string[]
  active: boolean
}

export interface InviteStaffInput {
  name: string
  email: string
  phone?: string
  permissions: StaffPermission[]
}

export interface PatchStaffInput {
  name?: string
  phone?: string
  permissions?: StaffPermission[]
}

export interface StripeStatus {
  publishable_key: string | null
  has_secret: boolean
  updated_at: string | null
}

export interface PaymentMethods {
  payment_methods: string[]
  pickup_delivery_note: string | null
}

export interface TipsConfig {
  tips_enabled: boolean
  tip_presets: number[]
  allow_custom_tip: boolean
  show_no_tip: boolean
}

export interface TaxConfig {
  tax_enabled: boolean
  tax_rate: number
  tax_inclusive: boolean
}

export interface AutomationConfig {
  auto_accept: boolean
  auto_reject_enabled: boolean
  auto_reject_minutes: number
}

export type SmtpSource = 'own' | 'override' | 'global' | null

export interface AdminSmtpStatus {
  smtp_source: SmtpSource
  host?: string | null
  port?: number | null
  username?: string | null
  from_email?: string | null
  from_name?: string | null
  monthly_limit: number | null
  monthly_used: number
}

export interface SaveSmtpInput {
  host: string
  port: number
  username: string
  password: string
  from_email: string
  from_name: string
}

export type TriggerStatus =
  | 'pending_payment' | 'scheduled' | 'auth_success' | 'accepted'
  | 'preparing' | 'ready' | 'completed' | 'rejected' | 'missed' | 'refunded'

export interface NotificationConfig {
  trigger_status: TriggerStatus
  send_customer: boolean
  internal_recipients: string[]
  template_override: string | null
}

export type DiscountType = 'percentage' | 'fixed' | 'free_item' | 'bogo'
export type ActiveDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export interface Promotion {
  id: string
  restaurant_id: string
  title: string
  description: string | null
  promo_code: string | null
  discount_type: DiscountType
  discount_value: number
  free_item_id: string | null
  minimum_order_amount: number | null
  usage_limit: number | null
  usage_count: number
  auto_apply: boolean
  start_time: string | null
  end_time: string | null
  active_days: ActiveDay[] | null
  active: boolean
  created_at: string
}

export type NoticeType = 'informational' | 'warning' | 'emergency' | 'promotional'
export type NoticeLocation = 'storefront' | 'checkout' | 'tracking' | 'tablet' | 'admin'

export interface Notice {
  id: string
  restaurant_id: string
  type: NoticeType
  message: string
  display_locations: NoticeLocation[]
  priority: number
  starts_at: string | null
  expires_at: string | null
  created_at: string
}

export interface CreateNoticeInput {
  type: NoticeType
  message: string
  display_locations: NoticeLocation[]
  priority?: number
  starts_at?: string
  expires_at?: string
}

export interface CreatePromotionInput {
  title: string
  description?: string
  promo_code?: string
  discount_type: DiscountType
  discount_value: number
  minimum_order_amount?: number
  usage_limit?: number
  auto_apply?: boolean
  start_time?: string
  end_time?: string
  active_days?: ActiveDay[]
}

import { storeSession, type SessionStore } from './session'

export interface ApiClientConfig {
  /** Backend origin, e.g. `https://api.wolfchow.com` (no trailing slash). */
  baseUrl: string
  /** Token storage. */
  session: SessionStore
  /** Override `fetch` (tests inject a fake; defaults to global `fetch`). */
  fetch?: typeof fetch
  /** Called after a refresh attempt fails and the session is cleared. */
  onSessionExpired?: () => void
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** JSON-serialized into the request body. */
  body?: unknown
  /** Appended as a query string; nullish values are skipped. */
  query?: Record<string, string | number | boolean | null | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Skip the `Authorization` header and the 401→refresh flow (e.g. login). */
  skipAuth?: boolean
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions['query'],
): string {
  let url = `${baseUrl}${path}`
  if (query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) params.set(key, String(value))
    }
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }
  return url
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Build an API client bound to a backend origin and a session store.
 *
 * `apiFetch` adds the bearer token, serializes JSON, and throws a typed
 * `ApiError` on any non-2xx. On a 401 it transparently attempts a single token
 * refresh (de-duplicated across concurrent requests) and retries the original
 * request once; if the refresh also fails it clears the session, invokes
 * `onSessionExpired`, and throws.
 */
export function createApiClient(config: ApiClientConfig) {
  const doFetch = config.fetch ?? fetch
  const { baseUrl, session } = config
  let refreshInFlight: Promise<boolean> | null = null

  async function refreshTokens(): Promise<boolean> {
    const refreshToken = session.getRefreshToken()
    if (!refreshToken) return false
    try {
      const res = await doFetch(buildUrl(baseUrl, '/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) return false
      const data = (await parseBody(res)) as AuthSession
      if (!data?.access_token || !data?.refresh_token) return false
      storeSession(session, data)
      return true
    } catch {
      return false
    }
  }

  /** Single-flight refresh: concurrent 401s share one refresh request. */
  function refreshOnce(): Promise<boolean> {
    if (!refreshInFlight) {
      refreshInFlight = refreshTokens().finally(() => {
        refreshInFlight = null
      })
    }
    return refreshInFlight
  }

  async function send(path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { ...options.headers }
    if (options.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
    if (!options.skipAuth) {
      const token = session.getAccessToken()
      if (token) headers['Authorization'] = `Bearer ${token}`
    }
    return doFetch(buildUrl(baseUrl, path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  }

  async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let res = await send(path, options)

    if (res.status === 401 && !options.skipAuth) {
      const refreshed = await refreshOnce()
      if (refreshed) {
        res = await send(path, options)
      } else {
        session.clear()
        config.onSessionExpired?.()
        throw new ApiError(401, await parseBody(res))
      }
    }

    const body = await parseBody(res)
    if (!res.ok) throw new ApiError(res.status, body)
    return body as T
  }

  // ── Named route functions (mirror the merged backend routes) ────────────────

  const auth = {
    login: (email: string, password: string) =>
      apiFetch<AuthSession>('/auth/login', {
        method: 'POST',
        body: { email, password },
        skipAuth: true,
      }).then((s) => {
        storeSession(session, s)
        return s
      }),
    logout: () => {
      const refresh_token = session.getRefreshToken()
      return apiFetch<void>('/auth/logout', {
        method: 'POST',
        body: { refresh_token },
      }).finally(() => session.clear())
    },
    device: (device_token: string) =>
      apiFetch<AuthSession>('/auth/device', {
        method: 'POST',
        body: { device_token },
        skipAuth: true,
      }),
    getInvite: (token: string) =>
      apiFetch<Invite>(`/auth/invite/${encodeURIComponent(token)}`, { skipAuth: true }),
  }

  const superadmin = {
    session: () => apiFetch<{ sub: string; role: string }>('/superadmin/session'),
    listPlans: () => apiFetch<{ plans: Plan[] }>('/superadmin/plans'),
    createPlan: (data: PlanInput) =>
      apiFetch<{ plan: Plan }>('/superadmin/plans', { method: 'POST', body: data }).then((r) => r.plan),
    updatePlan: (id: string, data: Partial<PlanInput>) =>
      apiFetch<{ plan: Plan }>(`/superadmin/plans/${id}`, { method: 'PATCH', body: data }).then((r) => r.plan),
    deletePlan: (id: string) =>
      apiFetch<void>(`/superadmin/plans/${id}`, { method: 'DELETE' }),
    listInvites: () => apiFetch<{ invites: InviteSummary[] }>('/superadmin/invites'),
    createInvite: (data: CreateInviteInput) =>
      apiFetch<CreateInviteResult>('/superadmin/invites', { method: 'POST', body: data }),
    revokeInvite: (id: string) =>
      apiFetch<void>(`/superadmin/invites/${id}`, { method: 'DELETE' }),
    createRestaurant: (data: CreateRestaurantInput) =>
      apiFetch<{ restaurant: Pick<Restaurant, 'id' | 'slug' | 'display_name' | 'business_name' | 'created_at'> }>(
        '/superadmin/restaurants',
        { method: 'POST', body: data },
      ),
    listRestaurants: (query?: RequestOptions['query']) =>
      apiFetch<{
        restaurants: RestaurantListItem[]
        page: number
        page_size: number
        total: number
      }>('/superadmin/restaurants', { query }),
    getRestaurant: (id: string) =>
      apiFetch<{ restaurant: Restaurant }>(`/superadmin/restaurants/${id}`).then((r) => r.restaurant),
    updateRestaurant: (id: string, data: RestaurantUpdate) =>
      apiFetch<{ restaurant: Partial<Restaurant> }>(`/superadmin/restaurants/${id}`, {
        method: 'PATCH',
        body: data,
      }).then((r) => r.restaurant),
    suspendRestaurant: (id: string) =>
      apiFetch<{ id: string; active: boolean }>(`/superadmin/restaurants/${id}/suspend`, {
        method: 'POST',
      }),
    reactivateRestaurant: (id: string) =>
      apiFetch<{ id: string; active: boolean }>(`/superadmin/restaurants/${id}/reactivate`, {
        method: 'POST',
      }),
    impersonate: (id: string) =>
      apiFetch<{ access_token: string; expires_in: number }>(
        `/superadmin/restaurants/${id}/impersonate`,
        { method: 'POST' },
      ),
    getSmtpGlobal: () =>
      apiFetch<{ config: SmtpConfig }>('/superadmin/smtp/global'),
    putSmtpGlobal: (data: SmtpGlobalInput) =>
      apiFetch<{ ok: boolean }>('/superadmin/smtp/global', { method: 'POST', body: data }),
    testSmtpGlobal: () =>
      apiFetch<{ ok: boolean; sent_to: string }>('/superadmin/smtp/test', { method: 'POST' }),
    listSmtpOverrides: () =>
      apiFetch<{ overrides: SmtpOverrideItem[] }>('/superadmin/smtp/overrides'),
    putSmtpOverride: (restaurantId: string, data: SmtpOverrideInput) =>
      apiFetch<{ ok: boolean }>(`/superadmin/smtp/restaurants/${restaurantId}`, {
        method: 'POST',
        body: data,
      }),
    deleteSmtpOverride: (restaurantId: string) =>
      apiFetch<void>(`/superadmin/smtp/restaurants/${restaurantId}`, { method: 'DELETE' }),
    getBilling: () =>
      apiFetch<{ summary: BillingSummaryRow[]; cached: boolean }>('/superadmin/billing'),
    getRestaurantBilling: (id: string) =>
      apiFetch<{ months: BillingMonthRow[] }>(`/superadmin/billing/${id}`),
    listAudit: (query?: RequestOptions['query']) =>
      apiFetch<{ entries: AuditEntry[]; page: number; page_size: number; total: number }>('/superadmin/audit', { query }),
  }

  // Forward-looking named functions for routes landing in later slices. They are
  // typed against the shared contract today so apps can build against them.
  const menu = {
    getMenu: (slug: string) => apiFetch<{ categories: unknown[] }>(`/public/${slug}/menu`, { skipAuth: true }),
  }
  const orders = {
    acceptOrder: (orderId: string) =>
      apiFetch<Order>(`/tablet/orders/${orderId}/accept`, { method: 'POST' }),
    rejectOrder: (orderId: string, reason?: string) =>
      apiFetch<Order>(`/tablet/orders/${orderId}/reject`, { method: 'POST', body: { reason } }),
  }

  const admin = {
    getRestaurant: () =>
      apiFetch<{ restaurant: Restaurant }>('/admin/restaurant').then((r) => r.restaurant),
    patchRestaurant: (data: Partial<Pick<Restaurant, 'display_name' | 'business_name' | 'address' | 'cuisine_type' | 'services_offered'>>) =>
      apiFetch<{ restaurant: Partial<Restaurant> }>('/admin/restaurant', { method: 'PATCH', body: data }).then((r) => r.restaurant),
    patchProfile: (data: { name?: string; phone?: string }) =>
      apiFetch<{ ok: boolean }>('/admin/restaurant/profile', { method: 'PATCH', body: data }),
    changePassword: (data: { current_password: string; new_password: string }) =>
      apiFetch<{ ok: boolean }>('/admin/restaurant/password', { method: 'PATCH', body: data }),
    getLogoUploadUrl: () =>
      apiFetch<{ upload_url: string; r2_key: string }>('/admin/restaurant/logo', { method: 'POST' }),
    // ── Menu ────────────────────────────────────────────────────────────────────
    listCategories: () =>
      apiFetch<{ categories: MenuCategory[] }>('/admin/menu/categories').then((r) => r.categories),
    createCategory: (data: { name: string; active?: boolean }) =>
      apiFetch<{ category: MenuCategory }>('/admin/menu/categories', { method: 'POST', body: data }).then((r) => r.category),
    updateCategory: (id: string, data: { name?: string; active?: boolean }) =>
      apiFetch<{ category: MenuCategory }>(`/admin/menu/categories/${id}`, { method: 'PATCH', body: data }).then((r) => r.category),
    deleteCategory: (id: string) =>
      apiFetch<void>(`/admin/menu/categories/${id}`, { method: 'DELETE' }),
    reorderCategories: (order: Array<{ id: string; sort_order: number }>) =>
      apiFetch<{ ok: boolean }>('/admin/menu/categories/reorder', { method: 'POST', body: { order } }),
    listItems: (categoryId: string) =>
      apiFetch<{ items: MenuItem[] }>(`/admin/menu/items?category_id=${categoryId}`).then((r) => r.items),
    createItem: (data: Record<string, unknown>) =>
      apiFetch<{ item: MenuItem }>('/admin/menu/items', { method: 'POST', body: data }).then((r) => r.item),
    updateItem: (id: string, data: Record<string, unknown>) =>
      apiFetch<{ item: MenuItem }>(`/admin/menu/items/${id}`, { method: 'PATCH', body: data }).then((r) => r.item),
    deleteItem: (id: string) =>
      apiFetch<void>(`/admin/menu/items/${id}`, { method: 'DELETE' }),
    getItemImageUrl: (id: string) =>
      apiFetch<{ upload_url: string; r2_key: string }>(`/admin/menu/items/${id}/image`, { method: 'POST' }),
    createVariant: (itemId: string, data: Record<string, unknown>) =>
      apiFetch<{ variant: ItemVariant }>(`/admin/menu/items/${itemId}/variants`, { method: 'POST', body: data }).then((r) => r.variant),
    updateVariant: (itemId: string, variantId: string, data: Record<string, unknown>) =>
      apiFetch<{ variant: ItemVariant }>(`/admin/menu/items/${itemId}/variants/${variantId}`, { method: 'PATCH', body: data }).then((r) => r.variant),
    deleteVariant: (itemId: string, variantId: string) =>
      apiFetch<void>(`/admin/menu/items/${itemId}/variants/${variantId}`, { method: 'DELETE' }),
    listModifierGroups: (itemId: string) =>
      apiFetch<{ groups: ModifierGroup[] }>(`/admin/menu/items/${itemId}/modifiers`).then((r) => r.groups),
    createModifierGroup: (itemId: string, data: Record<string, unknown>) =>
      apiFetch<{ group: ModifierGroup }>(`/admin/menu/items/${itemId}/modifiers`, { method: 'POST', body: data }).then((r) => r.group),
    updateModifierGroup: (itemId: string, groupId: string, data: Record<string, unknown>) =>
      apiFetch<{ group: ModifierGroup }>(`/admin/menu/items/${itemId}/modifiers/${groupId}`, { method: 'PATCH', body: data }).then((r) => r.group),
    deleteModifierGroup: (itemId: string, groupId: string) =>
      apiFetch<void>(`/admin/menu/items/${itemId}/modifiers/${groupId}`, { method: 'DELETE' }),
    createModifierOption: (itemId: string, groupId: string, data: Record<string, unknown>) =>
      apiFetch<{ option: ModifierOption }>(`/admin/menu/items/${itemId}/modifiers/${groupId}/options`, { method: 'POST', body: data }).then((r) => r.option),
    // ── Hours & Scheduling ───────────────────────────────────────────────────
    getHours: () =>
      apiFetch<{ hours: HoursRow[] }>('/admin/hours').then((r) => r.hours),
    putHours: (hours: HoursRow[]) =>
      apiFetch<{ hours: HoursRow[] }>('/admin/hours', { method: 'PUT', body: hours }).then((r) => r.hours),
    getScheduling: () =>
      apiFetch<SchedulingConfig>('/admin/scheduling'),
    patchScheduling: (data: Partial<SchedulingConfig>) =>
      apiFetch<SchedulingConfig>('/admin/scheduling', { method: 'PATCH', body: data }),
    getSchedulingPreview: () =>
      apiFetch<{ slots: string[] }>('/admin/scheduling/preview').then((r) => r.slots),
    listClosures: (includePast?: boolean) =>
      apiFetch<{ closures: SpecialClosure[] }>('/admin/closures', { query: { include_past: includePast ? 'true' : undefined } }).then((r) => r.closures),
    createClosure: (data: CreateClosureInput) =>
      apiFetch<{ closure: SpecialClosure }>('/admin/closures', { method: 'POST', body: data }).then((r) => r.closure),
    deleteClosure: (id: string) =>
      apiFetch<void>(`/admin/closures/${id}`, { method: 'DELETE' }),
    // ── Staff ────────────────────────────────────────────────────────────────
    listStaff: () =>
      apiFetch<{ staff: StaffMember[] }>('/admin/staff').then((r) => r.staff),
    inviteStaff: (data: InviteStaffInput) =>
      apiFetch<{ ok: boolean }>('/admin/staff/invite', { method: 'POST', body: data }),
    updateStaff: (id: string, data: PatchStaffInput) =>
      apiFetch<{ member: StaffMember }>(`/admin/staff/${id}`, { method: 'PATCH', body: data }).then((r) => r.member),
    deactivateStaff: (id: string) =>
      apiFetch<void>(`/admin/staff/${id}`, { method: 'DELETE' }),
    createDevice: (name: string) =>
      apiFetch<{ device_token: string; staff: DeviceLogin }>('/admin/staff/device', { method: 'POST', body: { name } }),
    revokeDevice: (id: string) =>
      apiFetch<void>(`/admin/staff/device/${id}`, { method: 'DELETE' }),
    // ── Payments ─────────────────────────────────────────────────────────────
    getStripeStatus: () =>
      apiFetch<StripeStatus>('/admin/payments/stripe'),
    saveStripeKeys: (data: { secret_key: string; publishable_key: string }) =>
      apiFetch<StripeStatus>('/admin/payments/stripe', { method: 'POST', body: data }),
    deleteStripeKeys: () =>
      apiFetch<void>('/admin/payments/stripe', { method: 'DELETE' }),
    getPaymentMethods: () =>
      apiFetch<PaymentMethods>('/admin/payments/methods'),
    patchPaymentMethods: (payment_methods: string[]) =>
      apiFetch<PaymentMethods>('/admin/payments/methods', { method: 'PATCH', body: { payment_methods } }),
    patchPickupNote: (pickup_delivery_note: string | null) =>
      apiFetch<{ ok: boolean }>('/admin/payments/note', { method: 'PATCH', body: { pickup_delivery_note } }),
    // ── Tips & Tax ───────────────────────────────────────────────────────────
    getTips: () =>
      apiFetch<TipsConfig>('/admin/tips'),
    patchTips: (data: Partial<TipsConfig>) =>
      apiFetch<TipsConfig>('/admin/tips', { method: 'PATCH', body: data }),
    getTax: () =>
      apiFetch<TaxConfig>('/admin/tax'),
    patchTax: (data: Partial<TaxConfig>) =>
      apiFetch<TaxConfig>('/admin/tax', { method: 'PATCH', body: data }),
    // ── Ordering Automation ──────────────────────────────────────────────────
    getAutomation: () =>
      apiFetch<AutomationConfig>('/admin/orders/automation'),
    patchAutomation: (data: Partial<AutomationConfig>) =>
      apiFetch<AutomationConfig>('/admin/orders/automation', { method: 'PATCH', body: data }),
    // ── Admin SMTP ───────────────────────────────────────────────────────────
    getAdminSmtp: () =>
      apiFetch<AdminSmtpStatus>('/admin/smtp'),
    saveAdminSmtp: (data: SaveSmtpInput) =>
      apiFetch<AdminSmtpStatus>('/admin/smtp', { method: 'POST', body: data }),
    deleteAdminSmtp: () =>
      apiFetch<void>('/admin/smtp', { method: 'DELETE' }),
    testAdminSmtp: () =>
      apiFetch<{ sent_to: string }>('/admin/smtp/test', { method: 'POST' }),
    // ── Notifications ────────────────────────────────────────────────────────
    getNotifications: () =>
      apiFetch<{ notifications: NotificationConfig[] }>('/admin/notifications').then((r) => r.notifications),
    putNotifications: (configs: NotificationConfig[]) =>
      apiFetch<{ notifications: NotificationConfig[] }>('/admin/notifications', { method: 'PUT', body: configs }).then((r) => r.notifications),
    previewNotification: (status: TriggerStatus) =>
      apiFetch<{ sent_to: string; status: TriggerStatus }>(`/admin/notifications/preview/${status}`, { method: 'POST' }),
    // ── Promotions ───────────────────────────────────────────────────────────
    listPromotions: () =>
      apiFetch<{ promotions: Promotion[] }>('/admin/promotions').then((r) => r.promotions),
    createPromotion: (data: CreatePromotionInput) =>
      apiFetch<{ promotion: Promotion }>('/admin/promotions', { method: 'POST', body: data }).then((r) => r.promotion),
    updatePromotion: (id: string, data: Partial<CreatePromotionInput>) =>
      apiFetch<{ promotion: Promotion }>(`/admin/promotions/${id}`, { method: 'PATCH', body: data }).then((r) => r.promotion),
    togglePromotion: (id: string) =>
      apiFetch<{ active: boolean }>(`/admin/promotions/${id}/toggle`, { method: 'PATCH' }),
    deletePromotion: (id: string) =>
      apiFetch<void>(`/admin/promotions/${id}`, { method: 'DELETE' }),
    // ── Notices ──────────────────────────────────────────────────────────────
    listNotices: () =>
      apiFetch<{ notices: Notice[] }>('/admin/notices').then((r) => r.notices),
    createNotice: (data: CreateNoticeInput) =>
      apiFetch<Notice>('/admin/notices', { method: 'POST', body: data }),
    updateNotice: (id: string, data: Partial<CreateNoticeInput>) =>
      apiFetch<Notice>(`/admin/notices/${id}`, { method: 'PATCH', body: data }),
    deleteNotice: (id: string) =>
      apiFetch<void>(`/admin/notices/${id}`, { method: 'DELETE' }),
  }

  return { apiFetch, auth, superadmin, admin, menu, orders }
}

export type ApiClient = ReturnType<typeof createApiClient>
