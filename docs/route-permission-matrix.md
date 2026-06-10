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
| `/api/learning/programs` | authenticated | Admin/Coordinator (`program.manage`) | new catalog API |
| `/api/learning/cohorts` | authenticated | Admin/Coordinator (`cohort.manage`) | new cohort API backed by legacy Class |
| `/api/learning/sessions` | Admin all; Teacher assigned cohorts; Participant enrolled sessions | `session.book` (Admin/Coordinator/Participant-leader); leader booking/cancel | session DTO API backed by legacy Schedule; writes use `groupId`/`cohortId`. Group writes hit the same shared `schedulingMode` gate as `/api/schedules` (delegates to `scheduleService.bookSlot`); cohort writes are **scheduler-only** (Admin/Coordinator — re-center Phase 2) + `assertCohortMode` + **required `officeId`**. DTO exposes `office {name,code}` |
| `/api/learning/paths` | `path.read` (browse + own progress) | Admin/Coordinator (`path.manage`) | Wave C sequenced curricula; progress derived from program completion |
| `/api/assessment` | `assessment.read`; learner `assessment.attempt` | `assessment.manage` (Admin/Teacher) | generic assessment engine; teacher cohort-scoped |
| `/api/org` | `department.read`/`office.read` (Admin/Coordinator/Teacher); `team.read` (own reports) | `department.manage`/`org.manage` (Admin); `office.manage` (Admin/Coordinator) | Wave D3 departments + manager hierarchy + manager dashboard; re-center Phase 1 offices (`/api/org/offices`) + `officeId` leg on assignment |
| `/api/learning/assignments` | Admin/Coordinator/Teacher (`assignment.read`) | Admin/Coordinator (`assignment.manage`) | D4 Program/Path assignment + due dates; soft-delete archive |
| `/api/learning/reports` | Admin/Coordinator/Teacher (`report.read`); compliance + export Admin-only inside | none (read-only; exports audit-logged + rate-limited) | completion report/rollup + xlsx export; D6 compliance report/export |
| `/api/learning/dashboard` | Admin/Coordinator/Teacher (`report.read`); Teacher class-scoped; `/executive` + `/cost-config` Admin-only inside | Admin: PUT `/cost-config` (`LND_COST_CONFIG` Setting, audited) | 2-tier dashboard: operational KPI bundle (Phase 1) + executive ROI bundle/trend/Kirkpatrick/financials (Phase 3); fail-soft per metric |
| `/api/schedules` | Admin all; Teacher attendance calendar scoped by class binding; Participant own/my-class/availability | Admin; leader booking/cancel | booking allows Admin/Participant leader. Create/reassign also gated by program `schedulingMode` (Pass C): leader-booking an `admin_scheduled` program → 403; team-booking a cohort program (`self_enroll`/`nomination`) → 400; unknown mode → 501; program-less class falls back to `leader_booking`. See `domains/schedule/scheduling-mode-policy.js` |
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
