# Project Structure

Monorepo: `client/` (React SPA) + `server/` (Express API). Root `package.json` orchestrates both.

## Server layout
```
server/
├── domains/        # NEW modular-monolith boundaries (L&D migration) — see domain-model-and-migration.md
│   ├── learning/   # full domain: routes, controller, use-cases, repository, dto, schemas
│   └── schedule/   # adapter domain: delegates via legacy controller (no own routes)
├── routes/         # legacy Express routers (19 files) — mounted in server.js
├── controllers/    # legacy request handlers (15 files)
├── services/       # business logic (auth, schedule, attendance, export, reconcile...)
├── policy/         # resource-level authz (ownership/binding) — called from controllers AFTER roleGuard
├── models/         # Mongoose schemas (13 files)
├── middleware/     # auth, csrfProtection, roleGuard, rateLimiters, validate, cronAuth, requestId
├── schemas/        # zod request schemas
├── jobs/           # node-cron schedules
├── lib/            # mailer, sentry, google clients
├── helpers/        # handleError, shared utils
├── config/         # env/config loading
├── scripts/        # seed, backfill, migration, verify-backup (run via node)
└── tests/          # integration/ + unit/ + load/ (artillery)
```

## Client layout
```
client/src/
├── pages/          # route-level views (lazy-loaded)
├── components/     # reusable components (+ ui/ for shadcn primitives)
├── hooks/          # custom hooks + React Query hooks + queryKeys.js
├── context/        # AuthContext
├── lib/            # zod schemas, sentry, utils
├── api/            # axios instance + per-resource API objects
└── i18n/locales/   # en.json, vi.json
```

## Modularization rule
Keep files focused. When a server file exceeds ~200 lines of logic, extract toward the `domains/<domain>/` pattern (controller → use-cases → repository). Large legacy files pending split: `scheduleService` (~731), `authController` (~704), `teamController` (~694), `exportService` (~638), `userController` (~564).
