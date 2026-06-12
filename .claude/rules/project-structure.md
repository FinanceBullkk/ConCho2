# Project Structure

Monorepo: `client/` (React SPA) + `server/` (Express API). Root `package.json` orchestrates both.

## Server layout
```
server/
├── domains/        # modular-monolith boundaries (L&D migration) — see domain-model-and-migration.md
│   ├── learning/   # full reference domain: routes, controller, use-cases, repository, dto, schemas
│   ├── schedule/   # own routes (/api/schedules) + booking/room/waitlist policies
│   ├── attendance/ # full domain (was attendanceController/attendanceService)
│   ├── groups/     # full domain (was teamController; Team model + /api/teams URL kept)
│   ├── assessment/ # assessment engine + question bank + grading
│   ├── org/        # departments, offices, manager hierarchy
│   ├── room/       # office-scoped physical rooms
│   └── english-class/ # READ-ONLY /api/english surface over the team-booking world (separation 2026-06-12)
├── routes/         # legacy Express routers (17 files) — mounted in server.js
├── controllers/    # legacy request handlers (13 facades + auth/class/dashboard/enrollment/user subdirs)
├── services/       # business logic (auth, schedule, attendance, export, reconcile...)
├── policy/         # resource-level authz (ownership/binding) — called from controllers AFTER roleGuard
├── models/         # Mongoose schemas (27 files)
├── middleware/     # auth, csrfProtection, roleGuard, requireCapability, rateLimiters, validate, cronAuth, requestId, analyticsCache
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
└── i18n/locales/   # en.json (English-only)
```

## Modularization rule
Keep files focused. When a server file exceeds ~200 lines of logic, extract toward the `domains/<domain>/` pattern (controller → use-cases → repository). The major legacy controllers/services are now modularized (each a thin facade/orchestrator over `controllers/<x>/*` or `services/<x>/*`): `authController`, `userController`, `enrollmentController`, `classController`, `dashboardController`, `authService`, `exportService`, `reconcileService`, plus `scheduleService`'s read/query layer. Two areas have moved all the way into the `domains/` convention: `domains/attendance` (was `attendanceController`/`attendanceService`) and `domains/groups` (was `teamController` — `Team` model + `/api/teams` URL unchanged). Kept large by design (re-sanctioned in audit round 7 / CODE-016): `scheduleService` (~585 — transaction-heavy booking paths; grew with Wave E capacity/cancellation/waitlists; **any further growth must extract the next slice into `domains/schedule/` instead**), `domains/schedule/use-cases.js` (~400, same rule), and `syncController` (~276, one cohesive Google-Sheets handler). Remaining Phase 1 work is architectural: repository interfaces only (schedule domain routes + frontend `features/` shipped 2026-06-10).
