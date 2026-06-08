# Route Permission Matrix

## Overview

Source: current route middleware. Keep this matrix updated when routes move into domain modules.

| Base path | Read access | Write access | Notes |
|---|---|---|---|
| `/health`, `/ready`, `/api/health` | public | none | Liveness/readiness probes — no auth required |
| `/api/auth` | authenticated self | self/Admin depending endpoint | login/reset public with rate limits |
| `/api/users` | Admin | Admin | includes deleted/restore/progress |
| `/api/teams` | Admin; `/my-teams` authenticated | Admin | participant can read own teams |
| `/api/classes` | authenticated, with detail policy | Admin | legacy compatibility surface |
| `/api/learning/programs` | authenticated | Admin | new catalog API |
| `/api/learning/cohorts` | authenticated | Admin | new cohort API backed by legacy Class |
| `/api/learning/sessions` | Admin all; Teacher assigned cohorts; Participant enrolled sessions | Admin; leader booking/cancel | session DTO API backed by legacy Schedule; writes use `groupId` |
| `/api/learning/paths` | `path.read` (browse + own progress) | Admin (`path.manage`) | Wave C sequenced curricula; progress derived from program completion |
| `/api/assessment` | `assessment.read`; learner `assessment.attempt` | `assessment.manage` (Admin/Teacher) | generic assessment engine; teacher cohort-scoped |
| `/api/org` | `department.read`; `team.read` (own reports) | `department.manage`/`org.manage` (Admin) | Wave D3 departments + manager hierarchy + manager dashboard |
| `/api/learning/assignments` | Admin/Teacher (`assignment.read`) | Admin (`assignment.manage`) | D4 Program/Path assignment + due dates; soft-delete archive |
| `/api/schedules` | Admin all; Teacher attendance calendar scoped by class binding; Participant own/my-class/availability | Admin; leader booking/cancel | booking allows Admin/Participant leader |
| `/api/attendance` | Admin/Teacher; self stats authenticated | Admin/Teacher | teacher binding applies in policy/controller paths |
| `/api/evaluations` | authenticated with controller role policy | Admin/Teacher write; Admin delete | participant read is self-scoped |
| `/api/enrollments` | Admin | Admin | route-level Admin guard |
| `/api/import` | Admin | Admin | bulk import |
| `/api/export` | Admin | Admin | route-level Admin guard |
| `/api/settings` | Admin | Admin | whitelisted keys |
| `/api/dashboard` | Admin | Admin cache invalidation | admin analytics only |
| `/api/admin-db` | Admin | Admin | generic DB explorer whitelist |
| `/api/admin/audit` | Admin | none | audit query |
| `/api/admin/reconcile` | Admin | Admin manual run | read reports and trigger run |
| `/api/admin/cron` | Admin | none | cron run health/history (CronRun) |
| `/api/cron` | cron token | cron token | external scheduled calls: health, reconcile, attendance-reminders, assignment-reminders |
| `/api/search` | authenticated | none | result scoping in service |
| `/api/sync` | Admin | Admin | Google Sheets sync |

## Rules

- New L&D routes should use explicit `protect` plus role/capability middleware.
- Participant routes must scope by current user, enrollment, or team leader relationship.
- Teacher routes must be ready for facilitator-scoped access.
- Admin-only operational endpoints stay Admin-only until a capability system replaces raw role checks.

## Unresolved Questions

- Which Teacher read surfaces should become facilitator-scoped first.
