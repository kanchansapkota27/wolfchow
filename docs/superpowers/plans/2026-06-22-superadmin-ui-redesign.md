# Superadmin UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all superadmin pages from an all-dark theme to a dark-sidebar + light-content layout matching the reference screenshots, and add a new Settings page.

**Architecture:** Replace the Layout shell with a responsive dark-navy sidebar (fixed on desktop, drawer on mobile) containing Lucide icons. All page content areas switch to white cards on a light-gray background. All business logic, hooks, and API calls remain completely unchanged. The Settings page is added as a new route wired to `api.superadmin.getSettings` / `api.superadmin.updateSettings`.

**Tech Stack:** React 19, TailwindCSS v4, lucide-react (new dep), react-router v7, `@wolfchow/ui`, `@wolfchow/auth`, `@wolfchow/types`

## Global Constraints

- Never touch any `useAsync`, `useApi`, API call, or business logic — visual layer only (except Settings which is new)
- All existing modals (`Modal`, `PlanFormModal`, `GenerateInviteModal`, etc.) are unchanged
- Sidebar color: `bg-[#1e2235]`; active nav pill: `bg-blue-500`; main bg: `bg-gray-100`; cards: `bg-white border border-gray-200 rounded-xl`
- Table headers: `text-xs font-semibold tracking-wider text-gray-500 uppercase px-4 py-3`
- Table rows: `border-b border-gray-100 hover:bg-gray-50`
- Primary button in page header: `bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2`
- `lucide-react` icon size: `size={18}` for nav, `size={16}` for inline
- Branch: `feature/superadmin-ui-redesign` off `main`

---

## File Map

| File | Action |
|---|---|
| `web/apps/superadmin/package.json` | Add `lucide-react` dep |
| `web/apps/superadmin/src/components/Layout.tsx` | Full rewrite |
| `web/apps/superadmin/src/components/PageHeader.tsx` | New |
| `web/apps/superadmin/src/App.tsx` | Add `/settings` route |
| `web/apps/superadmin/src/pages/Dashboard.tsx` | Restyle |
| `web/apps/superadmin/src/pages/Restaurants.tsx` | Restyle |
| `web/apps/superadmin/src/pages/Plans.tsx` | Restyle |
| `web/apps/superadmin/src/pages/Invites.tsx` | Restyle |
| `web/apps/superadmin/src/pages/Smtp.tsx` | Restyle |
| `web/apps/superadmin/src/pages/Billing.tsx` | Restyle |
| `web/apps/superadmin/src/pages/Audit.tsx` | Restyle (logic unchanged) |
| `web/apps/superadmin/src/pages/Settings.tsx` | New |

---

## Task 1: Branch + install lucide-react + rewrite Layout

**Files:**
- Modify: `web/apps/superadmin/package.json`
- Rewrite: `web/apps/superadmin/src/components/Layout.tsx`

**Interfaces:**
- Produces: `Layout` component — responsive shell used by all protected routes

- [ ] **Step 1: Create feature branch**

```bash
cd wolfchow
git checkout main && git pull origin main
git checkout -b feature/superadmin-ui-redesign
```

- [ ] **Step 2: Install lucide-react**

```bash
cd web/apps/superadmin
pnpm add lucide-react
```

Expected: `lucide-react` appears in `package.json` dependencies, `pnpm-lock.yaml` updated.

- [ ] **Step 3: Rewrite Layout.tsx**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import {
  LayoutDashboard,
  Store,
  CreditCard,
  UserPlus,
  Mail,
  BarChart2,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
} from 'lucide-react'
import { ImpersonationBanner, useAuth } from '@wolfchow/auth'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/restaurants', label: 'Restaurants', icon: Store },
  { to: '/plans', label: 'Plans', icon: CreditCard },
  { to: '/invites', label: 'Invites', icon: UserPlus },
  { to: '/smtp', label: 'SMTP', icon: Mail },
  { to: '/billing', label: 'Billing', icon: BarChart2 },
  { to: '/audit', label: 'Audit Log', icon: ClipboardList },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Layout() {
  const { user, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const initial = (user?.email ?? 'S')[0].toUpperCase()

  const sidebarContent = (
    <div className="flex h-full w-64 flex-col bg-[#1e2235]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 font-bold text-white text-sm">
          R
        </div>
        <span className="text-lg font-semibold text-white">Restro SA</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white',
              ].join(' ')
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-3 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-600 text-sm font-semibold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-white">{user?.email ?? 'Signed in'}</p>
            <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
              {user?.role ?? 'superadmin'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Desktop sidebar — always visible ≥ md */}
      <aside className="hidden md:flex md:shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-30 flex md:hidden">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
          <button
            type="button"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
            Platform Management
          </span>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8">
          <ImpersonationBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify dev server starts without errors**

```bash
cd web/apps/superadmin
pnpm dev
```

Open http://localhost:5173 — expect: dark navy sidebar, "Restro SA" logo, 8 nav items with icons, white topbar, light gray main area. Mobile (<768px): hamburger icon appears.

- [ ] **Step 5: Commit**

```bash
cd wolfchow
git add web/apps/superadmin/package.json web/apps/superadmin/src/components/Layout.tsx
git commit -m "feat: redesign superadmin Layout with dark sidebar, Lucide icons, responsive drawer"
```

---

## Task 2: PageHeader component + Settings route wiring

**Files:**
- Create: `web/apps/superadmin/src/components/PageHeader.tsx`
- Modify: `web/apps/superadmin/src/App.tsx`

**Interfaces:**
- Produces: `PageHeader({ title, subtitle?, action? })` — used by every page
- Produces: `/settings` route wired, imports `Settings` page (created in Task 10)

- [ ] **Step 1: Create PageHeader.tsx**

```tsx
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Add /settings route to App.tsx**

Replace the full `App.tsx` with:

```tsx
import { Route, Routes } from 'react-router'
import { LoginPage, RequireRole } from '@wolfchow/auth'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Plans } from './pages/Plans'
import { Invites } from './pages/Invites'
import { Restaurants } from './pages/Restaurants'
import { Smtp } from './pages/Smtp'
import { Billing } from './pages/Billing'
import { Audit } from './pages/Audit'
import { Settings } from './pages/Settings'

function ProtectedLayout() {
  return (
    <RequireRole
      roles={['superadmin', 'support']}
      fallback={<div className="p-8 text-gray-600">Loading…</div>}
    >
      <Layout />
    </RequireRole>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage methods={['staff']} />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="restaurants" element={<Restaurants />} />
        <Route path="plans" element={<Plans />} />
        <Route path="invites" element={<Invites />} />
        <Route path="smtp" element={<Smtp />} />
        <Route path="billing" element={<Billing />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 3: Create a temporary Settings stub so the app compiles**

Create `web/apps/superadmin/src/pages/Settings.tsx` temporarily:

```tsx
export function Settings() {
  return <div className="text-gray-600">Settings — coming in Task 10</div>
}
```

- [ ] **Step 4: Verify**

```bash
pnpm dev
```

Navigate to http://localhost:5173/settings — expect "Settings — coming in Task 10" text. No console errors.

- [ ] **Step 5: Commit**

```bash
cd wolfchow
git add web/apps/superadmin/src/components/PageHeader.tsx web/apps/superadmin/src/App.tsx web/apps/superadmin/src/pages/Settings.tsx
git commit -m "feat: add PageHeader component and wire /settings route"
```

---

## Task 3: Restyle Dashboard

**Files:**
- Modify: `web/apps/superadmin/src/pages/Dashboard.tsx`
- Modify: `web/apps/superadmin/src/components/MetricCard.tsx` (check current styling, adapt for light theme)

**Interfaces:**
- Consumes: `PageHeader` from `../components/PageHeader`

- [ ] **Step 1: Read MetricCard to understand current dark styling**

Open `web/apps/superadmin/src/components/MetricCard.tsx`. Note its background/text classes.

- [ ] **Step 2: Update MetricCard for light theme**

Replace `bg-gray-900 border-gray-800 text-gray-400 text-gray-100` with `bg-white border-gray-200 text-gray-500 text-gray-900`. The exact replacement depends on what you find, but the pattern is:

```tsx
// MetricCard card wrapper: change from dark to white card
<div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
  <p className="text-sm text-gray-500">{label}</p>
  <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
</div>

// MetricCardSkeleton: change from dark pulse to light pulse
<div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
  <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
  <div className="mt-3 h-8 w-16 animate-pulse rounded bg-gray-200" />
</div>
```

- [ ] **Step 3: Rewrite Dashboard.tsx**

```tsx
import { formatCurrency } from '@wolfchow/utils'
import { ApiError } from '@wolfchow/api-client'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
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
  const { status, data, error, reload } = useAsync(async () => {
    const [billing, active] = await Promise.all([
      api.superadmin.getBilling(),
      api.superadmin.listRestaurants({ active: true }),
    ])
    return {
      summary: (billing.summary ?? []) as SummaryRow[],
      activeCount: active.total,
    }
  }, [api])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Platform overview at a glance."
      />

      {status === 'loading' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      ) : status === 'error' || !data ? (
        <SectionError message={toMessage(error)} onRetry={reload} />
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

- [ ] **Step 4: Verify**

```bash
pnpm dev
```

Navigate to http://localhost:5173 — expect: white metric cards on gray background, "Dashboard" title with subtitle. Cards should show values with dark text on white bg.

- [ ] **Step 5: Commit**

```bash
cd wolfchow
git add web/apps/superadmin/src/pages/Dashboard.tsx web/apps/superadmin/src/components/MetricCard.tsx
git commit -m "feat: restyle Dashboard and MetricCard to light theme"
```

---

## Task 4: Restyle Restaurants

**Files:**
- Modify: `web/apps/superadmin/src/pages/Restaurants.tsx`

**Interfaces:**
- Consumes: `PageHeader` from `../components/PageHeader`

- [ ] **Step 1: Rewrite Restaurants.tsx**

```tsx
import { useState } from 'react'
import { Badge, Button, Input } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { Plus } from 'lucide-react'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { RestaurantDetail } from '../components/RestaurantDetail'
import { CreateRestaurantModal } from '../components/CreateRestaurantModal'
import { PageHeader } from '../components/PageHeader'

export function Restaurants() {
  const api = useApi()
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const plansAsync = useAsync(() => api.superadmin.listPlans(), [api])
  const list = useAsync(
    () =>
      api.superadmin.listRestaurants({
        search: search || undefined,
        plan_id: planFilter || undefined,
        active: statusFilter || undefined,
      }),
    [api, search, planFilter, statusFilter],
  )

  const plans = plansAsync.data?.plans ?? []
  const rows = list.data?.restaurants ?? []

  return (
    <div>
      <PageHeader
        title="Restaurants"
        subtitle="Manage all tenants on the platform."
        action={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            Create Restaurant
          </button>
        }
      />

      {/* Filters */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Search"
            placeholder="Name or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Plan</span>
            <select
              aria-label="Filter by plan"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All plans</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Status</span>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Suspended</option>
            </select>
          </label>
        </div>
      </div>

      {list.status === 'error' && <SectionError onRetry={list.reload} />}

      {list.status !== 'error' && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Slug</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Orders 30d</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Commission</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Billing Note</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                      {list.status === 'loading' ? 'Loading…' : 'No restaurants found.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r.id)}
                      className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{r.slug}</code>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.display_name}</td>
                      <td className="px-4 py-3">
                        {r.plan_name ? <Badge variant="indigo">{r.plan_name}</Badge> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={r.active ? 'green' : 'red'}>
                          {r.active ? 'Active' : 'Suspended'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.order_count_30d}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.override_commission_value !== null
                          ? r.override_commission_type === 'fixed'
                            ? `$${(r.override_commission_value / 100).toFixed(2)}/mo ↑`
                            : `${(r.override_commission_value / 100).toFixed(2)}% ↑`
                          : 'Plan default'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.billing_note ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(r.created_at, 'UTC')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <RestaurantDetail
          restaurantId={selected}
          plans={plans}
          onClose={() => setSelected(null)}
          onChanged={() => list.reload()}
        />
      )}

      <CreateRestaurantModal
        open={createOpen}
        plans={plans}
        onClose={() => setCreateOpen(false)}
        onCreated={() => list.reload()}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Navigate to http://localhost:5173/restaurants — expect: white filter card, white table with light gray separators, uppercase gray column headers. Clicking a row still opens the RestaurantDetail panel.

- [ ] **Step 3: Commit**

```bash
cd wolfchow
git add web/apps/superadmin/src/pages/Restaurants.tsx
git commit -m "feat: restyle Restaurants page to light theme"
```

---

## Task 5: Restyle Plans

**Files:**
- Modify: `web/apps/superadmin/src/pages/Plans.tsx`

**Interfaces:**
- Consumes: `PageHeader` from `../components/PageHeader`

- [ ] **Step 1: Rewrite Plans.tsx**

```tsx
import { useState } from 'react'
import type { Plan, PlanInput } from '@wolfchow/types'
import { Button, Modal } from '@wolfchow/ui'
import { Pencil, Trash2, Plus, Users, ShoppingBag, List, Layers, Mail, Clock } from 'lucide-react'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { PlanFormModal } from '../components/PlanFormModal'
import { FEATURE_FLAGS, PAYMENT_METHODS } from '../lib/planMeta'
import { PageHeader } from '../components/PageHeader'

type Editing = Plan | null | undefined

export function Plans() {
  const api = useApi()
  const { status, data, reload } = useAsync(() => api.superadmin.listPlans(), [api])
  const [editing, setEditing] = useState<Editing>(undefined)
  const [deleting, setDeleting] = useState<Plan | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  async function handleSubmit(input: PlanInput) {
    const target = editing
    if (target) await api.superadmin.updatePlan(target.id, input)
    else await api.superadmin.createPlan(input)
    reload()
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await api.superadmin.deletePlan(deleting.id)
      setDeleting(null)
      reload()
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

      {status === 'loading' && (
        <p className="text-sm text-gray-500">Loading plans…</p>
      )}
      {status === 'error' && <SectionError onRetry={reload} />}

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
      {/* Header */}
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

      {/* Capability grid */}
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

      {/* Feature flags */}
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

      {/* Payment methods */}
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

- [ ] **Step 2: Verify**

Navigate to http://localhost:5173/plans — expect: white plan cards in a responsive grid, capability grid with icons and labels, green feature flag badges, payment method pills, edit/delete icon buttons top-right of each card.

- [ ] **Step 3: Commit**

```bash
cd wolfchow
git add web/apps/superadmin/src/pages/Plans.tsx
git commit -m "feat: restyle Plans page with light cards and icon capability grid"
```

---

## Task 6: Restyle Invites

**Files:**
- Modify: `web/apps/superadmin/src/pages/Invites.tsx`

**Interfaces:**
- Consumes: `PageHeader` from `../components/PageHeader`

- [ ] **Step 1: Rewrite Invites.tsx**

```tsx
import { useMemo, useState } from 'react'
import type { InviteStatus, InviteSummary } from '@wolfchow/types'
import { Badge, type BadgeVariant, Button, Modal } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { Plus, Filter, Copy } from 'lucide-react'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { GenerateInviteModal } from '../components/GenerateInviteModal'
import { PageHeader } from '../components/PageHeader'

const STATUS_BADGE: Record<InviteStatus, { variant: BadgeVariant; label: string }> = {
  pending: { variant: 'amber', label: 'Pending' },
  used: { variant: 'green', label: 'Used' },
  expired: { variant: 'red', label: 'Expired' },
  revoked: { variant: 'gray', label: 'Revoked' },
}

const FILTERS = ['all', 'pending', 'used', 'expired'] as const
type Filter = (typeof FILTERS)[number]

export function Invites() {
  const api = useApi()
  const { status, data, reload } = useAsync(async () => {
    const [invites, plans] = await Promise.all([
      api.superadmin.listInvites(),
      api.superadmin.listPlans(),
    ])
    return { invites: invites.invites, plans: plans.plans }
  }, [api])

  const [filter, setFilter] = useState<Filter>('all')
  const [statusDropdown, setStatusDropdown] = useState('all')
  const [search, setSearch] = useState('')
  const [genOpen, setGenOpen] = useState(false)
  const [revoking, setRevoking] = useState<InviteSummary | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)

  const planName = useMemo(() => {
    const map = new Map<string, string>()
    for (const plan of data?.plans ?? []) map.set(plan.id, plan.name)
    return (id: string) => map.get(id) ?? '—'
  }, [data])

  const filtered = (data?.invites ?? []).filter((inv) => {
    const matchStatus = statusDropdown === 'all' ? true : inv.status === statusDropdown
    const matchSearch = search
      ? inv.token.toLowerCase().includes(search.toLowerCase()) ||
        (inv.email ?? '').toLowerCase().includes(search.toLowerCase())
      : true
    return matchStatus && matchSearch
  })

  async function confirmRevoke() {
    if (!revoking) return
    setRevokeBusy(true)
    try {
      await api.superadmin.revokeInvite(revoking.id)
      setRevoking(null)
      reload()
    } finally {
      setRevokeBusy(false)
    }
  }

  function copyToken(token: string) {
    void navigator.clipboard.writeText(token)
  }

  return (
    <div>
      <PageHeader
        title="Restaurant Invites"
        subtitle="Issue and track private signup tokens for new restaurants."
        action={
          <button
            type="button"
            onClick={() => setGenOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            Generate Invite
          </button>
        }
      />

      {/* Search + filter */}
      <div className="mb-4 flex gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by token or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          />
          <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-gray-400" />
          <select
            aria-label="Filter by status"
            value={statusDropdown}
            onChange={(e) => setStatusDropdown(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Status</option>
            {FILTERS.filter((f) => f !== 'all').map((f) => (
              <option key={f} value={f} className="capitalize">{f.charAt(0).toUpperCase() + f.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {status === 'loading' && <p className="text-sm text-gray-500">Loading invites…</p>}
      {status === 'error' && <SectionError onRetry={reload} />}

      {status === 'success' && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Token</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Commission</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Email (Pre-assign)</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Expires</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                      No invites found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => {
                    const badge = STATUS_BADGE[inv.status]
                    return (
                      <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-blue-600">
                            {inv.token.slice(0, 12)}…
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-900">{planName(inv.plan_id)}</td>
                        <td className="px-4 py-3 text-gray-600">{+(inv.commission_rate * 100).toFixed(2)}%</td>
                        <td className="px-4 py-3 text-gray-400 italic">{inv.email ?? 'Anyone'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(inv.expires_at, 'UTC')}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title="Copy token"
                              onClick={() => copyToken(inv.token)}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            >
                              <Copy size={14} />
                            </button>
                            {inv.status === 'pending' && (
                              <Button variant="ghost" onClick={() => setRevoking(inv)}>
                                Revoke
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <GenerateInviteModal
        open={genOpen}
        plans={data?.plans ?? []}
        onClose={() => { setGenOpen(false); reload() }}
        onCreate={(input) => api.superadmin.createInvite(input)}
      />

      <Modal open={revoking !== null} onClose={() => setRevoking(null)} title="Revoke invite">
        <div>
          <p className="text-gray-700">Revoke this invite? The link will stop working immediately.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="danger" loading={revokeBusy} onClick={() => void confirmRevoke()}>
              Revoke
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Navigate to http://localhost:5173/invites — expect: search bar + status dropdown in white card, table with token in blue monospace, status badges, copy icon button. Generate Invite button top-right.

- [ ] **Step 3: Commit**

```bash
cd wolfchow
git add web/apps/superadmin/src/pages/Invites.tsx
git commit -m "feat: restyle Invites page with search bar and light table"
```

---

## Task 7: Restyle SMTP

**Files:**
- Modify: `web/apps/superadmin/src/pages/Smtp.tsx`

**Interfaces:**
- Consumes: `PageHeader` from `../components/PageHeader`

- [ ] **Step 1: Restyle Smtp.tsx**

The business logic (all state, API calls, form handlers, modals) is unchanged. Only the shell JSX and class names change. Apply these replacements throughout the file:

**SmtpGlobalCard** wrapper: change from `rounded-lg border border-gray-800 bg-gray-900 p-6` → `rounded-xl border border-gray-200 bg-white p-6`

**SmtpGlobalCard** header title: `text-lg font-semibold` → `text-lg font-semibold text-gray-900`

**SmtpGlobalCard** dl labels: `text-gray-400` → `text-gray-500`

**SmtpGlobalCard** dl values: `text-gray-100` → `text-gray-900`

**SmtpOverridesTable** wrapper: `rounded-lg border border-gray-800` → `overflow-hidden rounded-xl border border-gray-200`

**SmtpOverridesTable** thead: `bg-gray-900 text-gray-400` → remove bg, add `border-b border-gray-200`; th: add `text-xs font-semibold tracking-wider text-gray-500 uppercase px-4 py-3`

**SmtpOverridesTable** rows: `border-t border-gray-800` → `border-b border-gray-100 hover:bg-gray-50`; td text: `text-gray-100` → `text-gray-900`, `text-gray-500` → `text-gray-500`

**BillingNoteCell** inline input: `border-gray-600 bg-gray-800 text-gray-100` → `border-gray-200 bg-white text-gray-900`

**Page Smtp function**: replace the top with:

```tsx
export function Smtp() {
  // ... keep all existing state and handlers unchanged ...

  const hasGlobal = globalQ.data?.config != null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform SMTP"
        subtitle="Manage global fallback credentials and restaurant-specific overrides."
        action={
          hasGlobal ? (
            <span className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Global Fallback Active
            </span>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Global settings card */}
        <div>
          {globalQ.status === 'loading' && <p className="text-sm text-gray-500">Loading…</p>}
          {globalQ.status === 'error' && <SectionError onRetry={globalQ.reload} />}
          {globalQ.status === 'success' && (
            <SmtpGlobalCard config={globalQ.data?.config ?? null} onSaved={globalQ.reload} />
          )}
        </div>

        {/* Overrides card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              Restaurant Overrides
            </h2>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              + Add Override
            </button>
          </div>
          {overridesQ.status === 'loading' && <p className="text-sm text-gray-500">Loading…</p>}
          {overridesQ.status === 'error' && <SectionError onRetry={overridesQ.reload} />}
          {overridesQ.status === 'success' && (
            <SmtpOverridesTable
              overrides={overridesQ.data?.overrides ?? []}
              onDelete={setDeleting}
            />
          )}
        </div>
      </div>

      {/* Modals unchanged */}
      <AddSmtpOverrideModal ... />
      <Modal ... />
    </div>
  )
}
```

Write the complete file preserving all existing sub-component logic and only changing classNames and the layout shell as described above.

- [ ] **Step 2: Verify**

Navigate to http://localhost:5173/smtp — expect: two-column layout on desktop (global settings left, overrides right), white cards, "Global Fallback Active" badge in header if configured.

- [ ] **Step 3: Commit**

```bash
cd wolfchow
git add web/apps/superadmin/src/pages/Smtp.tsx
git commit -m "feat: restyle SMTP page to light two-column layout"
```

---

## Task 8: Restyle Billing

**Files:**
- Modify: `web/apps/superadmin/src/pages/Billing.tsx`

**Interfaces:**
- Consumes: `PageHeader` from `../components/PageHeader`

- [ ] **Step 1: Restyle Billing.tsx**

Keep all business logic (CSV export, BillingNoteCell, MonthlyDetailModal, totals calculation) unchanged. Apply these visual changes:

**Totals summary cards**: change from `rounded-lg border border-gray-800 bg-gray-900 p-4` → `rounded-xl border border-gray-200 bg-white p-4`; `text-gray-400` → `text-gray-500`; `text-gray-100` → `text-gray-900`

**Main table wrapper**: `rounded-lg border border-gray-800` → `overflow-hidden rounded-xl border border-gray-200 bg-white`

**Table thead**: `bg-gray-900 text-gray-400` → remove bg; add `border-b border-gray-200`; th: `text-xs font-semibold tracking-wider text-gray-500 uppercase px-4 py-3`

**Table rows**: `border-t border-gray-800` → `border-b border-gray-100`; `text-gray-100` → `text-gray-900`; `text-gray-300` → `text-gray-600`; `text-gray-500` → `text-gray-500`

**BillingNoteCell** inline input: `border-gray-600 bg-gray-800 text-gray-100 focus:border-indigo-500` → `border-gray-200 bg-white text-gray-900 focus:border-blue-500`; edit button color: `text-indigo-400 hover:text-indigo-300` → `text-blue-500 hover:text-blue-700`

**Page header**: replace with:

```tsx
<PageHeader
  title="Billing & Commission"
  subtitle={data?.cached ? 'Cached — refreshes every 5 min' : 'Per-restaurant commission and order volume.'}
  action={
    <button
      type="button"
      disabled={rows.length === 0}
      onClick={() => exportCsv(rows)}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
    >
      Export CSV
    </button>
  }
/>
```

**MonthlyDetailModal** inner table: apply same thead/row patterns (`border-gray-200`/`border-gray-100`). Chart `CartesianGrid stroke` → `#e5e7eb`. Chart tooltip bg → `#ffffff` with `border: '1px solid #e5e7eb'`. `labelStyle` color → `#111827`. `itemStyle` color → `#374151`. XAxis/YAxis tick fill → `#6b7280`.

- [ ] **Step 2: Verify**

Navigate to http://localhost:5173/billing — expect: three white summary metric cards, white billing table with clickable "Details" button per row, monthly bar chart modal opens with light-styled chart.

- [ ] **Step 3: Commit**

```bash
cd wolfchow
git add web/apps/superadmin/src/pages/Billing.tsx
git commit -m "feat: restyle Billing page and monthly detail chart to light theme"
```

---

## Task 9: Restyle Audit Log

**Files:**
- Modify: `web/apps/superadmin/src/pages/Audit.tsx`

**Interfaces:**
- Consumes: `PageHeader` from `../components/PageHeader`
- All logic (5 filters, DiffPanel, pagination, `toggleRow`) unchanged

- [ ] **Step 1: Rewrite Audit.tsx**

```tsx
import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import type { AuditEntry, RestaurantListItem } from '@wolfchow/types'
import { Badge } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { PageHeader } from '../components/PageHeader'

const TABLE_OPTIONS = [
  'auth', 'restaurants', 'plans', 'invites', 'users',
  'menu_categories', 'menu_items', 'modifier_groups', 'modifier_options',
  'orders', 'smtp_configs', 'device_tokens',
]

const OPERATION_OPTIONS = [
  'INSERT', 'UPDATE', 'DELETE',
  'LOGIN', 'LOGOUT', 'DEVICE_LOGIN',
  'IMPERSONATION_START', 'IMPERSONATION_END',
]

type BadgeVariant = 'green' | 'amber' | 'red' | 'indigo' | 'gray'

function operationVariant(op: string): BadgeVariant {
  if (op === 'INSERT' || op === 'LOGIN' || op === 'DEVICE_LOGIN') return 'green'
  if (op === 'UPDATE') return 'amber'
  if (op === 'DELETE' || op === 'LOGOUT') return 'red'
  if (op.startsWith('IMPERSONATION')) return 'indigo'
  return 'gray'
}

function operationLabel(op: string): string {
  if (op === 'IMPERSONATION_START') return 'Impersonation ▶'
  if (op === 'IMPERSONATION_END') return 'Impersonation ■'
  if (op === 'DEVICE_LOGIN') return 'Device Login'
  return op.charAt(0) + op.slice(1).toLowerCase()
}

function DiffPanel({
  old_data,
  new_data,
}: {
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}) {
  const changedKeys = useMemo(() => {
    const keys = [...new Set([...Object.keys(old_data ?? {}), ...Object.keys(new_data ?? {})])]
    return keys.filter((k) => JSON.stringify((old_data ?? {})[k]) !== JSON.stringify((new_data ?? {})[k]))
  }, [old_data, new_data])

  if (changedKeys.length === 0 && !new_data) {
    return <p className="py-2 text-xs text-gray-400">No data recorded.</p>
  }

  if (changedKeys.length === 0) {
    return (
      <div className="text-xs">
        <p className="mb-2 text-gray-500">No field changes detected.</p>
        {new_data && (
          <pre className="overflow-x-auto rounded-lg bg-gray-100 p-3 text-gray-600">
            {JSON.stringify(new_data, null, 2)}
          </pre>
        )}
      </div>
    )
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-500">
          <th className="pb-1 pr-4 font-medium">Field</th>
          <th className="pb-1 pr-4 font-medium text-red-500">Before</th>
          <th className="pb-1 font-medium text-green-600">After</th>
        </tr>
      </thead>
      <tbody>
        {changedKeys.map((key) => (
          <tr key={key} className="border-t border-gray-200">
            <td className="py-1 pr-4 font-mono text-gray-600">{key}</td>
            <td className="py-1 pr-4 font-mono text-red-600">
              {old_data && key in old_data ? (
                <span className="rounded bg-red-50 px-1">{JSON.stringify((old_data)[key])}</span>
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </td>
            <td className="py-1 font-mono text-green-700">
              {new_data && key in new_data ? (
                <span className="rounded bg-green-50 px-1">{JSON.stringify((new_data)[key])}</span>
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Audit() {
  const api = useApi()

  const restaurantsQ = useAsync(
    () => api.superadmin.listRestaurants({ page_size: 500 }),
    [api],
  )
  const restaurants: RestaurantListItem[] = restaurantsQ.data?.restaurants ?? []
  const restaurantMap = useMemo(
    () => new Map(restaurants.map((r) => [r.id, r])),
    [restaurants],
  )

  const [restaurantFilter, setRestaurantFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [operationFilter, setOperationFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const auditQ = useAsync(
    () =>
      api.superadmin.listAudit({
        restaurant_id: restaurantFilter || undefined,
        table_name: tableFilter || undefined,
        operation: operationFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
      }),
    [api, restaurantFilter, tableFilter, operationFilter, dateFrom, dateTo, page],
  )

  const entries: AuditEntry[] = auditQ.data?.entries ?? []
  const total = auditQ.data?.total ?? 0
  const pageSize = auditQ.data?.page_size ?? 50
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = Math.min(page * pageSize, total)

  function toggleRow(id: string) {
    setExpanded((cur) => (cur === id ? null : id))
  }

  function clearFilters() {
    setRestaurantFilter('')
    setTableFilter('')
    setOperationFilter('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setPage(1)
  }

  const selectClass = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform Audit Log"
        subtitle="Every administrative action across the platform is tracked here."
      />

      {/* Filter card */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        {/* Row 1: search + table + operation */}
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by record ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <select aria-label="Filter by table" className={selectClass} value={tableFilter} onChange={(e) => { setTableFilter(e.target.value); setPage(1) }}>
            <option value="">All Tables</option>
            {TABLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select aria-label="Filter by operation" className={selectClass} value={operationFilter} onChange={(e) => { setOperationFilter(e.target.value); setPage(1) }}>
            <option value="">All Operations</option>
            {OPERATION_OPTIONS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
        </div>

        {/* Row 2: restaurant + dates + clear */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <select aria-label="Filter by restaurant" className={selectClass} value={restaurantFilter} onChange={(e) => { setRestaurantFilter(e.target.value); setPage(1) }}>
            <option value="">All Restaurants</option>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
          </select>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Date from</label>
            <input type="date" aria-label="Date from" className={selectClass} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Date to</label>
            <input type="date" aria-label="Date to" className={selectClass} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} />
          </div>
          <button type="button" onClick={clearFilters} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Clear
          </button>
          {auditQ.status === 'success' && (
            <span className="ml-auto text-xs text-gray-400">
              {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>
      </div>

      {auditQ.status === 'loading' && <p className="text-sm text-gray-500">Loading…</p>}
      {auditQ.status === 'error' && <SectionError onRetry={auditQ.reload} />}

      {auditQ.status === 'success' && (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Timestamp</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Restaurant</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Table</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Operation</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                        No audit entries match your filters.
                      </td>
                    </tr>
                  ) : (
                    entries.map((e) => {
                      const rest = e.restaurant_id ? restaurantMap.get(e.restaurant_id) : null
                      return (
                        <Fragment key={e.id}>
                          <tr
                            className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                            onClick={() => toggleRow(e.id)}
                            aria-expanded={expanded === e.id}
                          >
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                              {formatDate(e.created_at, 'UTC')}
                            </td>
                            <td className="px-4 py-3">
                              {rest ? (
                                <div>
                                  <span className="font-medium text-gray-900">{rest.display_name}</span>
                                  <div className="text-xs text-gray-400">{e.restaurant_id}</div>
                                </div>
                              ) : e.restaurant_id ? (
                                <code className="text-xs text-gray-500">{e.restaurant_id}</code>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {e.table_name ?? <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={operationVariant(e.operation)}>
                                {operationLabel(e.operation)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {e.user_name ?? <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-400">
                              {expanded === e.id
                                ? <ChevronUp size={15} />
                                : <ChevronDown size={15} />}
                            </td>
                          </tr>
                          {expanded === e.id && (
                            <tr className="border-b border-gray-100 bg-gray-50">
                              <td colSpan={6} className="px-6 py-4">
                                <DiffPanel old_data={e.old_data} new_data={e.new_data} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">
                Showing {pageStart} to {pageEnd} of {total.toLocaleString()} entries
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Navigate to http://localhost:5173/audit — expect: filter card with search input + table/operation dropdowns + restaurant dropdown + date pickers + clear; white table with chevron expand; diff panel on white/gray bg; "Showing X to Y of Z entries" footer with Previous/Next buttons.

- [ ] **Step 3: Commit**

```bash
cd wolfchow
git add web/apps/superadmin/src/pages/Audit.tsx
git commit -m "feat: restyle Audit Log to light theme, preserve all filter and diff functionality"
```

---

## Task 10: New Settings page

**Files:**
- Rewrite: `web/apps/superadmin/src/pages/Settings.tsx` (replace the stub from Task 2)

**Interfaces:**
- Consumes: `PageHeader` from `../components/PageHeader`
- Consumes: `api.superadmin.getSettings()` → `{ settings: PlatformSettings }`
- Consumes: `api.superadmin.updateSettings(body: Partial<PlatformSettings>)` → `{ settings: PlatformSettings }`
- `PlatformSettings` shape inferred from reference: `{ jwt_expiry_minutes: number; global_rate_limit: number; maintenance_mode: boolean; support_email: string; r2_public_domain: string; webhook_signing_secret: string }`

**Note:** Check `@wolfchow/types` for the actual `PlatformSettings` type before writing the file. If it doesn't exist, define it inline as shown below.

- [ ] **Step 1: Rewrite Settings.tsx**

```tsx
import { useState } from 'react'
import { Lock, Zap, Database, Eye, EyeOff, RotateCcw, Save } from 'lucide-react'
import { useToast } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { PageHeader } from '../components/PageHeader'

interface PlatformSettings {
  jwt_expiry_minutes: number
  global_rate_limit: number
  maintenance_mode: boolean
  support_email: string
  r2_public_domain: string
  webhook_signing_secret: string
}

interface FormState {
  jwt_expiry_minutes: string
  global_rate_limit: string
  maintenance_mode: boolean
  support_email: string
  r2_public_domain: string
}

function settingsToForm(s: PlatformSettings): FormState {
  return {
    jwt_expiry_minutes: String(s.jwt_expiry_minutes),
    global_rate_limit: String(s.global_rate_limit),
    maintenance_mode: s.maintenance_mode,
    support_email: s.support_email,
    r2_public_domain: s.r2_public_domain,
  }
}

export function Settings() {
  const api = useApi()
  const { notify } = useToast()

  const { status, data, reload } = useAsync(
    () => api.superadmin.getSettings(),
    [api],
  )

  const [form, setForm] = useState<FormState | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [regenBusy, setRegenBusy] = useState(false)

  // Initialise form once data loads (only on first load)
  if (status === 'success' && data && form === null) {
    setForm(settingsToForm(data.settings))
  }

  function field<K extends keyof FormState>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => f ? { ...f, [key]: e.target.value } : f)
  }

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
      reload()
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
      reload()
    } catch {
      notify('error', 'Failed to regenerate secret.')
    } finally {
      setRegenBusy(false)
    }
  }

  const labelClass = 'block text-xs font-semibold tracking-wider text-gray-500 uppercase mb-1.5'
  const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none'
  const hintClass = 'mt-1 text-xs text-gray-400'

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Platform Settings"
        subtitle="Configure global security, feature toggles, and system-wide defaults."
      />

      {status === 'loading' && <p className="text-sm text-gray-500">Loading settings…</p>}
      {status === 'error' && <SectionError onRetry={reload} />}

      {status === 'success' && form && (
        <>
          {/* Security & Authentication */}
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold text-gray-900">
              <Lock size={18} className="text-amber-500" />
              Security &amp; Authentication
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelClass}>JWT Expiry (Minutes)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.jwt_expiry_minutes}
                  onChange={field('jwt_expiry_minutes')}
                  min={5}
                  max={10080}
                />
                <p className={hintClass}>Controls how long a user session lasts before requiring refresh.</p>
              </div>
              <div>
                <label className={labelClass}>Global Rate Limit</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.global_rate_limit}
                  onChange={field('global_rate_limit')}
                  min={1}
                />
                <p className={hintClass}>Requests per minute per IP for the entire API.</p>
              </div>
            </div>
          </section>

          {/* System Toggles */}
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold text-gray-900">
              <Zap size={18} className="text-blue-500" />
              System Toggles
            </h2>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Maintenance Mode</p>
                <p className="mt-0.5 text-xs text-gray-500">Temporarily disable all restaurant widgets and admin panels.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.maintenance_mode}
                onClick={() => setForm((f) => f ? { ...f, maintenance_mode: !f.maintenance_mode } : f)}
                className={[
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                  form.maintenance_mode ? 'bg-blue-500' : 'bg-gray-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200',
                    form.maintenance_mode ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>
          </section>

          {/* Infrastructure */}
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold text-gray-900">
              <Database size={18} className="text-purple-500" />
              Infrastructure
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Support Email</label>
                <input
                  type="email"
                  className={inputClass}
                  value={form.support_email}
                  onChange={field('support_email')}
                  placeholder="support@restroapi.com"
                />
              </div>
              <div>
                <label className={labelClass}>R2 Public Domain</label>
                <input
                  type="text"
                  className={inputClass}
                  value={form.r2_public_domain}
                  onChange={field('r2_public_domain')}
                  placeholder="cdn.restroapi.com"
                />
              </div>
            </div>
            <div className="mt-5">
              <label className={labelClass}>Webhook Signing Secret</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    className={inputClass + ' pr-10'}
                    value={data.settings.webhook_signing_secret}
                    readOnly
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700"
                  >
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void regenerateSecret()}
                  disabled={regenBusy}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw size={14} className={regenBusy ? 'animate-spin' : ''} />
                  Regenerate
                </button>
              </div>
              <p className={hintClass}>Used to sign outbound events. Changing this will break existing integrations.</p>
            </div>
          </section>

          {/* Save */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Save size={15} />
              {busy ? 'Saving…' : 'Save Platform Settings'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
```

**Note on `api.superadmin.regenerateWebhookSecret`:** If this method doesn't exist on the API client yet, replace the call with `api.superadmin.updateSettings({ webhook_signing_secret: '' })` and add a comment. The UI structure remains the same.

- [ ] **Step 2: Verify**

Navigate to http://localhost:5173/settings — expect: three white section cards (Security, Toggles, Infrastructure), number inputs with hints, maintenance mode toggle switch, webhook secret with show/hide + regenerate, blue Save button at bottom. If the backend doesn't have `getSettings` yet, the page shows `SectionError` which is acceptable.

- [ ] **Step 3: Final check — all routes**

Walk through every route in the app and confirm:
- No dark backgrounds leak into the main content area
- No TypeScript errors in the console
- All modals still open and close correctly
- Audit log expand rows still work

- [ ] **Step 4: Commit**

```bash
cd wolfchow
git add web/apps/superadmin/src/pages/Settings.tsx
git commit -m "feat: add Settings page with Security, System Toggles, and Infrastructure sections"
```

---

## Task 11: Open PR

- [ ] **Step 1: Push branch**

```bash
cd wolfchow
git push -u origin feature/superadmin-ui-redesign
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "feat: superadmin UI redesign — dark sidebar + light content + Settings page" \
  --body "$(cat <<'EOF'
## Summary

- Replaces all-dark theme with dark sidebar + light content layout matching reference screenshots
- Installs lucide-react; adds Lucide icons to all 8 nav items
- Responsive: hamburger drawer on mobile (<768px), fixed sidebar on desktop
- New `PageHeader` shared component used by all pages
- All 7 existing pages restyled (white cards, light table rows, uppercase headers)
- Audit Log: all 5 filters + expandable diff panel preserved, reskinned to light theme
- New `/settings` page: Security & Auth, System Toggles, Infrastructure sections
- All business logic, API calls, and modals unchanged

## Test plan

- [ ] Desktop: sidebar always visible, active nav item highlighted blue
- [ ] Mobile (<768px): hamburger opens drawer, clicking nav link closes it
- [ ] Dashboard: 4 white metric cards
- [ ] Restaurants: filter card + table, click row opens detail panel
- [ ] Plans: card grid with capability icons, edit/delete icon buttons
- [ ] Invites: search bar + status dropdown, copy token button, revoke modal
- [ ] SMTP: two-column layout, global settings + overrides table
- [ ] Billing: summary cards + table + monthly chart modal (light theme)
- [ ] Audit: all 5 filters work, rows expand with diff panel, pagination footer shows entry count
- [ ] Settings: three sections render, toggle switch, webhook show/hide

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Move Vikunja task to In Review and paste PR URL**
