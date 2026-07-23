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

export interface PublicSettings {
  slug: string
  display_name: string
  brand_colors: {
    primary: string
    secondary: string
    accent: string
    text: string
  } | null
  font_family: string | null
}

export type DevicePermission = 'orders:accept_reject' | 'orders:status' | 'inventory:write' | 'orders:pause'

export interface Device {
  id: string
  restaurant_id: string
  name: string
  permissions: DevicePermission[]
  device_uuid: string | null
  platform: string | null
  last_seen_at: string | null
  created_at: string
}

export interface CreateDeviceInput {
  name: string
  permissions: DevicePermission[]
}

export interface PatchDeviceInput {
  name?: string
  permissions?: DevicePermission[]
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
  password?: string  // omit to keep existing encrypted password
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

export type PauseMode = 'timed' | 'manual' | 'rest_of_day'

export interface PauseState {
  orders_paused: boolean
  pause_mode: PauseMode | null
  pause_until: string | null
  pause_reason: string | null
  pause_scheduled_orders: boolean
}

export interface PauseInput {
  mode: PauseMode
  duration_minutes?: number
  reason?: string
  pause_scheduled_orders?: boolean
}

export type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer'

export interface TransactionRow {
  id: string
  status: string
  total: number
  stripe_intent_id: string | null
  created_at: string
  customer_name: string
  customer_email: string
  refund_id: string | null
  refunded_at: string | null
}

export interface TransactionListResponse {
  transactions: TransactionRow[]
  total: number
  page: number
  page_size: number
  history_days: number
}

export interface RefundInput {
  amount_cents?: number
  reason?: RefundReason
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
  free_item_id?: string
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
    device: (device_token: string, options?: { device_uuid?: string; platform?: string }) =>
      apiFetch<AuthSession>('/auth/device', {
        method: 'POST',
        body: { device_token, ...options },
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
      apiFetch<void>(`/superadmin/invites/${id}/revoke`, { method: 'POST' }),
    deleteInvite: (id: string) =>
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
    createRestaurantUser: (
      restaurantId: string,
      data: { email: string; password: string; name: string; phone?: string },
    ) =>
      apiFetch<{
        user: { id: string; email: string; name: string; role: string; restaurant_id: string; force_password_change: boolean; created_at: string }
      }>(`/superadmin/restaurants/${restaurantId}/users`, { method: 'POST', body: data }).then((r) => r.user),
    getSmtpGlobal: () =>
      apiFetch<{ config: SmtpConfig }>('/superadmin/smtp/global'),
    putSmtpGlobal: (data: SmtpGlobalInput) =>
      apiFetch<{ ok: boolean }>('/superadmin/smtp/global', { method: 'POST', body: data }),
    testSmtpGlobal: (to?: string) =>
      apiFetch<{ ok: boolean; sent_to: string }>('/superadmin/smtp/test', { method: 'POST', body: to ? { to } : undefined }),
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
    getPlatformSettings: () =>
      apiFetch<{ settings: { jwt_expiry_minutes: number; global_rate_limit: number; maintenance_mode: boolean; support_email: string; r2_public_domain: string; webhook_signing_secret: string; upgrade_message_title: string; upgrade_message_html: string } }>('/superadmin/settings'),
    updatePlatformSettings: (data: { jwt_expiry_minutes: number; global_rate_limit: number; maintenance_mode: boolean; support_email: string; r2_public_domain: string; upgrade_message_title: string; upgrade_message_html: string }) =>
      apiFetch<{ ok: boolean }>('/superadmin/settings', { method: 'PATCH', body: data }),
    regenerateWebhookSecret: () =>
      apiFetch<{ webhook_signing_secret: string }>('/superadmin/settings/webhook-secret', { method: 'POST' }),
  }

  // Forward-looking named functions for routes landing in later slices. They are
  // typed against the shared contract today so apps can build against them.
  const menu = {
    getMenu: (slug: string) => apiFetch<{ categories: unknown[] }>(`/public/${slug}/menu`, { skipAuth: true }),
    getSettings: (slug: string) => apiFetch<PublicSettings>(`/public/${slug}/settings`, { skipAuth: true }),
  }
  const orders = {
    listActive: () =>
      apiFetch<{ orders: Order[] }>('/tablet/orders').then((r) => r.orders),
    getOrder: (orderId: string) =>
      apiFetch<Order>(`/tablet/orders/${orderId}`),
    acceptOrder: (orderId: string) =>
      apiFetch<Order>(`/tablet/orders/${orderId}/accept`, { method: 'POST' }),
    rejectOrder: (orderId: string, reason?: string) =>
      apiFetch<Order>(`/tablet/orders/${orderId}/reject`, { method: 'POST', body: { reason } }),
    updateOrderStatus: (orderId: string, status: string) =>
      apiFetch<Order>(`/tablet/orders/${orderId}/status`, { method: 'POST', body: { status } }),
    tabletPauseOrders: (data: { mode: 'timed' | 'manual'; duration_minutes?: number; reason?: string; pause_scheduled_orders?: boolean }) =>
      apiFetch<PauseState>('/tablet/orders/pause', { method: 'POST', body: data }),
    tabletUnpauseOrders: () =>
      apiFetch<PauseState>('/tablet/orders/unpause', { method: 'POST' }),
    tabletSession: () =>
      apiFetch<{
        identity: { sub: string; role: string; restaurant_id: string; device_id: string | null; permissions: string[] }
        pause_state: PauseState | null
      }>('/tablet/session'),
    heartbeat: () =>
      apiFetch<void>('/tablet/heartbeat', { method: 'POST' }),
    getInventory: () =>
      apiFetch<{
        categories: Array<{ id: string; name: string; availability_state: string; position: number }>
        items: Array<{ id: string; name: string; category_id: string; availability_state: string; restore_at: string | null }>
      }>('/tablet/inventory'),
    patchInventoryItem: (id: string, data: { availability_state: string; restore_at?: string | null }) =>
      apiFetch<{ id: string; name: string; availability_state: string; restore_at: string | null }>(
        `/tablet/inventory/items/${id}`,
        { method: 'PATCH', body: data },
      ),
    patchInventoryCategory: (id: string, data: { availability_state: string; restore_at?: string | null }) =>
      apiFetch<{ id: string; name: string; availability_state: string; restore_at: string | null }>(
        `/tablet/inventory/categories/${id}`,
        { method: 'PATCH', body: data },
      ),
    getOrderHistory: (page = 1) =>
      apiFetch<{
        orders: Array<{
          id: string
          status: string
          total: number
          payment_method: string
          customer_name: string
          created_at: string
          updated_at: string
          items: Array<{ item_name: string | null; variant_name: string | null; quantity: number }>
        }>
        total: number
        page: number
        page_size: number
        history_days: number
      }>('/tablet/orders/history', { query: { page } }),
  }

  const admin = {
    getRestaurant: () =>
      apiFetch<{ restaurant: Restaurant }>('/admin/restaurant').then((r) => r.restaurant),
    patchRestaurant: (data: Partial<Pick<Restaurant, 'display_name' | 'business_name' | 'address' | 'cuisine_type' | 'services_offered' | 'logo_r2_key'>>) =>
      apiFetch<{ restaurant: Partial<Restaurant> }>('/admin/restaurant', { method: 'PATCH', body: data }).then((r) => r.restaurant),
    saveIntegrations: (data: { brand_colors?: Restaurant['brand_colors']; social_links?: Record<string, string>; delivery_links?: Record<string, string> }) =>
      apiFetch<{ restaurant: Partial<Restaurant> }>('/admin/restaurant', { method: 'PATCH', body: data }).then((r) => r.restaurant),
    patchProfile: (data: { name?: string; phone?: string }) =>
      apiFetch<{ ok: boolean }>('/admin/restaurant/profile', { method: 'PATCH', body: data }),
    changePassword: (data: { current_password: string; new_password: string }) =>
      apiFetch<{ ok: boolean }>('/admin/restaurant/password', { method: 'PATCH', body: data }),
    getLogoUploadUrl: () =>
      apiFetch<{ upload_url: string; r2_key: string }>('/admin/restaurant/logo', { method: 'POST' }),
    // ── Orders ───────────────────────────────────────────────────────────────────
    listActiveOrders: () =>
      apiFetch<{ orders: Order[] }>('/admin/orders/active').then((r) => r.orders),
    acceptOrder: (orderId: string) =>
      apiFetch<Order>(`/admin/orders/${orderId}/accept`, { method: 'POST' }),
    rejectOrder: (orderId: string, reason?: string) =>
      apiFetch<Order>(`/admin/orders/${orderId}/reject`, { method: 'POST', body: { reason } }),
    // ── Orders pause ─────────────────────────────────────────────────────────────
    getPauseState: () =>
      apiFetch<PauseState>('/admin/orders/pause'),
    pauseOrders: (data: PauseInput) =>
      apiFetch<PauseState>('/admin/orders/pause', { method: 'POST', body: data }),
    unpauseOrders: () =>
      apiFetch<PauseState>('/admin/orders/unpause', { method: 'POST' }),
    getAutomationConfig: () =>
      apiFetch<AutomationConfig>('/admin/orders/automation'),
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
      apiFetch<{ ok: boolean }>('/admin/menu/categories/reorder', { method: 'POST', body: order }),
    listItems: (categoryId?: string) =>
      apiFetch<{ items: MenuItem[] }>(categoryId ? `/admin/menu/items?category_id=${categoryId}` : '/admin/menu/items').then((r) => r.items),
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
    listGlobalModifierGroups: () =>
      apiFetch<{ groups: ModifierGroup[] }>('/admin/menu/modifiers').then((r) => r.groups),
    createGlobalModifierGroup: (data: Record<string, unknown>) =>
      apiFetch<ModifierGroup>('/admin/menu/modifiers', { method: 'POST', body: data }),
    updateModifierGroup: (groupId: string, data: Record<string, unknown>) =>
      apiFetch<ModifierGroup>(`/admin/menu/modifiers/${groupId}`, { method: 'PATCH', body: data }),
    deleteModifierGroup: (groupId: string) =>
      apiFetch<void>(`/admin/menu/modifiers/${groupId}`, { method: 'DELETE' }),
    createModifierOption: (groupId: string, data: Record<string, unknown>) =>
      apiFetch<ModifierOption>(`/admin/menu/modifiers/${groupId}/options`, { method: 'POST', body: data }),
    updateModifierOption: (optionId: string, data: Record<string, unknown>) =>
      apiFetch<ModifierOption>(`/admin/menu/modifiers/options/${optionId}`, { method: 'PATCH', body: data }),
    deleteModifierOption: (optionId: string) =>
      apiFetch<void>(`/admin/menu/modifiers/options/${optionId}`, { method: 'DELETE' }),
    getItemModifierAssignments: (itemId: string) =>
      apiFetch<{ group_ids: string[] }>(`/admin/menu/items/${itemId}/modifier-assignments`).then((r) => r.group_ids),
    setItemModifierAssignments: (itemId: string, groupIds: string[]) =>
      apiFetch<{ group_ids: string[] }>(`/admin/menu/items/${itemId}/modifier-assignments`, { method: 'PUT', body: { group_ids: groupIds } }),
    reorderItems: (order: Array<{ id: string; sort_order: number }>) =>
      apiFetch<void>('/admin/menu/items/reorder', { method: 'POST', body: order }),
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
      apiFetch<SpecialClosure>('/admin/closures', { method: 'POST', body: data }),
    deleteClosure: (id: string) =>
      apiFetch<void>(`/admin/closures/${id}`, { method: 'DELETE' }),
    // ── Devices ──────────────────────────────────────────────────────────────
    listDevices: () =>
      apiFetch<{ devices: Device[]; device_cap: number; device_count: number }>('/admin/devices'),
    createDevice: (data: CreateDeviceInput) =>
      apiFetch<{ device_token: string; device: Device }>('/admin/devices', { method: 'POST', body: data }),
    updateDevice: (id: string, data: PatchDeviceInput) =>
      apiFetch<Device>(`/admin/devices/${id}`, { method: 'PATCH', body: data }),
    revokeDevice: (id: string) =>
      apiFetch<void>(`/admin/devices/${id}`, { method: 'DELETE' }),
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
      apiFetch<{ pickup_delivery_note: string | null }>('/admin/payments/note', { method: 'PATCH', body: { pickup_delivery_note } }),
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
    testAdminSmtp: (to?: string) =>
      apiFetch<{ sent_to: string }>('/admin/smtp/test', { method: 'POST', body: to ? { to } : undefined }),
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
    // ── Transactions ─────────────────────────────────────────────────────────
    listTransactions: (page = 1) =>
      apiFetch<TransactionListResponse>(`/admin/transactions?page=${page}`),
    getTransaction: (id: string) =>
      apiFetch<Record<string, unknown>>(`/admin/transactions/${id}`),
    refundTransaction: (id: string, data: RefundInput) =>
      apiFetch<TransactionRow>(`/admin/transactions/${id}/refund`, { method: 'POST', body: data }),
    // ── Notices ──────────────────────────────────────────────────────────────
    listNotices: () =>
      apiFetch<{ notices: Notice[] }>('/admin/notices').then((r) => r.notices),
    createNotice: (data: CreateNoticeInput) =>
      apiFetch<Notice>('/admin/notices', { method: 'POST', body: data }),
    updateNotice: (id: string, data: Partial<CreateNoticeInput>) =>
      apiFetch<Notice>(`/admin/notices/${id}`, { method: 'PATCH', body: data }),
    deleteNotice: (id: string) =>
      apiFetch<void>(`/admin/notices/${id}`, { method: 'DELETE' }),
    // ── Plan & usage ──────────────────────────────────────────────────────────
    getPlan: () =>
      apiFetch<{
        plan: Plan
        usage: { categories: number; items: number; staff: number }
        upgrade_message: { title: string; html: string }
      }>('/admin/plan'),
  }

  return { apiFetch, auth, superadmin, admin, menu, orders }
}

export type ApiClient = ReturnType<typeof createApiClient>
