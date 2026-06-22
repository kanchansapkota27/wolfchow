# Superadmin UI Redesign

**Date:** 2026-06-22  
**Status:** Approved  
**Scope:** Full visual redesign of `wolfchow/web/apps/superadmin` — all 8 pages + shell

---

## Goal

Replace the current all-dark theme with the reference design: dark sidebar + light main content, Lucide icons in nav, responsive (mobile drawer), consistent page-header pattern, and a new Settings page.

All existing functionality stays intact — no API calls, hooks, or business logic change.

---

## Design Tokens

| Token | Value | Usage |
|---|---|---|
| `sidebar-bg` | `#1e2235` | Sidebar background |
| `sidebar-active` | `#3b82f6` | Active nav pill |
| `sidebar-text` | `#9ca3af` | Inactive nav text/icon |
| `content-bg` | `#f3f4f6` | Main content area background |
| `card-bg` | `#ffffff` | Content card background |
| `card-border` | `#e5e7eb` | Card border |
| `topbar-bg` | `#ffffff` | Topbar strip |
| `heading` | `#111827` | Page titles |
| `muted` | `#6b7280` | Subtitles, labels |
| `primary` | `#3b82f6` | Primary buttons, links |

All implemented as Tailwind classes (no CSS variables needed).

---

## Shell — Layout.tsx

### Structure

```
┌─ sidebar (260px fixed) ──────────┐  ┌─ main ──────────────────────────────┐
│  [R] Restro SA                   │  │  topbar: PLATFORM MANAGEMENT         │
│                                  │  │  ─────────────────────────────────── │
│  ○ Dashboard                     │  │                                       │
│  ○ Restaurants                   │  │  <Outlet />                          │
│  ● Plans          ← active blue  │  │                                       │
│  ○ Invites                       │  │                                       │
│  ○ SMTP                          │  │                                       │
│  ○ Billing                       │  │                                       │
│  ○ Audit Log                     │  │                                       │
│  ○ Settings                      │  │                                       │
│                                  │  │                                       │
│  [K] k@gmail.com                 │  │                                       │
│      SUPERADMIN                  │  │                                       │
│  → Logout                        │  │                                       │
└──────────────────────────────────┘  └───────────────────────────────────────┘
```

### Nav items with Lucide icons

| Route | Label | Icon |
|---|---|---|
| `/` | Dashboard | `LayoutDashboard` |
| `/restaurants` | Restaurants | `Store` |
| `/plans` | Plans | `CreditCard` |
| `/invites` | Invites | `UserPlus` |
| `/smtp` | SMTP | `Mail` |
| `/billing` | Billing | `BarChart2` |
| `/audit` | Audit Log | `ClipboardList` |
| `/settings` | Settings | `Settings` |

### Sidebar logo

Blue `#3b82f6` square (8×8) with white bold "R", beside "Restro SA" in white font-semibold.

### Sidebar user section (bottom)

- Gray circle avatar showing first letter of email in uppercase
- Email truncated, white text sm
- "SUPERADMIN" in xs uppercase tracking-widest gray-400
- `LogOut` icon + "Logout" text, click calls `logout()`

### Responsive

- **md+ (≥768px):** sidebar always visible, fixed left, main has `ml-64`
- **< md:** sidebar hidden by default; hamburger `Menu` icon in topbar opens it as an overlay drawer (state: `sidebarOpen`). Clicking a nav link closes drawer. Overlay backdrop click closes it.

### Topbar

White strip, full width, `h-14`, left-padded. Shows hamburger on mobile. Shows "PLATFORM MANAGEMENT" text in `text-xs font-semibold tracking-widest text-gray-400 uppercase` always.

---

## Shared component — PageHeader

New file: `src/components/PageHeader.tsx`

```tsx
interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode   // button shown top-right
}
```

Renders:
```
<title>                              [action button]
<subtitle in gray-500>
```

Used at the top of every page's content area.

---

## Per-Page Redesign

All pages switch from dark card (`bg-gray-900 border-gray-800`) to light card (`bg-white border-gray-200 rounded-xl`). Tables switch from dark rows to white rows with `border-b border-gray-100` separators and uppercase gray column headers (`text-xs font-semibold tracking-wider text-gray-500`). Inputs get `border-gray-200 bg-white` styling.

### Dashboard

- `PageHeader` title="Dashboard" subtitle="Platform overview"
- 4 metric cards: white bg, gray label, large bold value — same grid layout

### Restaurants

- `PageHeader` title="Restaurants" subtitle="..." action=`+ Create Restaurant` button
- Search + filter bar in white card
- Table in white card: columns RESTAURANT, SLUG, PLAN, STATUS, CREATED, actions
- Detail slide-in panel: same data, white bg

### Plans

- `PageHeader` title="Subscription Plans" subtitle="Configure platform tiers..." action=`+ Create Plan`
- Plan cards as per reference: white cards in responsive grid (1 col mobile, 3 col lg)
- Each card: plan name, "N active restaurants", capability grid (STAFF CAP, ITEM CAP etc), FEATURE FLAGS badges, ALLOWED PAYMENTS badges, edit/delete icons top-right

### Invites

- `PageHeader` title="Restaurant Invites" subtitle="Issue and track private signup tokens." action=`+ Generate Invite`
- Search input + "All Status" filter dropdown in white card
- Table: TOKEN (blue link style), PLAN, COMMISSION, EMAIL (PRE-ASSIGN), STATUS badge, EXPIRES, copy icon

### SMTP

- `PageHeader` title="Platform SMTP" subtitle="Manage global fallback credentials and restaurant-specific overrides." action=badge `Global Fallback Active`
- Two-column layout: left = Global Settings card (form), right = Restaurant Overrides card (search + table with usage bar)

### Billing

- `PageHeader` title="Billing" subtitle="Per-restaurant commission and order volume."
- Chart card (existing recharts BarChart) — white bg
- Table card: white, columns RESTAURANT, PLAN, COMMISSION, ORDERS, GMV, EST. COMMISSION
- Export CSV button top-right

### Audit Log

All existing functionality preserved (5 filters: restaurant, table, operation, date from/to; expandable diff rows; pagination). Visual changes only:

- `PageHeader` title="Platform Audit Log" subtitle="Every administrative action across the platform is tracked here."
- Filters in white card: search-style layout matching reference (search input + Table dropdown + Operation dropdown on same row, date fields + restaurant + clear button on second row)
- Table in white card: uppercase headers TIMESTAMP, RESTAURANT, TABLE, OPERATION, USER; rows white with hover gray-50; expand chevron icon replaces ▼/▲
- Diff panel: light bg (`bg-gray-50`) instead of dark
- Pagination: "Previous" / "Next" buttons with border, "Showing X to Y of Z entries" text

### Settings (new page)

File: `src/pages/Settings.tsx`  
Route: `/settings` added to `App.tsx` and `Layout.tsx`

Three sections, each in its own white card:

**1. Security & Authentication** (lock icon, amber)
- JWT_EXPIRY_MINUTES input (number)
- GLOBAL_RATE_LIMIT input (number)
- Calls `api.superadmin.getSettings()` on load, `api.superadmin.updateSettings()` on save

**2. System Toggles** (zap icon, blue)
- Maintenance Mode toggle (switch)
- Label + description

**3. Infrastructure** (database icon, purple)
- SUPPORT_EMAIL input
- R2_PUBLIC_DOMAIN input
- WEBHOOK_SIGNING_SECRET input with show/hide toggle + Regenerate button

Single "Save Platform Settings" blue button at bottom.

---

## Responsive Breakpoints

| Breakpoint | Sidebar | Grid cols (metrics) | Grid cols (plans) |
|---|---|---|---|
| < 640px | drawer | 1 | 1 |
| 640–767px | drawer | 2 | 1 |
| 768–1023px | fixed visible | 2 | 2 |
| 1024px+ | fixed visible | 4 | 3 |

---

## File Changes

| File | Action |
|---|---|
| `src/components/Layout.tsx` | Full rewrite |
| `src/components/PageHeader.tsx` | New |
| `src/pages/Dashboard.tsx` | Restyle |
| `src/pages/Restaurants.tsx` | Restyle |
| `src/pages/Plans.tsx` | Restyle |
| `src/pages/Invites.tsx` | Restyle |
| `src/pages/Smtp.tsx` | Restyle |
| `src/pages/Billing.tsx` | Restyle |
| `src/pages/Audit.tsx` | Restyle (logic unchanged) |
| `src/pages/Settings.tsx` | New |
| `src/App.tsx` | Add `/settings` route |

---

## Out of Scope

- No changes to `@wolfchow/ui` shared components
- No changes to any API hooks or data fetching logic
- No changes to `@wolfchow/auth` or routing structure beyond adding `/settings`
- No animation library additions — CSS transitions only for drawer
