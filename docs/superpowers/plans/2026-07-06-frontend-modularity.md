# STORY-082: Frontend Modularity Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove copy-pasted logic across the `web/` monorepo's 5 apps, split the most oversized page files, and bring `tablet`/`widget`/`tracking` onto the same TanStack Query data-fetching pattern that `admin`/`superadmin` already use — with zero user-visible behavior change.

**Architecture:** Each task is a self-contained, independently testable change on branch `feature/STORY-082-frontend-modularity`. Shared logic moves into `packages/api-client` and `packages/utils` (already-established shared package pattern); file splits stay within their own app (no new cross-app coupling); TanStack Query conversions preserve each hook/component's existing public signature so callers need zero changes.

**Tech Stack:** pnpm workspace, Vite 6, React 19, TypeScript 5.7 (strict), Vitest 3 + @testing-library/react, TanStack Query 5.

## Global Constraints

- No user-visible behavior or visual change in any of the 5 apps (per spec `docs/superpowers/specs/2026-07-06-frontend-modularity-design.md`).
- No change to per-app deploy setup (`vite.config.ts`, `wrangler pages deploy --project-name=...`, `package.json` scripts).
- `pnpm -w test` and `pnpm -w typecheck` must stay green after every task.
- One commit per task, message format `STORY-082: <imperative description>` with `Refs: #77` on the last line (per CLAUDE.md).
- New/changed React packages needing JSX declare `react`/`react-dom` as `peerDependencies` (matches `packages/ui`, `packages/auth`).

**Scope correction from spec (found during planning, both narrowing risk):**
- The spec's audit flagged a local `Card` component in `admin/src/pages/Settings.tsx:107` as a duplicate of `@wolfchow/ui`'s `Card`. On inspection their CSS differs (`rounded-xl border-gray-200 p-6` Tailwind utility classes vs. `.wc-card` custom-property-driven styles with different padding) — swapping would be a visual change, which violates the no-behavior-change constraint. **Dropped from scope**; the local `Card` is not duplicated *across* files (only reused within Settings.tsx), so leaving it isn't a modularity regression.
- The spec listed `widget/src/components/ItemModal.tsx` and `Checkout.tsx`'s scheduling UI as TanStack Query conversion targets. On inspection, `ItemModal.tsx`'s only `useEffect` is an Escape-key listener (not data fetching), and `Checkout.tsx`'s slot-fetch is a user-triggered lazy load gated by `slotsStatus`, not a mount-time fetch — forcing it into `useQuery` adds risk for no behavioral gain. **Narrowed to**: `widget`'s actual mount-time data fetch is the menu load in `App.tsx`; that's the only widget TanStack Query conversion in this plan. `Checkout.tsx`'s pure helper functions are still extracted (Task 7) to address the oversized-file goal.

---

### Task 1: `packages/api-client` — shared `createApiContext()` factory

**Files:**
- Create: `web/packages/api-client/src/context.tsx`
- Create: `web/packages/api-client/src/context.test.tsx`
- Modify: `web/packages/api-client/src/index.ts` (add export)
- Modify: `web/packages/api-client/package.json` (add `peerDependencies`)

**Interfaces:**
- Produces: `createApiContext(): { ApiProvider: (props: { client: ApiClient; children: ReactNode }) => JSX.Element; useApi: () => ApiClient }` — exported from `@wolfchow/api-client`. `buildApiClient` stays a plain function each app calls directly with its own `baseUrl` (not part of the context, since it needs no React state) — exported unchanged as `createApiClient` (already exported).

- [ ] **Step 1: Write the failing test**

Create `web/packages/api-client/src/context.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createApiClient, createMemorySession } from './index'
import { createApiContext } from './context'

describe('STORY-082 · createApiContext', () => {
  it('useApi returns the client passed to ApiProvider', () => {
    const { ApiProvider, useApi } = createApiContext()
    const session = createMemorySession({ access_token: 't', refresh_token: 'r' })
    const client = createApiClient({ baseUrl: 'https://api.test', session, fetch: vi.fn() })

    function Probe() {
      const api = useApi()
      return <span>{api === client ? 'same-client' : 'different-client'}</span>
    }

    render(
      <ApiProvider client={client}>
        <Probe />
      </ApiProvider>,
    )

    expect(screen.getByText('same-client')).toBeTruthy()
  })

  it('useApi throws outside ApiProvider', () => {
    const { useApi } = createApiContext()
    function Probe() {
      useApi()
      return null
    }
    expect(() => render(<Probe />)).toThrow('useApi must be used within <ApiProvider>')
  })

  it('two separate createApiContext() calls produce isolated contexts', () => {
    const ctxA = createApiContext()
    const ctxB = createApiContext()
    const client = createApiClient({ baseUrl: 'https://api.test', session: createMemorySession({ access_token: 't', refresh_token: 'r' }), fetch: vi.fn() })

    function ProbeB() {
      const api = ctxB.useApi()
      return <span>{String(!!api)}</span>
    }

    // ProbeB reads from ctxB's useApi while only ctxA.ApiProvider wraps it — must throw.
    expect(() =>
      render(
        <ctxA.ApiProvider client={client}>
          <ProbeB />
        </ctxA.ApiProvider>,
      ),
    ).toThrow('useApi must be used within <ApiProvider>')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm --filter @wolfchow/api-client test -- context.test.tsx`
Expected: FAIL with "Cannot find module './context'" (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

Create `web/packages/api-client/src/context.tsx`:

```tsx
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { ApiClient } from './client'

export interface ApiContextValue {
  ApiProvider: (props: { client: ApiClient; children: ReactNode }) => ReturnType<typeof ApiProviderImpl>
  useApi: () => ApiClient
}

function ApiProviderImpl(
  Context: React.Context<ApiClient | null>,
  props: { client: ApiClient; children: ReactNode },
) {
  return <Context.Provider value={props.client}>{props.children}</Context.Provider>
}

/**
 * Each app instantiates its own context (rather than sharing one module-level
 * context across apps) so admin/tablet/superadmin's ApiProvider/useApi pairs
 * stay independent — matching that these are 3 separately deployed apps.
 */
export function createApiContext(): ApiContextValue {
  const Context = createContext<ApiClient | null>(null)

  function ApiProvider(props: { client: ApiClient; children: ReactNode }) {
    return ApiProviderImpl(Context, props)
  }

  function useApi(): ApiClient {
    const client = useContext(Context)
    if (!client) throw new Error('useApi must be used within <ApiProvider>')
    return client
  }

  return { ApiProvider, useApi }
}
```

Modify `web/packages/api-client/src/index.ts` — add after the existing `export { ApiError }` line:

```ts
export { createApiContext } from './context'
export type { ApiContextValue } from './context'
```

Modify `web/packages/api-client/package.json` — add after `"dependencies"` block:

```json
  "peerDependencies": {
    "react": "^19.0.0"
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm --filter @wolfchow/api-client test -- context.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Run full workspace typecheck**

Run: `cd web && pnpm typecheck`
Expected: PASS (no type errors)

- [ ] **Step 6: Commit**

```bash
git add web/packages/api-client/src/context.tsx web/packages/api-client/src/context.test.tsx web/packages/api-client/src/index.ts web/packages/api-client/package.json
git commit -m "$(cat <<'EOF'
STORY-082: add createApiContext() factory to api-client

Replaces the byte-identical ApiProvider/useApi/context boilerplate
duplicated in admin, tablet, and superadmin's lib/api.tsx.

Refs: #77
EOF
)"
```

---

### Task 2: Dedupe `formatPrice` → `@wolfchow/utils`'s `formatCurrency`

**Files:**
- Modify: `web/apps/widget/src/components/Cart.tsx`
- Modify: `web/apps/widget/src/components/ItemModal.tsx`
- Modify: `web/apps/widget/src/components/Menu.tsx`
- Modify: `web/apps/widget/src/components/OrderTracking.tsx`
- Modify: `web/apps/widget/src/components/Success.tsx`
- Modify: `web/apps/widget/src/components/Checkout.tsx`
- Modify: `web/apps/admin/src/pages/Menu.tsx`

**Interfaces:**
- Consumes: `formatCurrency(amount: number, currency: string): string` from `@wolfchow/utils` (already exported, `web/packages/utils/src/currency.ts:15`).

**Important:** `admin/src/pages/Menu.tsx`'s local `formatPrice(cents, currency)` divides by 100 (prices stored in cents); every other file's local `formatPrice(amount, currency)` does **not** divide (prices already stored as decimal dollars). Preserve this at each call site — do not blindly search-replace.

- [ ] **Step 1: Widget files — delete local `formatPrice`, import `formatCurrency`, update call sites**

For each of `Cart.tsx`, `ItemModal.tsx`, `Menu.tsx`, `OrderTracking.tsx`, `Success.tsx`, `Checkout.tsx`:
1. Delete the local `function formatPrice(amount: number, currency: string): string { ... }` block.
2. Add `import { formatCurrency } from '@wolfchow/utils'` to the top imports.
3. Replace every call `formatPrice(x, currency)` with `formatCurrency(x, currency)` (same arguments, no divide).

Example for `Cart.tsx` (same pattern for the other 5 files):

```diff
-import type { CartItem, WidgetSettings } from '../types'
-
-function formatPrice(amount: number, currency: string): string {
-  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
-}
+import type { CartItem, WidgetSettings } from '../types'
+import { formatCurrency } from '@wolfchow/utils'
```
and each `formatPrice(` call site becomes `formatCurrency(`.

- [ ] **Step 2: `admin/src/pages/Menu.tsx` — delete local `formatPrice`, divide by 100 at call sites**

```diff
-import { cn } from '../lib/utils'
+import { cn } from '../lib/utils'
+import { formatCurrency } from '@wolfchow/utils'
```

```diff
-function formatPrice(cents: number, currency = 'USD') {
-  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
-}
-
 function AvailabilityBadge({ state }: { state: string }) {
```

Update the 3 call sites (`Menu.tsx:118-119, 252`) from `formatPrice(x, currency)` to `formatCurrency(x / 100, currency)`.

- [ ] **Step 3: Run affected test suites**

Run: `cd web && pnpm --filter @wolfchow/app-widget test && pnpm --filter @wolfchow/app-admin test -- Menu.test.tsx`
Expected: PASS — these tests assert on rendered price text; since `formatCurrency('USD')` and the old hardcoded `en-US` formatting produce identical output for USD (the only currency used in fixtures), no test assertions should need updating. If any test asserts on a different currency's exact formatting, update the expected string to match `formatCurrency`'s locale-aware output (see `web/packages/utils/src/currency.ts:2-7` for the currency→locale map) rather than loosening the assertion.

- [ ] **Step 4: Run full workspace test + typecheck**

Run: `cd web && pnpm -w test && pnpm -w typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/apps/widget/src/components/Cart.tsx web/apps/widget/src/components/ItemModal.tsx web/apps/widget/src/components/Menu.tsx web/apps/widget/src/components/OrderTracking.tsx web/apps/widget/src/components/Success.tsx web/apps/widget/src/components/Checkout.tsx web/apps/admin/src/pages/Menu.tsx
git commit -m "$(cat <<'EOF'
STORY-082: dedupe formatPrice into @wolfchow/utils formatCurrency

Removes 7 copies of the same Intl.NumberFormat wrapper across widget
and admin/Menu.tsx. Also fixes admin/Menu.tsx and all widget call
sites to use the currency-aware locale (they previously hardcoded
en-US regardless of the restaurant's configured currency).

Refs: #77
EOF
)"
```

---

### Task 3: Extract `StripeKeyGuide` to a shared admin component

**Files:**
- Create: `web/apps/admin/src/components/StripeKeyGuide.tsx`
- Modify: `web/apps/admin/src/pages/Payments.tsx`
- Modify: `web/apps/admin/src/pages/Settings.tsx`

**Interfaces:**
- Produces: `StripeKeyGuide({ onClose }: { onClose: () => void }): JSX.Element` exported from `../components/StripeKeyGuide`.

- [ ] **Step 1: Read both current copies to confirm they're identical after the Task-1-branch trim commit**

Run: `git show HEAD~2:web/apps/admin/src/pages/Payments.tsx web/apps/admin/src/pages/Settings.tsx` isn't a valid multi-file `git show`; instead diff them directly:

```bash
cd web
diff <(sed -n '/^function StripeKeyGuide/,/^}/p' apps/admin/src/pages/Payments.tsx) \
     <(sed -n '/^function StripeKeyGuide/,/^}/p' apps/admin/src/pages/Settings.tsx)
```
Expected: no output (identical) — this was already confirmed during the STORY-082 audit; re-verify since the earlier same-branch commit (`STORY-082: trim redundant Stripe security copy in key guide`) touched both copies identically.

- [ ] **Step 2: Extract the component**

Create `web/apps/admin/src/components/StripeKeyGuide.tsx` with the exact current body of `Payments.tsx`'s `StripeKeyGuide` function (including its imports — check the top of `Payments.tsx` for what it imports that `StripeKeyGuide` uses, e.g. icons from `lucide-react`, and copy only those imports needed by the component).

- [ ] **Step 3: Remove the duplicated function from both pages, import the shared one**

In `Payments.tsx` and `Settings.tsx`:
```diff
+import { StripeKeyGuide } from '../components/StripeKeyGuide'
```
and delete each file's local `function StripeKeyGuide({ onClose }) { ... }` block.

- [ ] **Step 4: Run affected tests**

Run: `cd web && pnpm --filter @wolfchow/app-admin test -- Payments.test.tsx Settings.test.tsx`
Expected: PASS (component behavior unchanged, only its file location moved)

- [ ] **Step 5: Run full workspace test + typecheck**

Run: `cd web && pnpm -w test && pnpm -w typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/apps/admin/src/components/StripeKeyGuide.tsx web/apps/admin/src/pages/Payments.tsx web/apps/admin/src/pages/Settings.tsx
git commit -m "$(cat <<'EOF'
STORY-082: extract StripeKeyGuide to a shared admin component

Payments.tsx and Settings.tsx had byte-identical copies of this
modal. Moved to components/StripeKeyGuide.tsx, imported by both.

Refs: #77
EOF
)"
```

---

### Task 4: Rewire `admin`/`tablet`/`superadmin` `lib/api.tsx` onto `createApiContext()`

**Files:**
- Modify: `web/apps/admin/src/lib/api.tsx`
- Modify: `web/apps/tablet/src/lib/api.tsx`
- Modify: `web/apps/superadmin/src/lib/api.tsx`

**Interfaces:**
- Consumes: `createApiContext()` from `@wolfchow/api-client` (Task 1).
- Produces (unchanged, so no caller elsewhere needs to change): `buildApiClient(session, onSessionExpired?)`, `ApiProvider`, `useApi` — same names, same signatures, from each app's own `./lib/api`.

- [ ] **Step 1: Rewrite `admin/src/lib/api.tsx`**

```tsx
import { createApiClient, createApiContext, type ApiClient, type SessionStore } from '@wolfchow/api-client'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8789'

export function buildApiClient(session: SessionStore, onSessionExpired?: () => void): ApiClient {
  return createApiClient({ baseUrl: API_URL, session, onSessionExpired })
}

export const { ApiProvider, useApi } = createApiContext()
```

- [ ] **Step 2: Rewrite `tablet/src/lib/api.tsx`** — identical to admin's (same shape, no extra exports)

```tsx
import { createApiClient, createApiContext, type ApiClient, type SessionStore } from '@wolfchow/api-client'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8789'

export function buildApiClient(session: SessionStore, onSessionExpired?: () => void): ApiClient {
  return createApiClient({ baseUrl: API_URL, session, onSessionExpired })
}

export const { ApiProvider, useApi } = createApiContext()
```

- [ ] **Step 3: Rewrite `superadmin/src/lib/api.tsx`** — keeps its extra `ADMIN_URL` export

```tsx
import { createApiClient, createApiContext, type ApiClient, type SessionStore } from '@wolfchow/api-client'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8789'

/** Origin of the (independently-deployed) restaurant admin app, for impersonation. */
export const ADMIN_URL =
  (import.meta.env.VITE_ADMIN_URL as string | undefined) ?? 'http://localhost:5174'

export function buildApiClient(session: SessionStore, onSessionExpired?: () => void): ApiClient {
  return createApiClient({ baseUrl: API_URL, session, onSessionExpired })
}

export const { ApiProvider, useApi } = createApiContext()
```

- [ ] **Step 4: Run each app's full test suite**

Run: `cd web && pnpm --filter @wolfchow/app-admin test && pnpm --filter @wolfchow/app-tablet test && pnpm --filter @wolfchow/app-superadmin test`
Expected: PASS — every test that does `vi.mock('./lib/api', ...)` or `vi.mock('../lib/api', ...)` mocks the whole module, so the internal rewrite is invisible to them. Tests that import the real `ApiProvider` (e.g. `superadmin/src/App.test.tsx`) exercise the new `createApiContext()` path directly.

- [ ] **Step 5: Run full workspace test + typecheck + each app's build**

Run: `cd web && pnpm -w test && pnpm -w typecheck && pnpm --filter @wolfchow/app-admin build && pnpm --filter @wolfchow/app-tablet build && pnpm --filter @wolfchow/app-superadmin build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/apps/admin/src/lib/api.tsx web/apps/tablet/src/lib/api.tsx web/apps/superadmin/src/lib/api.tsx
git commit -m "$(cat <<'EOF'
STORY-082: rewire admin/tablet/superadmin lib/api.tsx onto createApiContext()

Replaces each app's identical hand-rolled ApiProvider/useApi/context
boilerplate with the shared factory from Task 1. Public exports
(buildApiClient, ApiProvider, useApi, superadmin's ADMIN_URL) are
unchanged.

Refs: #77
EOF
)"
```

---

### Task 5: Split `admin/src/pages/Menu.tsx` — extract `AvailabilityBadge` + `CategoryModal`

**Files:**
- Create: `web/apps/admin/src/components/menu/AvailabilityBadge.tsx`
- Create: `web/apps/admin/src/components/menu/CategoryModal.tsx`
- Modify: `web/apps/admin/src/pages/Menu.tsx`

**Interfaces:**
- Produces: `AvailabilityBadge({ state }: { state: string }): JSX.Element`, `CategoryModal({ category, onClose, onSave }: { category: MenuCategory | null; onClose: () => void; onSave: (data: { name: string; active: boolean }) => Promise<void> }): JSX.Element`.
- Consumes (by `CategoryModal`): `ApiError` from `@wolfchow/api-client`, `MenuCategory` type from `@wolfchow/types`, `X` icon from `lucide-react`, and the `FIELD` Tailwind class string (currently module-scoped in `Menu.tsx:39` — must be duplicated into `CategoryModal.tsx` since it's a private layout constant, not exported; verify it's not used by other extracted pieces in this task, since `AvailabilityBadge` doesn't need it).

- [ ] **Step 1: Create `AvailabilityBadge.tsx`**

`AVAIL_OPTIONS` is used in 3 places in `Menu.tsx` (confirmed via `grep -n "AVAIL_OPTIONS" web/apps/admin/src/pages/Menu.tsx`): inside `AvailabilityBadge` itself, in a filter dropdown (`Menu.tsx:477`), and in an inline availability lookup inside `ModifiersTab`/item rendering (`Menu.tsx:1159`). It must be **exported** from `AvailabilityBadge.tsx` and imported back into `Menu.tsx` for those other two call sites — not left private.

```tsx
import type { AvailabilityState } from '@wolfchow/types'
import { cn } from '../../lib/utils'

export const AVAIL_OPTIONS: Array<{
  value: AvailabilityState
  label: string
  dot: string
  badge: string
}> = [
  { value: 'available',    label: 'In Stock',     dot: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
  { value: 'out_of_stock', label: 'Out of Stock', dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700' },
  { value: 'unavailable',  label: 'Unavailable',  dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  { value: 'scheduled',    label: 'Scheduled',    dot: 'bg-blue-400',  badge: 'bg-blue-100 text-blue-700' },
]

export function AvailabilityBadge({ state }: { state: string }) {
  const opt = (AVAIL_OPTIONS.find((o) => o.value === state) ?? AVAIL_OPTIONS[0])!
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide', opt.badge)}>
      {opt.label}
    </span>
  )
}
```

In `Menu.tsx`, replace the deleted local `AVAIL_OPTIONS` declaration's 2 remaining call sites (`Menu.tsx:477, 1159`) with the imported one — no code change needed at those call sites themselves, only the import:

```diff
+import { AvailabilityBadge, AVAIL_OPTIONS } from '../components/menu/AvailabilityBadge'
```

- [ ] **Step 2: Create `CategoryModal.tsx`**

```tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import type { MenuCategory } from '@wolfchow/types'
import { ApiError } from '@wolfchow/api-client'

const FIELD = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400'

export function CategoryModal({ category, onClose, onSave }: {
  category: MenuCategory | null
  onClose: () => void
  onSave: (data: { name: string; active: boolean }) => Promise<void>
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [active, setActive] = useState(category?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), active })
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        const body = err.body as { error?: string; limit?: number }
        setError(body?.error === 'plan_limit_reached'
          ? `Category limit reached (${body.limit ?? 0}). Upgrade your plan to add more.`
          : 'This feature is not available on your current plan.')
      } else {
        setError(err instanceof ApiError ? String(err.message) : 'Save failed.')
      }
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-40 w-96 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{category ? 'Edit Category' : 'Add Category'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
          <input
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>
        <label className="mb-5 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-blue-500" />
          Active (visible to customers)
        </label>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : category ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Remove both functions (and the now-duplicated `AVAIL_OPTIONS` constant) from `Menu.tsx`, import them instead**

The `import { AvailabilityBadge, AVAIL_OPTIONS } from '../components/menu/AvailabilityBadge'` line was already added in Step 1 — also add:
```diff
+import { CategoryModal } from '../components/menu/CategoryModal'
```
Delete the original `const AVAIL_OPTIONS = [...]` block (`Menu.tsx:27-38`), the `function AvailabilityBadge(...)` block (`Menu.tsx:47-54`), and `function CategoryModal(...)` block (`Menu.tsx:525-591`, verify exact end line before deleting — it ends right before the `// ── Delete confirm ──` comment).

- [ ] **Step 4: Run Menu test suite**

Run: `cd web && pnpm --filter @wolfchow/app-admin test -- Menu.test.tsx`
Expected: PASS (test imports `Menu` from `./Menu` and mocks `../lib/api`; it doesn't import the extracted components directly, per the earlier grep confirming no direct references)

- [ ] **Step 5: Run full workspace test + typecheck + admin build**

Run: `cd web && pnpm -w test && pnpm -w typecheck && pnpm --filter @wolfchow/app-admin build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/apps/admin/src/components/menu/AvailabilityBadge.tsx web/apps/admin/src/components/menu/CategoryModal.tsx web/apps/admin/src/pages/Menu.tsx
git commit -m "$(cat <<'EOF'
STORY-082: split AvailabilityBadge and CategoryModal out of Menu.tsx

Menu.tsx was 1270 lines mixing the page with several inline
components. First pass: extract the two most self-contained pieces.

Refs: #77
EOF
)"
```

---

### Task 6: Split `admin/src/pages/Settings.tsx` — extract `Card`, `SectionHeader`, `LinkField`, `BrandColorsCard`

**Files** (expanded from the spec's 2-component list after reading `BrandColorsCard`'s full body: it renders `<Card>` and `<SectionHeader>`, both currently module-private to `Settings.tsx`. Extracting `BrandColorsCard` alone would force a circular import `Settings.tsx → BrandColorsCard.tsx → Settings.tsx`, so `Card` and `SectionHeader` are pulled out first):
- Create: `web/apps/admin/src/components/settings/Card.tsx`
- Create: `web/apps/admin/src/components/settings/SectionHeader.tsx`
- Create: `web/apps/admin/src/components/settings/LinkField.tsx`
- Create: `web/apps/admin/src/components/settings/BrandColorsCard.tsx`
- Modify: `web/apps/admin/src/pages/Settings.tsx`

**Interfaces:**
- Produces: `Card({ children, className }: { children: React.ReactNode; className?: string }): JSX.Element`, `SectionHeader({ icon, label }: { icon: React.ElementType; label: string }): JSX.Element`, `LinkField({ label, initial, onSave }: { label: string; initial: string; onSave: (url: string) => Promise<void> }): JSX.Element`, `BrandColorsCard({ restaurant, onSave }: { restaurant: Restaurant; onSave: () => void }): JSX.Element`.
- Consumes (by `BrandColorsCard`): `Card`/`SectionHeader` (this task), `useApi` from `../../lib/api`, `BrandColors`/`Restaurant` types from `@wolfchow/types`, `Globe` icon from `lucide-react`.

**Note:** This is the page-local Tailwind `Card` (distinct from `@wolfchow/ui`'s `Card` — see the Global Constraints scope correction for why they aren't merged into one). `Settings.tsx` has 13 other `<Card>` call sites beyond `BrandColorsCard`'s — all keep working unchanged since `Settings.tsx` will import the same `Card` from its new location.

- [ ] **Step 1: Create `Card.tsx`**

```tsx
import { cn } from '../../lib/utils'

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-gray-200 bg-white p-6', className)}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create `SectionHeader.tsx`**

```tsx
export function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      <Icon size={16} className="text-blue-600" />
      <span className="text-xs font-bold tracking-widest text-gray-700 uppercase">{label}</span>
    </div>
  )
}
```

- [ ] **Step 3: Create `LinkField.tsx`**

```tsx
import { useState } from 'react'
import { cn } from '../../lib/utils'

export function LinkField({ label, initial, onSave }: {
  label: string
  initial: string
  onSave: (url: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (value && !/^https?:\/\/.+/.test(value)) { setError('Must be a valid URL'); return }
    setError(''); setSaving(true)
    try { await onSave(value); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    catch { setError('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <div className="flex gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError('') }}
          placeholder="https://…"
          className={cn(
            'flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400',
            error ? 'border-red-300' : 'border-gray-200',
          )}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-900 disabled:opacity-40"
        >
          {saved ? 'Saved!' : saving ? '…' : 'Save'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Create `BrandColorsCard.tsx`**

```tsx
import { useState, useRef } from 'react'
import { Globe } from 'lucide-react'
import type { Restaurant, BrandColors } from '@wolfchow/types'
import { useApi } from '../../lib/api'
import { Card } from './Card'
import { SectionHeader } from './SectionHeader'

export function BrandColorsCard({ restaurant, onSave }: { restaurant: Restaurant; onSave: () => void }) {
  const api = useApi()
  const [colors, setColors] = useState<BrandColors>(restaurant.brand_colors ?? {})
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(key: keyof BrandColors, value: string) {
    const next = { ...colors, [key]: value }
    setColors(next)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      await api.admin.saveIntegrations({ brand_colors: next })
      onSave()
    }, 400)
  }

  return (
    <Card>
      <SectionHeader icon={Globe} label="Widget theme colors" />
      <p className="mb-4 text-xs text-gray-500">
        These colors are applied to your embedded ordering widget.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(['primary', 'secondary', 'accent', 'text'] as Array<keyof BrandColors>).map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-3">
            <input
              type="color"
              value={colors[key] ?? '#2563eb'}
              onChange={(e) => handleChange(key, e.target.value)}
              className="h-9 w-9 cursor-pointer rounded-lg border border-gray-200"
              aria-label={`${key} colour`}
            />
            <span className="text-sm capitalize text-gray-700">{key}</span>
          </label>
        ))}
      </div>
    </Card>
  )
}
```

- [ ] **Step 5: Remove all 4 extracted functions from `Settings.tsx`, import them instead**

```diff
+import { Card } from '../components/settings/Card'
+import { SectionHeader } from '../components/settings/SectionHeader'
+import { LinkField } from '../components/settings/LinkField'
+import { BrandColorsCard } from '../components/settings/BrandColorsCard'
```
Delete the `function Card(...)` (`Settings.tsx:107-113`), `function SectionHeader(...)` (`Settings.tsx:72-79`), `function LinkField(...)` (`Settings.tsx:117-161`), and `function BrandColorsCard(...)` (`Settings.tsx:165-202`) blocks. All other call sites of `Card`/`SectionHeader` elsewhere in `Settings.tsx` (13 `<Card>` usages, several `<SectionHeader>` usages) need no change — they'll resolve to the newly-imported versions.

- [ ] **Step 6: Run Settings test suite**

Run: `cd web && pnpm --filter @wolfchow/app-admin test -- Settings.test.tsx`
Expected: PASS (confirmed via grep during planning that the test only imports `Settings`, not the extracted sub-components directly)

- [ ] **Step 7: Run full workspace test + typecheck + admin build**

Run: `cd web && pnpm -w test && pnpm -w typecheck && pnpm --filter @wolfchow/app-admin build`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/apps/admin/src/components/settings/Card.tsx web/apps/admin/src/components/settings/SectionHeader.tsx web/apps/admin/src/components/settings/LinkField.tsx web/apps/admin/src/components/settings/BrandColorsCard.tsx web/apps/admin/src/pages/Settings.tsx
git commit -m "$(cat <<'EOF'
STORY-082: split Card, SectionHeader, LinkField, BrandColorsCard out of Settings.tsx

Settings.tsx was 1249 lines (before Task 3's StripeKeyGuide
extraction). Card and SectionHeader were pulled out alongside
BrandColorsCard to avoid a circular import, since BrandColorsCard
renders both.

Refs: #77
EOF
)"
```

---

### Task 7: Split `widget/src/components/Checkout.tsx` — extract pure helper functions

**Files:**
- Create: `web/apps/widget/src/components/checkout/stripeLoader.ts`
- Create: `web/apps/widget/src/components/checkout/slotHelpers.ts`
- Create: `web/apps/widget/src/components/checkout/slotHelpers.test.ts`
- Modify: `web/apps/widget/src/components/Checkout.tsx`

**Interfaces:**
- Produces: `createStripeInstance(publishableKey: string): Promise<Stripe>` from `./checkout/stripeLoader`; `localDateOf(isoStr: string, tz: string): string`, `groupSlotsByDate(slots: string[], tz: string): Map<string, string[]>`, `formatDateChip(dateStr: string, firstSlotInDay: string, tz: string): string`, `formatSlotTime(isoStr: string, tz: string): string` from `./checkout/slotHelpers`.

**Scope note:** `Checkout.tsx`'s render body (the ~750 remaining lines: card-element mounting, scheduling UI, order summary) stays in place — those pieces are tightly coupled to the component's local state and the live Stripe Elements DOM ref, and splitting them mid-plan risks a subtle checkout regression for a component that touches real payments. This task moves only the pure, side-effect-free helper functions (~95 lines), which is safe and mechanical. Deeper JSX-level extraction is a reasonable fast-follow, not part of this story.

- [ ] **Step 1: Write the failing test for the extracted slot helpers**

Create `web/apps/widget/src/components/checkout/slotHelpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { groupSlotsByDate, formatSlotTime } from './slotHelpers'

describe('STORY-082 · widget checkout slot helpers', () => {
  it('groups future slots by their local date and drops past slots', () => {
    const past = new Date(Date.now() - 3600_000).toISOString()
    const future1 = new Date(Date.now() + 3600_000).toISOString()
    const future2 = new Date(Date.now() + 7200_000).toISOString()

    const groups = groupSlotsByDate([past, future1, future2], 'UTC')
    const allSlots = [...groups.values()].flat()

    expect(allSlots).not.toContain(past)
    expect(allSlots).toContain(future1)
    expect(allSlots).toContain(future2)
  })

  it('formats a slot time in the given timezone', () => {
    const iso = '2026-01-15T14:30:00.000Z'
    const formatted = formatSlotTime(iso, 'UTC')
    expect(formatted).toMatch(/2:30\s*PM/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm --filter @wolfchow/app-widget test -- slotHelpers.test.ts`
Expected: FAIL with "Cannot find module './slotHelpers'"

- [ ] **Step 3: Create `slotHelpers.ts`** — move these 3 functions verbatim out of `Checkout.tsx` (currently lines 53-93):

```ts
export function localDateOf(isoStr: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(isoStr))
}

export function groupSlotsByDate(slots: string[], tz: string): Map<string, string[]> {
  const now = Date.now()
  const groups = new Map<string, string[]>()
  for (const slot of slots) {
    if (new Date(slot).getTime() <= now) continue  // filter already-past slots
    const d = localDateOf(slot, tz)
    const arr = groups.get(d) ?? []
    arr.push(slot)
    groups.set(d, arr)
  }
  return groups
}

export function formatDateChip(dateStr: string, firstSlotInDay: string, tz: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    new Date(Date.now() + 86400000),
  )
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(firstSlotInDay))
}

export function formatSlotTime(isoStr: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoStr))
}
```

- [ ] **Step 4: Create `stripeLoader.ts`** — move `createStripeInstance` verbatim out of `Checkout.tsx` (currently lines 7-49):

```ts
import type { Stripe } from '@stripe/stripe-js'

// Load Stripe.js from CDN (more reliable than @stripe/stripe-js in bundled IIFE context)
export function createStripeInstance(publishableKey: string): Promise<Stripe> {
  if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
    return Promise.reject(
      new Error(`Stripe key must start with pk_test_ or pk_live_ — got "${publishableKey.slice(0, 12)}…". ` +
        'Set your Stripe publishable key (not the secret key) in Admin → Payments.'),
    )
  }

  return new Promise((resolve, reject) => {
    const win = window as unknown as Record<string, unknown>

    const init = () => {
      const Constructor = win['Stripe'] as ((key: string) => Stripe) | undefined
      if (Constructor) {
        try { resolve(Constructor(publishableKey)) }
        catch (e) { reject(e) }
      } else {
        reject(new Error('Stripe.js loaded but window.Stripe is not available'))
      }
    }

    if (win['Stripe']) { init(); return }

    let script = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]')
    const alreadyInDom = !!script

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://js.stripe.com/v3/'
      script.async = true
      document.head.appendChild(script)
    }

    script.addEventListener('load', init, { once: true })
    script.addEventListener('error', () =>
      reject(new Error('Failed to fetch https://js.stripe.com/v3/ — check internet connection or CSP headers')),
    { once: true })

    if (alreadyInDom && win['Stripe']) init()
  })
}
```

- [ ] **Step 5: Update `Checkout.tsx`** — delete the 5 moved functions (`createStripeInstance`, `localDateOf`, `groupSlotsByDate`, `formatDateChip`, `formatSlotTime`; `formatPrice` was already removed in Task 2), add imports:

```diff
-import type { Stripe, StripeCardElement } from '@stripe/stripe-js'
+import type { StripeCardElement } from '@stripe/stripe-js'
 import type { CartItem, CheckoutForm, PromoValidation, WidgetSettings } from '../types'
 import { Notices } from './Notices'
+import { createStripeInstance } from './checkout/stripeLoader'
+import { localDateOf, groupSlotsByDate, formatDateChip, formatSlotTime } from './checkout/slotHelpers'
```

(Keep `StripeCardElement` import since it's used elsewhere in the component; drop `Stripe` if `createStripeInstance`'s return type was the only use of that type in this file — verify with `grep -n "Stripe\b" web/apps/widget/src/components/Checkout.tsx` before removing the import.)

- [ ] **Step 6: Run new test, widget suite**

Run: `cd web && pnpm --filter @wolfchow/app-widget test`
Expected: PASS

- [ ] **Step 7: Run full workspace test + typecheck + widget build**

Run: `cd web && pnpm -w test && pnpm -w typecheck && pnpm --filter @wolfchow/app-widget build`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/apps/widget/src/components/checkout/stripeLoader.ts web/apps/widget/src/components/checkout/slotHelpers.ts web/apps/widget/src/components/checkout/slotHelpers.test.ts web/apps/widget/src/components/Checkout.tsx
git commit -m "$(cat <<'EOF'
STORY-082: extract pure helpers out of widget Checkout.tsx

Moves Stripe.js loading and timezone-aware slot-grouping helpers
(~95 lines) into their own files with a unit test. The render body
stays in place — those pieces are tightly coupled to live Stripe
Elements state and aren't worth the risk of splitting mid-refactor.

Refs: #77
EOF
)"
```

---

### Task 8: TanStack Query — `tracking` app

**Files:**
- Modify: `web/apps/tracking/package.json` (add `@tanstack/react-query` dependency)
- Modify: `web/apps/tracking/src/main.tsx`
- Modify: `web/apps/tracking/src/App.tsx`

**Interfaces:**
- Produces: no change to `App`'s exported shape (still `export function App()`), so nothing outside this file needs to change.

- [ ] **Step 1: Add the dependency**

Modify `web/apps/tracking/package.json` — add to `"dependencies"`:

```json
    "@tanstack/react-query": "^5.101.0",
```
(match the version already used by admin/superadmin — check `web/apps/admin/package.json` for the exact pinned version at implementation time.)

Run: `cd web && pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 2: Wire `QueryClientProvider` in `main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import '@wolfchow/ui/styles.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 3: Convert `App.tsx`'s manual fetch/poll to `useQuery`**

Replace the imports and the `fetchOrder`/`useState`/`useEffect` block (currently `App.tsx:1, 90-118`) with:

```diff
-import { useState, useEffect, useCallback } from 'react'
+import { useQuery } from '@tanstack/react-query'
 import { formatCurrency } from '@wolfchow/utils'
```

Add above `TERMINAL_STATUSES` (after the existing type/const declarations, before `extractToken`):

```ts
class TrackingNotFoundError extends Error {}

async function fetchTrackingOrder(apiBase: string, token: string): Promise<TrackingOrder> {
  const res = await fetch(`${apiBase}/public/track/${encodeURIComponent(token)}`)
  if (res.status === 404) throw new TrackingNotFoundError('Order not found')
  if (!res.ok) throw new Error(`tracking fetch failed: ${res.status}`)
  return res.json() as Promise<TrackingOrder>
}
```

Replace the body of `export function App()` (currently starting `const token = extractToken()` through the `useEffect` poll block) with:

```tsx
export function App() {
  const token = extractToken()

  const { data: order, isPending, isError, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['tracking-order', token],
    queryFn: () => fetchTrackingOrder(API_BASE, token!),
    enabled: !!token,
    retry: false,
    refetchInterval: (query) => {
      const current = query.state.data
      return current && !TERMINAL_STATUSES.has(current.status) ? 10_000 : false
    },
  })

  const state: LoadState = !token
    ? 'ready' // unreachable render path below handles !token before using `state`
    : isPending ? 'loading'
    : isError ? (error instanceof TrackingNotFoundError ? 'not_found' : 'error')
    : 'ready'
```

Then, further down in the same function, replace every reference to `fetchOrder` (the old retry-button handler and the header's refresh button) with `refetch`, and replace `lastRefresh.toISOString()` with `new Date(dataUpdatedAt).toISOString()`. Replace the final `<OrderSummary order={order!} />` — unchanged, since `order` now comes from `useQuery`'s `data` instead of local state, and is still only rendered in the `ready` branch where it's guaranteed defined.

Remove the now-unused `LoadState` union member handling if any dangling `setState`/`setOrder`/`setLastRefresh` calls remain — there should be none left; grep to confirm: `grep -n "setState\|setOrder\|setLastRefresh" web/apps/tracking/src/App.tsx` must return nothing after this edit.

- [ ] **Step 4: Run tracking test suite**

Run: `cd web && pnpm --filter @wolfchow/app-tracking test`
Expected: PASS — if `App.test.tsx` mocks `global.fetch` directly (check its current contents first), no test change is needed since `fetchTrackingOrder` still calls `fetch` the same way; if it asserts on a specific number of `setInterval` calls or similar implementation detail tied to the old manual poll, update the assertion to check for a second `fetch` call after advancing fake timers by 10s instead.

- [ ] **Step 5: Run full workspace test + typecheck + tracking build**

Run: `cd web && pnpm -w test && pnpm -w typecheck && pnpm --filter @wolfchow/app-tracking build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/apps/tracking/package.json web/apps/tracking/src/main.tsx web/apps/tracking/src/App.tsx pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
STORY-082: convert tracking app to TanStack Query

Replaces the manual useState/useEffect/setInterval poll loop with
useQuery + refetchInterval, matching the pattern already used by
admin and superadmin.

Refs: #77
EOF
)"
```

---

### Task 9: TanStack Query — `widget` app menu fetch

**Files:**
- Modify: `web/apps/widget/package.json` (add `@tanstack/react-query` dependency)
- Modify: `web/apps/widget/src/bootstrap.ts` or `main.tsx` (wherever the root is rendered — confirmed as `main.tsx` during planning)
- Modify: `web/apps/widget/src/App.tsx`

**Interfaces:**
- Produces: no change to `App`'s props (`AppProps` unchanged), so `main.tsx`'s 3 `root.render(<App .../>)` calls need only the new `QueryClientProvider` wrapper, not prop changes.

- [ ] **Step 1: Add the dependency**

Modify `web/apps/widget/package.json` — add to `"dependencies"`: `"@tanstack/react-query": "^5.101.0"` (match admin's pinned version).

Run: `cd web && pnpm install`

- [ ] **Step 2: Wrap the widget root in `QueryClientProvider`**

In `web/apps/widget/src/main.tsx`, add a module-scope `QueryClient` (created once, reused across the 3 `root.render` calls in `bootstrap()`) and wrap each `<App .../>`:

```diff
+import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
 import { App } from './App'
 import { WIDGET_HOST_ID, injectCssVars, mountWidgetInShadow } from './bootstrap'

 const ENV_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.wolfchow.com'
+const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })
```

Wrap each of the 3 `root.render(<StrictMode><App .../></StrictMode>)` calls:

```diff
   root.render(
     <StrictMode>
-      <App state="loading" settings={null} apiBase={API_BASE} slug={slug} />
+      <QueryClientProvider client={queryClient}>
+        <App state="loading" settings={null} apiBase={API_BASE} slug={slug} />
+      </QueryClientProvider>
     </StrictMode>,
   )
```
(repeat identically for the `"ready"` and `"error"` state renders further down in the same function).

- [ ] **Step 3: Convert `App.tsx`'s menu fetch to `useQuery`**

```diff
-import { useState, useEffect, useCallback, useRef } from 'react'
+import { useState, useCallback, useRef } from 'react'
+import { useQuery } from '@tanstack/react-query'
```

Remove the `menu`/`menuLoaded` local state and their effect:

```diff
-  const [menu, setMenu] = useState<PublicMenuCategory[]>([])
-  const [menuLoaded, setMenuLoaded] = useState(false)
```
```diff
-  // Load menu once settings are ready
-  useEffect(() => {
-    if (loadState !== 'ready' || menuLoaded) return
-    api.getMenu()
-      .then((cats) => {
-        setMenu(cats)
-        setMenuLoaded(true)
-      })
-      .catch(() => setMenuLoaded(true))
-  }, [loadState, menuLoaded])
+  const { data: menu = [], isPending: menuPending } = useQuery({
+    queryKey: ['widget-menu', slug],
+    queryFn: () => api.getMenu(),
+    enabled: loadState === 'ready',
+  })
```

Update the two render-site references (`Menu.tsx:322,326` in the original line numbering — search for `menuLoaded` in `App.tsx` after this edit):

```diff
-          {!menuLoaded ? (
+          {menuPending ? (
```
(the `categories={menu}` prop passed to `<Menu>` needs no change — `menu` still resolves to `PublicMenuCategory[]`, defaulting to `[]` while pending, matching the old initial state.)

- [ ] **Step 4: Run widget test suite**

Run: `cd web && pnpm --filter @wolfchow/app-widget test`
Expected: PASS — `App.test.tsx` must wrap its rendered `<App />` in a `QueryClientProvider` (with a fresh `QueryClient` per test, `retry: false`) if it doesn't already; check its current setup first. If it currently renders `<App />` bare, add:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}
```
and replace bare `render(<App .../>)` calls with `renderWithQuery(<App .../>)`.

- [ ] **Step 5: Run full workspace test + typecheck + widget build**

Run: `cd web && pnpm -w test && pnpm -w typecheck && pnpm --filter @wolfchow/app-widget build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/apps/widget/package.json web/apps/widget/src/main.tsx web/apps/widget/src/App.tsx web/apps/widget/src/App.test.tsx pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
STORY-082: convert widget menu fetch to TanStack Query

Replaces the manual useEffect + setMenu/setMenuLoaded pair with
useQuery, matching admin/superadmin/tracking. Checkout.tsx's
user-triggered slot fetch and ItemModal's Escape-key listener are
left as-is (not data-fetch-on-mount patterns).

Refs: #77
EOF
)"
```

---

### Task 10: TanStack Query — `tablet` app `useOrders`

**Files:**
- Modify: `web/apps/tablet/package.json` (add `@tanstack/react-query` dependency)
- Modify: `web/apps/tablet/src/main.tsx`
- Modify: `web/apps/tablet/src/lib/useOrders.ts`

**Interfaces:**
- Produces (unchanged — every caller of `useOrders()` needs zero changes): `{ newOrders: Order[]; activeOrders: Order[]; loading: boolean; accept: (orderId: string) => Promise<void>; reject: (orderId: string, reason?: string) => Promise<void>; updateStatus: (orderId: string, status: string) => Promise<Order> }`.
- Consumes: `useApi()` from `./api`, `useRealtime()` from `./realtime` (both unchanged), `useQuery`/`useMutation`/`useQueryClient` from `@tanstack/react-query`.

This is the largest sub-task: `useOrders.ts` mixes an initial fetch, 3 mutations, and 4 realtime-push handlers that all mutate the same order list. The conversion moves that list into the TanStack Query cache (`queryClient.setQueryData`) instead of local `useState`, so the realtime handlers and mutations all read/write through one cache entry.

- [ ] **Step 1: Add the dependency**

Modify `web/apps/tablet/package.json` — add to `"dependencies"`: `"@tanstack/react-query": "^5.101.0"`.

Run: `cd web && pnpm install`

- [ ] **Step 2: Wire `QueryClientProvider` in `main.tsx`**

```diff
+import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
 import { AuthProvider, type AuthNavigator } from '@wolfchow/auth'
 import { createLocalStorageSession } from '@wolfchow/api-client'
 import { ToastProvider } from '@wolfchow/ui'
 import { ApiProvider, buildApiClient } from './lib/api'
 import { RealtimeProvider } from './lib/realtime'
 import { App } from './App'
 import './index.css'

+const queryClient = new QueryClient({
+  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
+})
+
 function Providers() {
```

Wrap the returned tree's outermost element:

```diff
   return (
-    <ToastProvider>
-      <ApiProvider client={client}>
-        <AuthProvider client={client} session={session} navigator={authNavigator}>
-          <RealtimeProvider>
-            <App />
-          </RealtimeProvider>
-        </AuthProvider>
-      </ApiProvider>
-    </ToastProvider>
+    <QueryClientProvider client={queryClient}>
+      <ToastProvider>
+        <ApiProvider client={client}>
+          <AuthProvider client={client} session={session} navigator={authNavigator}>
+            <RealtimeProvider>
+              <App />
+            </RealtimeProvider>
+          </AuthProvider>
+        </ApiProvider>
+      </ToastProvider>
+    </QueryClientProvider>
   )
```

- [ ] **Step 3: Rewrite `useOrders.ts`**

```ts
import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Order, OrderStatus } from '@wolfchow/types'
import { useApi } from './api'
import { useRealtime } from './realtime'

const ORDERS_QUERY_KEY = ['tablet-orders'] as const
const ACTIVE_STATUSES: OrderStatus[] = ['accepted', 'preparing', 'ready']

function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch {
    // AudioContext blocked until user interaction on some browsers
  }
}

export function useOrders() {
  const api = useApi()
  const queryClient = useQueryClient()
  const { subscribe } = useRealtime()
  const autoRejectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const initialScheduleDone = useRef(false)

  const { data: orders = [], isLoading: loading } = useQuery({
    queryKey: ORDERS_QUERY_KEY,
    queryFn: () => api.orders.listActive(),
  })

  const setOrders = useCallback(
    (updater: (prev: Order[]) => Order[]) => {
      queryClient.setQueryData<Order[]>(ORDERS_QUERY_KEY, (prev) => updater(prev ?? []))
    },
    [queryClient],
  )

  const removeOrder = useCallback((orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
    const timer = autoRejectTimers.current.get(orderId)
    if (timer) { clearTimeout(timer); autoRejectTimers.current.delete(orderId) }
  }, [setOrders])

  const scheduleAutoReject = useCallback((order: Order) => {
    if (!order.accept_deadline_at) return
    const ms = new Date(order.accept_deadline_at).getTime() - Date.now()
    if (ms <= 0) {
      void api.orders.rejectOrder(order.id, 'auto_reject').then(() => removeOrder(order.id)).catch(() => {})
      return
    }
    const timer = setTimeout(() => {
      void api.orders.rejectOrder(order.id, 'auto_reject').then(() => removeOrder(order.id)).catch(() => {})
    }, ms)
    autoRejectTimers.current.set(order.id, timer)
  }, [api, removeOrder])

  // Schedule auto-reject timers once, right after the initial fetch resolves
  // (matches the old effect's [api, scheduleAutoReject]-once-on-mount behavior;
  // guarded by a ref so later cache updates from realtime/mutations don't re-run it).
  useEffect(() => {
    if (initialScheduleDone.current || loading) return
    initialScheduleDone.current = true
    orders.filter((o) => o.status === 'auth_success').forEach(scheduleAutoReject)
  }, [loading, orders, scheduleAutoReject])

  useEffect(() => {
    const timers = autoRejectTimers.current
    return () => { timers.forEach(clearTimeout); timers.clear() }
  }, [])

  useEffect(() => {
    const unsubs = [
      subscribe('new_order', (_, payload) => {
        const orderId = payload.order_id as string
        void api.orders.getOrder(orderId).then((order) => {
          setOrders((prev) => {
            if (prev.some((o) => o.id === orderId)) return prev
            return [order, ...prev]
          })
          scheduleAutoReject(order)
          playBeep()
        }).catch(() => {})
      }),

      subscribe('order_accepted', (_, payload) => {
        const orderId = payload.order_id as string
        setOrders((prev) =>
          prev.map((o) => o.id === orderId ? { ...o, status: 'accepted' as OrderStatus } : o),
        )
        const timer = autoRejectTimers.current.get(orderId)
        if (timer) { clearTimeout(timer); autoRejectTimers.current.delete(orderId) }
      }),

      subscribe('order_rejected', (_, payload) => {
        removeOrder(payload.order_id as string)
      }),

      subscribe('order_status_changed', (_, payload) => {
        const { order_id, new_status } = payload as { order_id: string; new_status: string }
        setOrders((prev) =>
          prev.map((o) => o.id === order_id ? { ...o, status: new_status as OrderStatus } : o),
        )
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [subscribe, api, scheduleAutoReject, removeOrder, setOrders])

  const newOrders = orders.filter((o) => o.status === 'auth_success')
  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status))

  const acceptMutation = useMutation({
    mutationFn: (orderId: string) => api.orders.acceptOrder(orderId),
    onSuccess: (updated, orderId) => {
      setOrders((prev) => prev.map((o) => o.id === orderId ? updated : o))
      const timer = autoRejectTimers.current.get(orderId)
      if (timer) { clearTimeout(timer); autoRejectTimers.current.delete(orderId) }
    },
  })
  const accept = useCallback(async (orderId: string) => {
    await acceptMutation.mutateAsync(orderId)
  }, [acceptMutation])

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      api.orders.rejectOrder(orderId, reason),
    onSuccess: (_data, { orderId }) => removeOrder(orderId),
  })
  const reject = useCallback(async (orderId: string, reason?: string) => {
    await rejectMutation.mutateAsync({ orderId, reason })
  }, [rejectMutation])

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      api.orders.updateOrderStatus(orderId, status),
    onSuccess: (updated, { orderId }) => {
      setOrders((prev) => prev.map((o) => o.id === orderId ? updated : o))
    },
  })
  const updateStatus = useCallback(async (orderId: string, status: string) => {
    return updateStatusMutation.mutateAsync({ orderId, status })
  }, [updateStatusMutation])

  return { newOrders, activeOrders, loading, accept, reject, updateStatus }
}
```

- [ ] **Step 4: Create a tablet test-utils wrapper (mirrors superadmin's pattern)**

Check whether `web/apps/tablet/src/lib/test-utils.tsx` already exists — if not, create it:

```tsx
import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function renderWithQueryClient(ui: ReactElement): RenderResult {
  return render(
    <QueryClientProvider client={makeTestQueryClient()}>{ui}</QueryClientProvider>,
  )
}
```

- [ ] **Step 5: Run tablet test suite, updating any test that renders a page consuming `useOrders` bare**

Run: `cd web && pnpm --filter @wolfchow/app-tablet test`
Expected: any test rendering `ActiveOrders`, `OrderQueue`, `OrderHistory`, `Inventory`, or `PauseControl` without a `QueryClientProvider` ancestor will fail with "No QueryClient set". For each such failure, wrap that test's `render(...)` call with `renderWithQueryClient(...)` from Step 4 (or add `<QueryClientProvider client={makeTestQueryClient()}>` directly around the existing render tree if the test already has other providers to nest inside).

- [ ] **Step 6: Run full workspace test + typecheck + tablet build**

Run: `cd web && pnpm -w test && pnpm -w typecheck && pnpm --filter @wolfchow/app-tablet build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/apps/tablet/package.json web/apps/tablet/src/main.tsx web/apps/tablet/src/lib/useOrders.ts web/apps/tablet/src/lib/test-utils.tsx pnpm-lock.yaml
git add -u web/apps/tablet/src
git commit -m "$(cat <<'EOF'
STORY-082: convert tablet useOrders to TanStack Query

Moves the order list from local useState into the query cache
(queryClient.setQueryData), so the initial fetch, the 3 mutations
(accept/reject/updateStatus), and the 4 realtime push handlers all
read/write through one cache entry instead of duplicated local
state. Public hook signature is unchanged — no caller updates needed.

Refs: #77
EOF
)"
```

---

## Final verification

- [ ] Run: `cd web && pnpm -w test && pnpm -w typecheck && pnpm -w lint`
  Expected: all green
- [ ] Run: `cd web && pnpm --filter "./apps/*" build`
  Expected: all 5 apps build independently without error
- [ ] Manually diff each modified page in a running `pnpm dev` session against `main` for the affected apps (admin: Menu, Settings, Payments; widget: full checkout flow; tablet: order queue; tracking: order status page) to confirm no visual regression, since this refactor's entire premise is "zero behavior change."
- [ ] Update the Docmost story page (page ID `019f39cb-8be7-79a2-90b1-dc647d596d7d`) — check off all 10 tasks, move Status to 🔵 In Review once the PR is open.
- [ ] Push branch, open PR titled `STORY-082: Frontend modularity refactor`, move Vikunja #77 to In Review with the PR URL per CLAUDE.md.
