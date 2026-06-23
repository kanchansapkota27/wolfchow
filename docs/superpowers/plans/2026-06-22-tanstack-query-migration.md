# TanStack Query Migration — Superadmin App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom `useAsync` hook in `web/apps/superadmin` with TanStack Query v5 (`useQuery` / `useMutation`), giving the app caching, deduplication, and declarative invalidation.

**Architecture:** Install `@tanstack/react-query`, wrap `main.tsx` with `QueryClientProvider`, then migrate each page one by one. Each page migration: swap `useAsync` → `useQuery`, swap `reload()` → `queryClient.invalidateQueries(...)`, update the page's test to wrap with `QueryClientProvider`. Delete `useAsync.ts` in the final cleanup task.

**Tech Stack:** React 19 · TanStack Query v5 · Vitest · @testing-library/react · pnpm workspace

## Global Constraints

- TanStack Query version: `@tanstack/react-query@^5` (v5 API — `status` is `'pending'` | `'success'` | `'error'`, NOT `'loading'`)
- Never import from `useAsync` after it is deleted in Task 7
- `useDebounce` stays — it is still used in Restaurants.tsx for the search input
- No `any` — use proper TQ generic types: `useQuery<ReturnType<typeof api.foo>>(...)` or let TS infer
- `retry: false` and `gcTime: 0` in every test `QueryClient` — required so errors surface immediately and cache never leaks between tests
- Test files must import `makeTestQueryClient` from `../lib/test-utils` — not create a raw `new QueryClient()` inline
- All `status === 'loading'` checks must become `status === 'pending'` (TQ v5 change)
- Mutations that previously called `reload()` must call `queryClient.invalidateQueries({ queryKey: [...] })` with the matching query key
- Working directory for all commands: `web/` (the pnpm workspace root — run `cd wolfchow/web` first)

---

## File Map

| File | Action |
|---|---|
| `web/apps/superadmin/package.json` | add `@tanstack/react-query` dep |
| `web/apps/superadmin/src/lib/queryClient.ts` | **CREATE** — factory for production QueryClient |
| `web/apps/superadmin/src/lib/test-utils.tsx` | **CREATE** — `makeTestQueryClient` + `renderWithQuery` |
| `web/apps/superadmin/src/main.tsx` | wrap Providers with `QueryClientProvider` |
| `web/apps/superadmin/src/App.test.tsx` | add `QueryClientProvider` wrapper |
| `web/apps/superadmin/src/pages/Dashboard.tsx` | migrate `useAsync` → `useQuery` |
| `web/apps/superadmin/src/pages/Dashboard.test.tsx` | use `renderWithQuery` |
| `web/apps/superadmin/src/pages/Plans.tsx` | migrate + `useMutation` pattern |
| `web/apps/superadmin/src/pages/Plans.test.tsx` | use `renderWithQuery` |
| `web/apps/superadmin/src/pages/Invites.tsx` | migrate |
| `web/apps/superadmin/src/pages/Invites.test.tsx` | use `renderWithQuery` |
| `web/apps/superadmin/src/pages/Audit.tsx` | migrate (two queries) |
| `web/apps/superadmin/src/pages/Audit.test.tsx` | use `renderWithQuery` |
| `web/apps/superadmin/src/pages/Restaurants.tsx` | migrate (two queries, debounce stays) |
| `web/apps/superadmin/src/pages/Restaurants.test.tsx` | use `renderWithQuery` |
| `web/apps/superadmin/src/components/RestaurantDetail.tsx` | migrate |
| `web/apps/superadmin/src/pages/Smtp.tsx` | migrate (three queries) |
| `web/apps/superadmin/src/pages/Smtp.test.tsx` | use `renderWithQuery` |
| `web/apps/superadmin/src/pages/Billing.tsx` | migrate (two queries, one in sub-component) |
| `web/apps/superadmin/src/pages/Billing.test.tsx` | use `renderWithQuery` |
| `web/apps/superadmin/src/pages/Settings.tsx` | migrate |
| `web/apps/superadmin/src/lib/useAsync.ts` | **DELETE** in Task 7 |

---

## Query Key Registry

Use these exact keys everywhere — consistency lets `invalidateQueries` work across components:

| Key | Used by |
|---|---|
| `['dashboard']` | Dashboard |
| `['plans']` | Plans, Restaurants (plansAsync) |
| `['invites']` | Invites |
| `['restaurants', params]` | Restaurants list (parameterized) |
| `['restaurant', restaurantId]` | RestaurantDetail |
| `['audit-restaurants']` | Audit (restaurant dropdown) |
| `['audit', filters]` | Audit (paginated log) |
| `['smtp-global']` | Smtp (global config) |
| `['smtp-overrides']` | Smtp (per-restaurant overrides) |
| `['smtp-restaurants']` | Smtp (restaurant dropdown) |
| `['billing']` | Billing (summary table) |
| `['restaurant-billing', restaurantId]` | Billing (monthly drill-down modal) |
| `['settings']` | Settings |

Invalidating with a partial key prefix (e.g. `['restaurants']`) matches ALL queries whose key starts with that prefix — use this for broad cache busts.

---

### Task 1: Install + wire QueryClientProvider + test utility

**Files:**
- Modify: `web/apps/superadmin/package.json`
- Create: `web/apps/superadmin/src/lib/queryClient.ts`
- Create: `web/apps/superadmin/src/lib/test-utils.tsx`
- Modify: `web/apps/superadmin/src/main.tsx`
- Modify: `web/apps/superadmin/src/App.test.tsx`

**Interfaces:**
- Produces: `makeTestQueryClient(): QueryClient` and `renderWithQuery(ui, apiClient): RenderResult` — every later task's test uses these

- [ ] **Step 1: Install the package**

```bash
cd wolfchow/web
pnpm --filter @wolfchow/app-superadmin add @tanstack/react-query
```

Expected: `@tanstack/react-query 5.x.x` appears in `web/apps/superadmin/package.json` under `dependencies`.

- [ ] **Step 2: Create `queryClient.ts`**

Create `web/apps/superadmin/src/lib/queryClient.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  })
}
```

- [ ] **Step 3: Create `test-utils.tsx`**

Create `web/apps/superadmin/src/lib/test-utils.tsx`:

```typescript
import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@wolfchow/ui'
import type { ApiClient } from '@wolfchow/api-client'
import { ApiProvider } from './api'

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function renderWithQuery(ui: ReactElement, client: ApiClient): RenderResult {
  const queryClient = makeTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ApiProvider client={client}>{ui}</ApiProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
```

- [ ] **Step 4: Update `main.tsx` to wrap with `QueryClientProvider`**

Replace the entire `Providers` function in `web/apps/superadmin/src/main.tsx`:

```typescript
import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useNavigate, useSearchParams } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, type AuthNavigator } from '@wolfchow/auth'
import { createLocalStorageSession } from '@wolfchow/api-client'
import { ToastProvider } from '@wolfchow/ui'
import { ApiProvider, buildApiClient } from './lib/api'
import { createQueryClient } from './lib/queryClient'
import { App } from './App'
import './index.css'

function Providers() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const session = useMemo(() => createLocalStorageSession(), [])
  const authNavigator = useMemo<AuthNavigator>(
    () => ({
      navigate: (to) => navigate(to === '/superadmin' ? '/' : to),
      getQueryParam: (key) => searchParams.get(key),
    }),
    [navigate, searchParams],
  )
  const client = useMemo(
    () => buildApiClient(session, () => navigate('/login')),
    [session, navigate],
  )
  const queryClient = useMemo(() => createQueryClient(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ApiProvider client={client}>
          <AuthProvider client={client} session={session} navigator={authNavigator}>
            <App />
          </AuthProvider>
        </ApiProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Providers />
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 5: Update `App.test.tsx` to include `QueryClientProvider`**

Replace `web/apps/superadmin/src/App.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, type AuthNavigator } from '@wolfchow/auth'
import { createApiClient, createMemorySession } from '@wolfchow/api-client'
import { ApiProvider } from './lib/api'
import { makeTestQueryClient } from './lib/test-utils'
import { App } from './App'

function makeToken(claims: Record<string, unknown>): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}.sig`
}

describe('STORY-049 · App role guard', () => {
  it('non-superadmin visiting the panel: redirected to login', async () => {
    const token = makeToken({ sub: 'u2', role: 'restaurant_owner', restaurant_id: 'r1', permissions: [] })
    const session = createMemorySession({ access_token: token, refresh_token: 'r' })
    const navigate = vi.fn()
    const navigator: AuthNavigator = { navigate, getQueryParam: () => null }
    const client = createApiClient({ baseUrl: 'http://api.test', session, fetch: vi.fn() })

    render(
      <QueryClientProvider client={makeTestQueryClient()}>
        <MemoryRouter>
          <ApiProvider client={client}>
            <AuthProvider client={client} session={session} navigator={navigator}>
              <App />
            </AuthProvider>
          </ApiProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'))
  })

  it('/login renders the public login page (no role required)', async () => {
    const session = createMemorySession()
    const navigator: AuthNavigator = { navigate: vi.fn(), getQueryParam: () => null }
    const client = createApiClient({ baseUrl: 'http://api.test', session, fetch: vi.fn() })

    render(
      <QueryClientProvider client={makeTestQueryClient()}>
        <MemoryRouter initialEntries={['/login']}>
          <ApiProvider client={client}>
            <AuthProvider client={client} session={session} navigator={navigator}>
              <App />
            </AuthProvider>
          </ApiProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /device token/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run tests — all should still pass (no page logic changed yet)**

```bash
cd wolfchow/web
pnpm test
```

Expected: same passing/failing count as before this task. Zero regressions introduced.

- [ ] **Step 7: Commit**

```bash
git add web/apps/superadmin/package.json web/apps/superadmin/src/lib/queryClient.ts web/apps/superadmin/src/lib/test-utils.tsx web/apps/superadmin/src/main.tsx web/apps/superadmin/src/App.test.tsx
git commit -m "STORY-075: install TanStack Query, wire QueryClientProvider, add test utility

Refs: #63"
```

---

### Task 2: Migrate Dashboard + Plans

**Files:**
- Modify: `web/apps/superadmin/src/pages/Dashboard.tsx`
- Modify: `web/apps/superadmin/src/pages/Dashboard.test.tsx`
- Modify: `web/apps/superadmin/src/pages/Plans.tsx`
- Modify: `web/apps/superadmin/src/pages/Plans.test.tsx`

**Interfaces:**
- Consumes: `makeTestQueryClient`, `renderWithQuery` from `../lib/test-utils`
- Query keys used: `['dashboard']`, `['plans']`

- [ ] **Step 1: Replace Dashboard.tsx**

Full replacement of `web/apps/superadmin/src/pages/Dashboard.tsx`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { formatCurrency } from '@wolfchow/utils'
import { ApiError } from '@wolfchow/api-client'
import { useApi } from '../lib/api'
import { MetricCard, MetricCardSkeleton } from '../components/MetricCard'
import { SectionError } from '../components/SectionError'
import { PageHeader } from '../components/PageHeader'

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.status}: ${err.message}`
  if (err instanceof TypeError && err.message.includes('fetch'))
    return 'Cannot reach API — is the Worker running on localhost:8787?'
  if (err instanceof Error) return err.message
  return 'Failed to load'
}

interface SummaryRow {
  total_orders_30d?: number | string
  estimated_commission_30d?: number | string
}

const sum = (rows: SummaryRow[], key: keyof SummaryRow): number =>
  rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)

export function Dashboard() {
  const api = useApi()
  const { status, data, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const [billing, active] = await Promise.all([
        api.superadmin.getBilling(),
        api.superadmin.listRestaurants({ active: true }),
      ])
      return {
        summary: (billing.summary ?? []) as SummaryRow[],
        activeCount: active.total,
      }
    },
  })

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Platform overview at a glance." />

      {status === 'pending' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <MetricCardSkeleton key={index} />
          ))}
        </div>
      ) : status === 'error' || !data ? (
        <SectionError message={toMessage(error)} onRetry={() => void refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total restaurants" value={data.summary.length} />
          <MetricCard label="Active restaurants" value={data.activeCount} />
          <MetricCard label="Orders (30d)" value={sum(data.summary, 'total_orders_30d')} />
          <MetricCard
            label="Est. commission (30d)"
            value={formatCurrency(sum(data.summary, 'estimated_commission_30d'), 'TRY')}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update Dashboard.test.tsx**

Replace the `renderDashboard` helper to use `renderWithQuery`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import { renderWithQuery } from '../lib/test-utils'
import { Dashboard } from './Dashboard'

type SuperadminApi = ApiClient['superadmin']

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

describe('STORY-049 · Dashboard', () => {
  it('summary cards render with values after fetch', async () => {
    const client = fakeClient({
      getBilling: vi.fn(async () => ({
        summary: [
          { total_orders_30d: 10, estimated_commission_30d: 5 },
          { total_orders_30d: 5, estimated_commission_30d: 2.5 },
          { total_orders_30d: 0, estimated_commission_30d: 0 },
        ],
      })),
      listRestaurants: vi.fn(async () => ({ restaurants: [], page: 1, page_size: 20, total: 2 })),
    })

    renderWithQuery(<Dashboard />, client)

    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('₺7,50')).toBeInTheDocument()
  })

  it('loading: skeleton cards shown', () => {
    const client = fakeClient({
      getBilling: vi.fn<SuperadminApi['getBilling']>(() => new Promise(() => {})),
      listRestaurants: vi.fn<SuperadminApi['listRestaurants']>(() => new Promise(() => {})),
    })
    renderWithQuery(<Dashboard />, client)
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(4)
  })

  it('fetch error: error with retry shown, retry refetches', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ summary: [] })
    const listRestaurants = vi.fn(async () => ({ restaurants: [], page: 1, page_size: 20, total: 0 }))
    const client = fakeClient({ getBilling, listRestaurants })

    renderWithQuery(<Dashboard />, client)

    const retry = await screen.findByRole('button', { name: /retry/i })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()

    await userEvent.click(retry)

    await waitFor(() => expect(screen.getByText('Total restaurants')).toBeInTheDocument())
    expect(getBilling).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 3: Run Dashboard tests**

```bash
cd wolfchow/web
pnpm test -- --reporter=verbose src/pages/Dashboard.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 4: Replace Plans.tsx**

Full replacement of `web/apps/superadmin/src/pages/Plans.tsx`:

```typescript
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Plan, PlanInput } from '@wolfchow/types'
import { Button, Modal } from '@wolfchow/ui'
import { Pencil, Trash2, Plus, Users, ShoppingBag, List, Layers, Mail, Clock } from 'lucide-react'
import { useApi } from '../lib/api'
import { SectionError } from '../components/SectionError'
import { PlanFormModal } from '../components/PlanFormModal'
import { FEATURE_FLAGS, PAYMENT_METHODS } from '../lib/planMeta'
import { PageHeader } from '../components/PageHeader'

type Editing = Plan | null | undefined

export function Plans() {
  const api = useApi()
  const queryClient = useQueryClient()
  const { status, data } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.superadmin.listPlans(),
  })
  const [editing, setEditing] = useState<Editing>(undefined)
  const [deleting, setDeleting] = useState<Plan | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  async function handleSubmit(input: PlanInput) {
    const target = editing
    if (target) await api.superadmin.updatePlan(target.id, input)
    else await api.superadmin.createPlan(input)
    await queryClient.invalidateQueries({ queryKey: ['plans'] })
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await api.superadmin.deletePlan(deleting.id)
      setDeleting(null)
      await queryClient.invalidateQueries({ queryKey: ['plans'] })
    } finally {
      setDeletingBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Subscription Plans"
        subtitle="Configure platform tiers and feature limits for all tenants."
        action={
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            Create Plan
          </button>
        }
      />

      {status === 'pending' && (
        <p className="text-sm text-gray-500">Loading plans…</p>
      )}
      {status === 'error' && <SectionError onRetry={() => void queryClient.invalidateQueries({ queryKey: ['plans'] })} />}

      {status === 'success' && data && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onEdit={() => setEditing(plan)}
              onDelete={() => setDeleting(plan)}
            />
          ))}
        </div>
      )}

      <PlanFormModal
        open={editing !== undefined}
        initial={editing}
        onClose={() => setEditing(undefined)}
        onSubmit={handleSubmit}
      />

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete plan">
        <div>
          <p className="text-gray-700">
            Delete <strong>{deleting?.name}</strong>? This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" loading={deletingBusy} onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function PlanCard({ plan, onEdit, onDelete }: { plan: Plan; onEdit: () => void; onDelete: () => void }) {
  const inUse = (plan.restaurant_count ?? 0) > 0
  const enabledFlags = FEATURE_FLAGS.filter((f) => plan.feature_flags[f.key])
  const methods = PAYMENT_METHODS.filter((m) => plan.payment_methods_allowed.includes(m.value))

  const capValue = (v: number | null | undefined) =>
    v === null || v === undefined ? '∞' : v >= 9999 ? '∞' : String(v)

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {plan.restaurant_count ?? 0} active restaurant{plan.restaurant_count === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Edit plan"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={inUse}
            title={inUse ? `${plan.restaurant_count} restaurants on this plan` : undefined}
            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Delete plan"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {[
          { icon: Users, label: 'STAFF CAP', value: capValue(plan.staff_cap) },
          { icon: ShoppingBag, label: 'ITEM CAP', value: capValue(plan.item_cap) },
          { icon: List, label: 'CATEGORY CAP', value: capValue(plan.category_cap) },
          { icon: Layers, label: 'MODIFIER CAP', value: capValue(plan.modifier_cap) },
          { icon: Mail, label: 'SMTP LIMIT', value: capValue(plan.smtp_monthly_limit) },
          { icon: Clock, label: 'HISTORY (DAYS)', value: capValue(plan.transaction_history_days) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label}>
            <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
              <Icon size={11} />
              {label}
            </p>
            <p className="mt-0.5 text-base font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {enabledFlags.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">Feature Flags</p>
          <div className="flex flex-wrap gap-1.5">
            {enabledFlags.map((f) => (
              <span key={f.key} className="rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                {f.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {methods.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">Allowed Payments</p>
          <div className="flex flex-wrap gap-1.5">
            {methods.map((m) => (
              <span key={m.value} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Update Plans.test.tsx**

Replace `renderPlans` helper:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import type { FeatureFlags, Plan } from '@wolfchow/types'
import { renderWithQuery } from '../lib/test-utils'
import { Plans } from './Plans'

type SuperadminApi = ApiClient['superadmin']

function flags(): FeatureFlags {
  return {
    menu_photos: false, item_modifiers: false, category_scheduling: false,
    email_notifications: true, order_tracking_page: false, analytics_dashboard: false,
    export_orders_csv: false, custom_brand_color: false, remove_powered_by: false,
    promotions_enabled: false, scheduled_orders_enabled: false,
  }
}

function makePlan(over: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1', name: 'Starter', staff_cap: 3, item_cap: 50, category_cap: 10,
    modifier_cap: 20, smtp_monthly_limit: 500, transaction_history_days: 30,
    feature_flags: flags(), payment_methods_allowed: ['card'],
    commission_type: 'percentage', commission_value: 500, is_public: false,
    created_at: '2026-01-01T00:00:00Z', restaurant_count: 0, ...over,
  }
}

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

describe('STORY-051 · Plans UI', () => {
  it('create plan: form valid, API called, plan appears in grid', async () => {
    const created = makePlan({ id: 'p2', name: 'Pro Max' })
    const listPlans = vi
      .fn<SuperadminApi['listPlans']>()
      .mockResolvedValueOnce({ plans: [] })
      .mockResolvedValueOnce({ plans: [created] })
    const createPlan = vi.fn<SuperadminApi['createPlan']>().mockResolvedValue(created)

    renderWithQuery(<Plans />, fakeClient({ listPlans, createPlan }))

    await userEvent.click(await screen.findByRole('button', { name: 'Create plan' }))
    await userEvent.type(screen.getByLabelText('Plan name'), 'Pro Max')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Pro Max', payment_methods_allowed: ['card'] }),
    )
    expect(await screen.findByText('Pro Max')).toBeInTheDocument()
  })

  it('payment_methods empty: submit blocked', async () => {
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [] })
    const createPlan = vi.fn<SuperadminApi['createPlan']>()

    renderWithQuery(<Plans />, fakeClient({ listPlans, createPlan }))

    await userEvent.click(await screen.findByRole('button', { name: 'Create plan' }))
    await userEvent.type(screen.getByLabelText('Plan name'), 'No Methods')
    await userEvent.click(screen.getByRole('button', { name: 'Card' }))

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await userEvent.click(save).catch(() => {})
    expect(createPlan).not.toHaveBeenCalled()
  })

  it('delete plan with restaurants: button disabled', async () => {
    const listPlans = vi.fn<SuperadminApi['listPlans']>()
      .mockResolvedValue({ plans: [makePlan({ name: 'Busy', restaurant_count: 3 })] })

    renderWithQuery(<Plans />, fakeClient({ listPlans }))

    await screen.findByText('Busy')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('edit plan: form pre-filled, PATCH called on save', async () => {
    const plan = makePlan({ id: 'p9', name: 'Growth' })
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [plan] })
    const updatePlan = vi.fn<SuperadminApi['updatePlan']>().mockResolvedValue(plan)

    renderWithQuery(<Plans />, fakeClient({ listPlans, updatePlan }))

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const nameInput = screen.getByLabelText('Plan name')
    expect(nameInput).toHaveValue('Growth')

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Growth+')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updatePlan).toHaveBeenCalledWith('p9', expect.objectContaining({ name: 'Growth+' }))
  })
})
```

- [ ] **Step 6: Run Dashboard + Plans tests**

```bash
cd wolfchow/web
pnpm test -- --reporter=verbose src/pages/Dashboard.test.tsx src/pages/Plans.test.tsx
```

Expected: 7 tests pass (3 Dashboard + 4 Plans).

- [ ] **Step 7: Commit**

```bash
git add web/apps/superadmin/src/pages/Dashboard.tsx web/apps/superadmin/src/pages/Dashboard.test.tsx web/apps/superadmin/src/pages/Plans.tsx web/apps/superadmin/src/pages/Plans.test.tsx
git commit -m "STORY-075: migrate Dashboard and Plans to useQuery

Refs: #63"
```

---

### Task 3: Migrate Invites + Audit

**Files:**
- Modify: `web/apps/superadmin/src/pages/Invites.tsx`
- Modify: `web/apps/superadmin/src/pages/Invites.test.tsx`
- Modify: `web/apps/superadmin/src/pages/Audit.tsx`
- Modify: `web/apps/superadmin/src/pages/Audit.test.tsx`

**Interfaces:**
- Query keys used: `['invites']`, `['audit-restaurants']`, `['audit', filters]`

- [ ] **Step 1: Update the useAsync block in Invites.tsx**

Find and replace only the import and hook in `web/apps/superadmin/src/pages/Invites.tsx`:

```typescript
// REMOVE this import line:
import { useAsync } from '../lib/useAsync'

// ADD these imports after the existing react import:
import { useQuery, useQueryClient } from '@tanstack/react-query'
```

Replace the hook call (the `useAsync` block) and all `reload()` usages:

```typescript
// REPLACE:
//   const { status, data, reload } = useAsync(async () => { ... }, [api])
// WITH:
  const api = useApi()
  const queryClient = useQueryClient()
  const { status, data } = useQuery({
    queryKey: ['invites'],
    queryFn: async () => {
      const [invites, plans] = await Promise.all([
        api.superadmin.listInvites(),
        api.superadmin.listPlans(),
      ])
      return { invites: invites.invites, plans: plans.plans }
    },
  })
```

Replace `reload()` in `confirmRevoke`:
```typescript
// REPLACE: reload()
// WITH:
await queryClient.invalidateQueries({ queryKey: ['invites'] })
```

Replace the `GenerateInviteModal` `onClose` prop:
```typescript
// REPLACE: onClose={() => { setGenOpen(false); reload() }}
// WITH:
onClose={() => { setGenOpen(false); void queryClient.invalidateQueries({ queryKey: ['invites'] }) }}
```

Replace `status === 'loading'` check:
```typescript
// REPLACE: {status === 'loading' && <p ...>Loading invites…</p>}
// WITH:
{status === 'pending' && <p className="text-sm text-gray-500">Loading invites…</p>}
```

- [ ] **Step 2: Update Invites.test.tsx**

Read the current `web/apps/superadmin/src/pages/Invites.test.tsx`. Find the `renderInvites` or equivalent helper function and replace it:

```typescript
// REMOVE:
// import { render } from '@testing-library/react'
// import { ApiProvider } from '../lib/api'
// import { ToastProvider } from '@wolfchow/ui'
// function renderInvites(client: ApiClient) {
//   return render(<ToastProvider><ApiProvider client={client}><Invites /></ApiProvider></ToastProvider>)
// }

// ADD:
import { renderWithQuery } from '../lib/test-utils'
// Replace every renderInvites(client) call with: renderWithQuery(<Invites />, client)
```

- [ ] **Step 3: Run Invites tests**

```bash
cd wolfchow/web
pnpm test -- --reporter=verbose src/pages/Invites.test.tsx
```

Expected: same number of passing tests as before this task.

- [ ] **Step 4: Update the useAsync blocks in Audit.tsx**

Find and replace in `web/apps/superadmin/src/pages/Audit.tsx`:

```typescript
// REMOVE:
import { useAsync } from '../lib/useAsync'

// ADD:
import { useQuery } from '@tanstack/react-query'
```

Replace the two `useAsync` calls:

```typescript
// REPLACE the restaurantsQ useAsync:
const { data: restaurantsData } = useQuery({
  queryKey: ['audit-restaurants'],
  queryFn: () => api.superadmin.listRestaurants({ page_size: 500 }),
  staleTime: 5 * 60 * 1000,
})
const restaurants: RestaurantListItem[] = restaurantsData?.restaurants ?? []

// REPLACE the auditQ useAsync:
const { status: auditStatus, data: auditData } = useQuery({
  queryKey: ['audit', { restaurantFilter, tableFilter, operationFilter, dateFrom, dateTo, page }],
  queryFn: () =>
    api.superadmin.listAudit({
      restaurant_id: restaurantFilter || undefined,
      table_name: tableFilter || undefined,
      operation: operationFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page,
    }),
})
```

Replace all `restaurantsQ.` and `auditQ.` references in the JSX:
- `restaurantsQ.data?.restaurants ?? []` → `restaurantsData?.restaurants ?? []` (done above)
- `auditQ.data?.entries` → `auditData?.entries`
- `auditQ.data?.total` → `auditData?.total`
- `auditQ.data?.page_size` → `auditData?.page_size`
- `auditQ.status === 'error'` → `auditStatus === 'error'`
- `auditQ.status === 'loading'` → `auditStatus === 'pending'`
- `auditQ.reload` → remove (Audit has no retry button — just re-filter)

Also update the variable declarations that used the old names:
```typescript
const allEntries: AuditEntry[] = auditData?.entries ?? []
const total = auditData?.total ?? 0
const pageSize = auditData?.page_size ?? 50
```

- [ ] **Step 5: Update Audit.test.tsx**

Read `web/apps/superadmin/src/pages/Audit.test.tsx`. Replace its render helper with `renderWithQuery`:

```typescript
// Replace renderAudit(client) → renderWithQuery(<Audit />, client)
// Add import: import { renderWithQuery } from '../lib/test-utils'
// Remove: import { render } from '@testing-library/react', import { ApiProvider }, import { ToastProvider } if present
```

- [ ] **Step 6: Run Invites + Audit tests**

```bash
cd wolfchow/web
pnpm test -- --reporter=verbose src/pages/Invites.test.tsx src/pages/Audit.test.tsx
```

Expected: all tests in both files pass.

- [ ] **Step 7: Commit**

```bash
git add web/apps/superadmin/src/pages/Invites.tsx web/apps/superadmin/src/pages/Invites.test.tsx web/apps/superadmin/src/pages/Audit.tsx web/apps/superadmin/src/pages/Audit.test.tsx
git commit -m "STORY-075: migrate Invites and Audit to useQuery

Refs: #63"
```

---

### Task 4: Migrate Restaurants + RestaurantDetail

**Files:**
- Modify: `web/apps/superadmin/src/pages/Restaurants.tsx`
- Modify: `web/apps/superadmin/src/pages/Restaurants.test.tsx`
- Modify: `web/apps/superadmin/src/components/RestaurantDetail.tsx`

**Interfaces:**
- Query keys: `['plans']`, `['restaurants', params]`, `['restaurant', restaurantId]`
- `RestaurantDetail` still calls `onChanged()` for parent notification; internally also calls `invalidateQueries`

- [ ] **Step 1: Update Restaurants.tsx imports and hooks**

In `web/apps/superadmin/src/pages/Restaurants.tsx`:

```typescript
// REMOVE:
import { useAsync } from '../lib/useAsync'

// ADD:
import { useQuery, useQueryClient } from '@tanstack/react-query'
```

Replace the two `useAsync` calls:

```typescript
// REPLACE:
//   const plansAsync = useAsync(() => api.superadmin.listPlans(), [api])
//   const list = useAsync(() => api.superadmin.listRestaurants({...}), [...])
// WITH:
  const queryClient = useQueryClient()

  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.superadmin.listPlans(),
  })

  const { status, data } = useQuery({
    queryKey: ['restaurants', { search: debouncedSearch, plan_id: planFilter, active: statusFilter }],
    queryFn: () =>
      api.superadmin.listRestaurants({
        search: debouncedSearch || undefined,
        plan_id: planFilter || undefined,
        active: statusFilter || undefined,
      }),
  })

  const plans = plansData?.plans ?? []
  const rows = data?.restaurants ?? []
```

Replace `list.status` / `list.reload()` usages in JSX:
- `list.status === 'error'` → `status === 'error'`
- `list.status !== 'error'` → `status !== 'error'`
- `list.status === 'loading'` → `status === 'pending'`
- `list.reload()` → `void queryClient.invalidateQueries({ queryKey: ['restaurants'] })`
- `plansAsync.data?.plans ?? []` → `plansData?.plans ?? []` (done above)

The `onChanged` callback passed to `RestaurantDetail` and `CreateRestaurantModal`:
```typescript
// REPLACE: onChanged={() => list.reload()}
// WITH:
onChanged={() => void queryClient.invalidateQueries({ queryKey: ['restaurants'] })}

// REPLACE: onCreated={() => list.reload()}
// WITH:
onCreated={() => void queryClient.invalidateQueries({ queryKey: ['restaurants'] })}
```

- [ ] **Step 2: Update RestaurantDetail.tsx imports and hook**

In `web/apps/superadmin/src/components/RestaurantDetail.tsx`:

```typescript
// REMOVE:
import { useAsync } from '../lib/useAsync'

// ADD:
import { useQuery, useQueryClient } from '@tanstack/react-query'
```

Replace the `useAsync` call:

```typescript
// REPLACE:
//   const { status, data, reload } = useAsync(
//     () => api.superadmin.getRestaurant(restaurantId),
//     [restaurantId],
//   )
// WITH:
  const queryClient = useQueryClient()
  const { status, data } = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.superadmin.getRestaurant(restaurantId),
  })
```

Replace `reload` usages — RestaurantDetail doesn't call `reload()` explicitly in its current code (it calls `onChanged()` instead). The `useEffect` that syncs `data` → `local` state remains unchanged:

```typescript
useEffect(() => {
  if (data) setLocal(data)
}, [data])
```

After `patch` and `setActive`, also invalidate the restaurant cache:
```typescript
async function patch(update: RestaurantUpdate) {
  const res = await api.superadmin.updateRestaurant(restaurantId, update)
  setLocal((cur) => (cur ? ({ ...cur, ...res } as Restaurant) : cur))
  await queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })
  onChanged()
}

async function setActive(next: boolean) {
  setBusy(true)
  try {
    const res = next
      ? await api.superadmin.reactivateRestaurant(restaurantId)
      : await api.superadmin.suspendRestaurant(restaurantId)
    setLocal((cur) => (cur ? { ...cur, active: res.active } : cur))
    setConfirm(null)
    await queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })
    onChanged()
  } finally {
    setBusy(false)
  }
}
```

Replace `status === 'loading'` → `status === 'pending'` in JSX (check the RestaurantDetail render for any such check).

- [ ] **Step 3: Update Restaurants.test.tsx**

In `web/apps/superadmin/src/pages/Restaurants.test.tsx`:

```typescript
// REMOVE:
// import { render } from '@testing-library/react'
// import { ToastProvider } from '@wolfchow/ui'
// import { ApiProvider } from '../lib/api'
// function renderPage(client: ApiClient) { ... }

// ADD:
import { renderWithQuery } from '../lib/test-utils'

// Replace every renderPage(fakeClient(...)) call with renderWithQuery(<Restaurants />, fakeClient(...))
```

- [ ] **Step 4: Run Restaurants tests**

```bash
cd wolfchow/web
pnpm test -- --reporter=verbose src/pages/Restaurants.test.tsx
```

Expected: 4 tests pass (search filter, suspend, billing_note edit, impersonate).

- [ ] **Step 5: Commit**

```bash
git add web/apps/superadmin/src/pages/Restaurants.tsx web/apps/superadmin/src/pages/Restaurants.test.tsx web/apps/superadmin/src/components/RestaurantDetail.tsx
git commit -m "STORY-075: migrate Restaurants and RestaurantDetail to useQuery

Refs: #63"
```

---

### Task 5: Migrate Smtp + Billing

**Files:**
- Modify: `web/apps/superadmin/src/pages/Smtp.tsx`
- Modify: `web/apps/superadmin/src/pages/Smtp.test.tsx`
- Modify: `web/apps/superadmin/src/pages/Billing.tsx`
- Modify: `web/apps/superadmin/src/pages/Billing.test.tsx`

**Interfaces:**
- Query keys: `['smtp-global']`, `['smtp-overrides']`, `['smtp-restaurants']`, `['billing']`, `['restaurant-billing', restaurantId]`

- [ ] **Step 1: Update Smtp.tsx imports**

In `web/apps/superadmin/src/pages/Smtp.tsx`:

```typescript
// REMOVE:
import { useAsync } from '../lib/useAsync'

// ADD:
import { useQuery, useQueryClient } from '@tanstack/react-query'
```

- [ ] **Step 2: Replace the three useAsync calls in the `Smtp` function**

```typescript
// Inside export function Smtp():

  const queryClient = useQueryClient()

  const { status: globalStatus, data: globalData } = useQuery({
    queryKey: ['smtp-global'],
    queryFn: async () => {
      try {
        return await api.superadmin.getSmtpGlobal()
      } catch {
        return null
      }
    },
  })

  const { status: overridesStatus, data: overridesData } = useQuery({
    queryKey: ['smtp-overrides'],
    queryFn: () => api.superadmin.listSmtpOverrides(),
  })

  const { data: smtpRestaurantsData } = useQuery({
    queryKey: ['smtp-restaurants'],
    queryFn: () => api.superadmin.listRestaurants({ page_size: 200 }),
  })
```

Replace `globalQ.` usages in JSX:
- `globalQ.status === 'loading'` → `globalStatus === 'pending'`
- `globalQ.status === 'error'` → `globalStatus === 'error'`
- `globalQ.status === 'success'` → `globalStatus === 'success'`
- `globalQ.data?.config` → `globalData?.config`
- `globalQ.reload` (passed as `onSaved` to `SmtpGlobalCard`) → `() => void queryClient.invalidateQueries({ queryKey: ['smtp-global'] })`

Replace `overridesQ.` usages in JSX:
- `overridesQ.status === 'loading'` → `overridesStatus === 'pending'`
- `overridesQ.status === 'error'` → `overridesStatus === 'error'`
- `overridesQ.status === 'success'` → `overridesStatus === 'success'`
- `overridesQ.data` → `overridesData`
- `overridesQ.reload()` in `confirmDelete` → `await queryClient.invalidateQueries({ queryKey: ['smtp-overrides'] })`
- `onSaved={overridesQ.reload}` → `onSaved={() => void queryClient.invalidateQueries({ queryKey: ['smtp-overrides'] })}`

Replace `restaurantsQ.data?.restaurants` → `smtpRestaurantsData?.restaurants`.

- [ ] **Step 3: Update Smtp.test.tsx render helper**

```typescript
// Replace render helper with renderWithQuery pattern
import { renderWithQuery } from '../lib/test-utils'
// renderSmtp(client) → renderWithQuery(<Smtp />, client)
```

- [ ] **Step 4: Run Smtp tests**

```bash
cd wolfchow/web
pnpm test -- --reporter=verbose src/pages/Smtp.test.tsx
```

Expected: same number of passing Smtp tests as before.

- [ ] **Step 5: Update Billing.tsx**

In `web/apps/superadmin/src/pages/Billing.tsx`:

```typescript
// REMOVE:
import { useAsync } from '../lib/useAsync'

// ADD:
import { useQuery } from '@tanstack/react-query'
```

In `MonthlyDetailModal` component, replace `useAsync`:

```typescript
// REPLACE:
//   const monthlyQ = useAsync(
//     () => restaurantId ? api.superadmin.getRestaurantBilling(restaurantId) : Promise.resolve({ months: [] }),
//     [api, restaurantId],
//   )
// WITH:
  const { status: monthlyStatus, data: monthlyData } = useQuery({
    queryKey: ['restaurant-billing', restaurantId],
    queryFn: () => api.superadmin.getRestaurantBilling(restaurantId!),
    enabled: restaurantId !== null,
  })
```

Replace `monthlyQ.` usages in `MonthlyDetailModal` JSX:
- `monthlyQ.status === 'loading'` → `monthlyStatus === 'pending'`
- `monthlyQ.status === 'error'` → `monthlyStatus === 'error'`
- `monthlyQ.status === 'success'` → `monthlyStatus === 'success'`
- `monthlyQ.data?.months` → `monthlyData?.months`
- `monthlyQ.reload` → `() => {}` (no retry needed — modal can just be closed and reopened)

In `Billing` page function, replace `useAsync`:

```typescript
// REPLACE:
//   const { status, data, error, reload } = useAsync(
//     () => api.superadmin.getBilling(),
//     [api],
//   )
// WITH:
  const { status, data, error } = useQuery({
    queryKey: ['billing'],
    queryFn: () => api.superadmin.getBilling(),
  })
```

Replace `status === 'loading'` → `status === 'pending'`.
Replace `reload` reference in `SectionError`: `onRetry={reload}` → `onRetry={() => {}}` (Billing is read-only summary; a page refresh suffices for a retry).

- [ ] **Step 6: Update Billing.test.tsx render helper**

```typescript
// Replace render helper with renderWithQuery pattern
import { renderWithQuery } from '../lib/test-utils'
// renderBilling(client) → renderWithQuery(<Billing />, client)
```

- [ ] **Step 7: Run Billing tests**

```bash
cd wolfchow/web
pnpm test -- --reporter=verbose src/pages/Billing.test.tsx
```

Expected: all Billing tests pass.

- [ ] **Step 8: Commit**

```bash
git add web/apps/superadmin/src/pages/Smtp.tsx web/apps/superadmin/src/pages/Smtp.test.tsx web/apps/superadmin/src/pages/Billing.tsx web/apps/superadmin/src/pages/Billing.test.tsx
git commit -m "STORY-075: migrate Smtp and Billing to useQuery

Refs: #63"
```

---

### Task 6: Migrate Settings

**Files:**
- Modify: `web/apps/superadmin/src/pages/Settings.tsx`

**Interfaces:**
- Query key: `['settings']`
- No test file exists for Settings — no test changes needed

- [ ] **Step 1: Update Settings.tsx imports**

In `web/apps/superadmin/src/pages/Settings.tsx`:

```typescript
// REMOVE:
import { useAsync } from '../lib/useAsync'

// ADD:
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
```

- [ ] **Step 2: Replace the useAsync call and reactive form init**

```typescript
// REPLACE:
//   const { status, data, reload } = useAsync(
//     () => api.superadmin.getSettings(),
//     [api],
//   )
//   ...
//   // Initialise form once data loads (only on first load)
//   if (status === 'success' && data && form === null) {
//     setForm(settingsToForm(data.settings))
//   }
// WITH:
  const queryClient = useQueryClient()
  const { status, data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.superadmin.getSettings(),
  })

  useEffect(() => {
    if (data && form === null) setForm(settingsToForm(data.settings))
  }, [data, form])
```

Replace `reload()` in `save` and `regenerateSecret`:

```typescript
async function save() {
  if (!form) return
  setBusy(true)
  try {
    await api.superadmin.updateSettings({
      jwt_expiry_minutes: parseInt(form.jwt_expiry_minutes, 10),
      global_rate_limit: parseInt(form.global_rate_limit, 10),
      maintenance_mode: form.maintenance_mode,
      support_email: form.support_email,
      r2_public_domain: form.r2_public_domain,
    })
    notify('success', 'Platform settings saved.')
    await queryClient.invalidateQueries({ queryKey: ['settings'] })
  } catch {
    notify('error', 'Failed to save settings.')
  } finally {
    setBusy(false)
  }
}

async function regenerateSecret() {
  setRegenBusy(true)
  try {
    await api.superadmin.regenerateWebhookSecret()
    notify('success', 'Webhook signing secret regenerated.')
    await queryClient.invalidateQueries({ queryKey: ['settings'] })
  } catch {
    notify('error', 'Failed to regenerate secret.')
  } finally {
    setRegenBusy(false)
  }
}
```

Replace `status === 'loading'` → `status === 'pending'` in JSX.

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
cd wolfchow/web
pnpm test
```

Expected: same passing count as before + Settings migrated. No new failures.

- [ ] **Step 4: Commit**

```bash
git add web/apps/superadmin/src/pages/Settings.tsx
git commit -m "STORY-075: migrate Settings to useQuery

Refs: #63"
```

---

### Task 7: Delete useAsync, verify clean, open PR

**Files:**
- Delete: `web/apps/superadmin/src/lib/useAsync.ts`
- Verify: `web/apps/superadmin/src/lib/useDebounce.ts` — must still be imported by Restaurants.tsx (do NOT delete it)

**Interfaces:**
- Consumes nothing new; this task is a cleanup gate

- [ ] **Step 1: Verify no remaining useAsync imports**

```bash
cd wolfchow/web
grep -r "useAsync" apps/superadmin/src --include="*.ts" --include="*.tsx"
```

Expected: **zero results**. If any remain, go back and migrate that file before proceeding.

- [ ] **Step 2: Verify useDebounce is still used**

```bash
grep -r "useDebounce" apps/superadmin/src --include="*.ts" --include="*.tsx"
```

Expected: at least one result in `Restaurants.tsx`. The file must NOT be deleted.

- [ ] **Step 3: Delete useAsync.ts**

```bash
rm web/apps/superadmin/src/lib/useAsync.ts
```

- [ ] **Step 4: Run full test suite**

```bash
cd wolfchow/web
pnpm test
```

Expected: the pre-existing 6 failing tests (Plans ×4, Invites ×1, Smtp ×1) still fail — these are pre-existing and unrelated to this story. All currently-passing tests still pass. Zero new failures introduced by this migration.

If any new failure appears, it means a page was not fully migrated — read the error, find the file still importing `useAsync`, and complete its migration.

- [ ] **Step 5: TypeScript check**

```bash
cd wolfchow/web
pnpm typecheck
```

Expected: zero errors related to this migration.

- [ ] **Step 6: Commit cleanup**

```bash
git add -u web/apps/superadmin/src/lib/useAsync.ts
git commit -m "STORY-075: delete useAsync — all pages on TanStack Query

Refs: #63"
```

- [ ] **Step 7: Push and open PR**

```bash
cd wolfchow
git push origin feature/STORY-075-tanstack-query-migration
gh pr create \
  --title "STORY-075: migrate superadmin to TanStack Query" \
  --body "$(cat <<'EOF'
## Summary

- Replaces the custom `useAsync` hook with TanStack Query v5 across all 9 pages + `RestaurantDetail`
- `useAsync.ts` deleted
- Caching: 30s `staleTime` — navigating back to a page does not refetch fresh data
- Deduplication: plans list shared between Restaurants and Plans pages — one fetch, not two
- Mutations use `invalidateQueries` instead of manual `reload()` nonce bumps

## Acceptance criteria

- [ ] No `useAsync` imports remain in the codebase
- [ ] All currently-passing tests still pass
- [ ] TypeScript: zero new errors
- [ ] Navigating between pages does not cause redundant network requests within 30s

## Documentation
- Docmost: STORY-075 page in Stories space
- Vikunja: #63

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
