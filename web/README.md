# wolfchow/web — frontend monorepo

pnpm workspace holding every Wolfchow frontend app and the packages they share.
Lives in the same repository as the Workers backend (`wolfchow/`) but deploys
independently: each app ships to its own Cloudflare Pages project.

## Layout

```
apps/
  superadmin/   React SPA — Slice 1
  admin/        React SPA — Slice 2
  tablet/       React PWA — Slice 3
  widget/       Embeddable script — Slice 4
  tracking/     Public page — Slice 4
packages/
  types/        Shared TypeScript types (mirror the backend contract)
  api-client/   Typed fetch wrapper + auth refresh + named route functions
  ui/           React component primitives
  utils/        Formatting and domain helpers
```

## Commands (run from `web/`)

```bash
pnpm install          # install the whole workspace
pnpm typecheck        # tsc --noEmit across all packages and apps
pnpm test             # vitest (node + jsdom projects)
pnpm lint             # eslint
pnpm build            # build every app to apps/*/dist
```

## Decoupled deploys

Each app declares its own `deploy` script:

```bash
pnpm --filter @wolfchow/app-superadmin build
pnpm --filter @wolfchow/app-superadmin deploy   # wrangler pages deploy ./dist
```

Apps consume the shared packages as workspace dependencies (`workspace:*`); the
packages export TypeScript source directly, so Vite/Vitest bundle them with no
separate build step.
