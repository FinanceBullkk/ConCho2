# Route Permission Matrix

## Overview

Source: current route middleware. Keep this matrix updated when routes move into domain modules.

> **Authz mechanism note (Phase 0, 2026-06-14):** the coarse check on the
> Admin-only platform routes moved from `roleGuard('Admin')` onto the capability
> layer (`requireCapability`) so the whole app uses ONE mechanism. **Role outcomes
> below are UNCHANGED** (all still Admin-only — Admin is superuser; the new caps
> are added to no other role). New Admin-only capabilities: `user.manage`
> (`/api/users`), `settings.manage` (`/api/settings`), `data.transfer`
> (`/api/import`,`/api/export`,`/api/sync`), `analytics.read` (`/api/dashboard`),
> `audit.read` (`/api/admin/audit`), `system.ops`
> (`/api/admin-db`,`/api/admin/reconcile`). **Intentionally still on
> `roleGuard`** (by design / converging later): `/api/auth` + `/api/admin/cron`
> (security/cron) and the converging-legacy trio `/api/classes`,
> `/api/enrollments`, `/api/evaluations` (retired in their convergence phase).

| Base path | Read access | Write access | Notes |
|---|---|---|---|
| `/health`, `/ready`, `/api/health`, `/api/ready` | public | none | Liveness/readiness probes — no auth required |
| `/api/auth` | authenticated self | self/Admin depending endpoint | login/reset public with rate limits |
| `/api/users` | Admin | Admin | includes deleted/restore/progress |
| `/api/teams` | Admin; `/my-teams` authenticated | Admin | participant can read own teams |
| `/api/classes` | authenticated, with detail policy | Admin | legacy compatibility surface. Catalog-open read is BY DESIGN (SEC-015, audit 2026-06-11): learners browse to self-enroll; DTO carries operational metadata only |
| `/api/learning/programs` | authenticated | Admin/Coordinator (`program.manage`) | new catalog API. Catalog-open read BY DESIGN (SEC-015 — same rationale as `/api/classes`; cohorts list likewise) |
| `/api/learning/cohorts` | authenticated | Admin/Coordinator (`cohort.manage`) | new cohort API backed by legacy Class. Optional `?mode=team\|cohort` world filter (English-class separation; ignored when `programId` given) |
| `/api/learning/sessions` | Admin all; Teacher assigned cohorts; Participant enrolled sessions **∪ sessions of their active cohort enrollments** (phase-04 B widening; rows carry `effectiveCapacity`) | `session.book` (Admin/Coordinator/Participant-leader); leader booking/cancel | session DTO API backed by legacy Schedule; writes use `groupId`/`cohortId`. Group writes hit the same shared `schedulingMode` gate as `/api/schedules` (delegates to `scheduleService.bookSlot`); cohort writes are **scheduler-only** (Admin/Coordinator — re-center Phase 2) + `assertCohortMode` + **required `officeId`**. DTO exposes `office {name,code}` |
| `/api/learning/paths` | `path.read` (browse + own progress) | Admin/Coordinator (`path.manage`) | Wave C sequenced curricula; progress derived from program completion |
| `/api/assessment` | `assessment.read`; learner `assessment.attempt` | `assessment.manage` (Admin/Teacher) | generic assessment engine; teacher cohort-scoped |
| `/api/org` | `department.read`/`office.read` (Admin/Coordinator/Teacher); `team.read` (own reports) | `department.manage`/`org.manage` (Admin); `office.manage` (Admin/Coordinator) | Wave D3 departments + manager hierarchy + manager dashboard; re-center Phase 1 offices (`/api/org/offices`) + `officeId` leg on assignment |
| `/api/learning/assignments` | Admin/Coordinator/Teacher (`assignment.read`) | Admin/Coordinator (`assignment.manage`) | D4 Program/Path assignment + due dates; soft-delete archive |
| `/api/learning/reports` | Admin/Coordinator/Teacher (`report.read`); compliance + export Admin-only inside | none (read-only; exports audit-logged + rate-limited) | completion report/rollup + xlsx export; D6 compliance report/export |
| `/api/learning/dashboard` | Admin/Coordinator/Teacher (`report.read`); Teacher class-scoped; `/executive` + `/cost-config` Admin-only inside | Admin: PUT `/cost-config` (`LND_COST_CONFIG` Setting, audited) | 2-tier dashboard: operational KPI bundle (Phase 1) + executive ROI bundle/trend/Kirkpatrick/financials (Phase 3); fail-soft per metric |
| `/api/rooms` | Admin/Coordinator (`room.read`) | Admin/Coordinator (`room.manage`) | re-center Phase 3: Office-scoped physical Rooms; archive refused while a future session uses the room (409). NOT learner-facing (scheduling tool) |
| `/api/schedules` | Admin all; Teacher attendance calendar scoped by class binding; Participant own/my-class/availability | Admin; leader booking/cancel; **`PUT /:id/trainers`** Admin/Coordinator (`session.assign-trainer`) | booking allows Admin/Participant leader. Create/reassign also gated by program `schedulingMode` (Pass C): leader-booking an `admin_scheduled` program → 403; team-booking a cohort program (`self_enroll`/`nomination`) → 400; unknown mode → 501; program-less class falls back to `leader_booking`. re-center Phase 3: a `roomId` is validated against the session's Office (cross-Office → 422) + a per-room `{roomId,startTime}` lock (cross-class race → 409); `PUT /:id/trainers` sets internal (UNION authz) + external trainers. `cancelSlot` allows a Coordinator to cancel a team-less cohort session. Cancel/delete are DURABLE (phase-04 A): status flip + optional `cancelReason` body; lists default live-only with `?status=cancelled\|all` staff history (Participant force-live). **Waitlist (phase-04 B):** `POST/DELETE /:id/waitlist` self join/leave (Admin/Participant + bookingLimiter; join only when FULL, audience-scoped team-member/cohort-enrollee), `GET /waitlist/mine` own entries+position, `GET /:id/waitlist` staff list (Admin/Coordinator all / Teacher class-scoped; Participant 403; staff UI: Waitlist modal on the cohort sessions panel). See `domains/schedule/{scheduling-mode-policy,room-lock-policy,release-resources}.js`, `domains/schedule/waitlist/`, `policy/sessionInstructors.js` |
| `/api/english` | `/classes` authenticated (cohort-DTO parity); `/schedules` authenticated w/ Participant enrolled-only scope; `/attendance-calendar` Admin/Teacher | **none** (read-only surface) | English-class separation (2026-06-12): bounded read surface over the TEAM world (`domains/english-class/` forces `mode=team` — `leader_booking`/`admin_scheduled` + program-less legacy). Mutations stay on `/api/teams`, `/api/schedules`, `/api/evaluations`. Existing lists gained the symmetric `?mode=` filter (`/api/schedules`, `/api/schedules/attendance-calendar`, `/api/learning/cohorts`) |
| `/api/attendance` | Admin/Teacher; self stats authenticated | Admin/Teacher | teacher binding applies in policy/controller paths |
| `/api/evaluations` | authenticated with controller role policy; **`GET /roster?classId=`** Admin/Teacher (per-class binding) → Active-enrolment learners for the grading picker (FLOW-001) | Admin/Teacher write; Admin delete | participant read is self-scoped; roster MUST stay declared before `/:id` |
| `/api/enrollments` | Admin | Admin | route-level Admin guard |
| `/api/import` | Admin | Admin | bulk import |
| `/api/export` | Admin | Admin | route-level Admin guard |
| `/api/settings` | Admin | Admin | whitelisted keys |
| `/api/access` | Admin | none | read-only capability matrix (`capability-matrix`); `settings.manage` |
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
