# Capability Spec Registry

**Single source of truth for system BEHAVIOR.** Each capability has one
`spec.md` describing what the system does today — Business Requirements (BR),
Use Cases (UC), Functional Requirements (FR with Given/When/Then scenarios),
Non-Functional Requirements (NFR), and Acceptance Criteria (AC).

This complements — does not duplicate — the other docs:
- `docs/current-system-map.md` = **code map** (which file/route implements what).
- `docs/specs/` = **behavior** (what it must do, with testable scenarios).
- `plans/` = **change proposals** (deltas), archived after they ship.

Format is OpenSpec-compatible. We do not run the OpenSpec npm tool; the workflow
is homegrown (see `.claude/rules/spec-driven-development.md`). Migration to the
real tool would just be `mv docs/specs openspec/specs`.

## Lifecycle (Propose → Apply → Archive)

1. **Propose** — new plan from `plans/_TEMPLATE-proposal.md`, written as a delta
   (`ADDED / MODIFIED / REMOVED`) against target capability spec(s).
2. **Apply** — implement; tests + lint green.
3. **Archive** — fold the delta into the capability `spec.md`, bump
   `last_updated`, set the plan `status: archived`, update this registry + the
   `docs/development-roadmap.md` changelog.

New capability → copy `_TEMPLATE-spec.md` into `docs/specs/<capability>/spec.md`
and add a row below.

## Status legend

- **stable** — shipped and enforced.
- **evolving** — partially built, or persisted-but-not-enforced (spec says which).
- **deprecated** — retained for history only.

## Registry

28 capabilities, all written (✅). Behavior lives in each linked `spec.md`; this
table is just the index. Covers every mounted `/api/*` route surface.

| Capability | Status | Owners (source) | Last updated |
|---|---|---|---|
| [scheduling-and-booking](scheduling-and-booking/spec.md) | stable | scheduleService, domains/schedule, domains/room, domains/learning/session | 2026-06-12 |
| [auth-and-sessions](auth-and-sessions/spec.md) | stable | controllers/authController, services/authService, services/mfaService, middleware/auth | 2026-06-12 |
| [users-and-roles](users-and-roles/spec.md) | stable | controllers/userController, models/User | 2026-06-12 |
| [teams-and-groups](teams-and-groups/spec.md) | stable | domains/groups, models/Team | 2026-06-12 |
| [attendance](attendance/spec.md) | stable | domains/attendance, models/Attendance | 2026-06-12 |
| [learning-catalog](learning-catalog/spec.md) | stable | domains/learning, controllers/classController | 2026-06-10 |
| [enrollment](enrollment/spec.md) | evolving | domains/learning/enrollment, controllers/enrollmentController | 2026-06-09 |
| [learning-paths](learning-paths/spec.md) | stable | domains/learning/path | 2026-06-08 |
| [assessments](assessments/spec.md) | stable | domains/assessment, controllers/evaluationController | 2026-06-14 |
| [question-bank](question-bank/spec.md) | stable | domains/assessment (question-bank) | 2026-06-08 |
| [grading](grading/spec.md) | stable | domains/assessment (grading, manual-grading) | 2026-06-08 |
| [feedback](feedback/spec.md) | stable | domains/learning/feedback | 2026-06-08 |
| [completion-and-certificates](completion-and-certificates/spec.md) | stable | domains/learning/completion | 2026-06-08 |
| [assignments-and-reminders](assignments-and-reminders/spec.md) | stable | domains/learning/assignment, services/reminderService | 2026-06-08 |
| [reporting-and-rollups](reporting-and-rollups/spec.md) | stable | domains/learning/reports, domains/learning/dashboard | 2026-06-15 |
| [compliance-and-recertification](compliance-and-recertification/spec.md) | stable | domains/learning/reports (compliance) | 2026-06-08 |
| [audit-log](audit-log/spec.md) | stable | services/auditService, models/AuditLog | 2026-06-08 |
| [export-and-integrations](export-and-integrations/spec.md) | stable | services/exportService, services/calendarService, controllers/syncController, lib | 2026-06-08 |
| [reconcile-job](reconcile-job/spec.md) | stable | services/reconcileService, controllers/reconcileController, jobs | 2026-06-12 |
| [capability-authz](capability-authz/spec.md) | evolving | middleware/requireCapability, policy/capabilities, middleware/roleGuard, policy, domains/access, models/Role | 2026-06-15 |
| [security-platform](security-platform/spec.md) | stable | middleware (csrf, rateLimiters, validate, sanitize), helmet, soft-delete | 2026-06-12 |
| [evaluations](evaluations/spec.md) | stable | controllers/evaluationController, models/Evaluation (legacy 4-skill; instructor-scored mode of assessments) | 2026-06-14 |
| [bulk-import](bulk-import/spec.md) | stable | controllers/importController, services/importService | 2026-06-12 |
| [settings](settings/spec.md) | stable | controllers/settingController, models/Setting | 2026-06-08 |
| [dashboard-analytics](dashboard-analytics/spec.md) | stable | controllers/dashboardController | 2026-06-08 |
| [search](search/spec.md) | stable | controllers/searchController, services/searchService | 2026-06-08 |
| [admin-db-explorer](admin-db-explorer/spec.md) | stable | routes/adminDbRoutes | 2026-06-08 |
| [org-and-departments](org-and-departments/spec.md) | stable | domains/org, models/Department, models/Office | 2026-06-10 |

> Status: **stable** = shipped + enforced · **evolving** = partial / persisted-
> not-enforced (the spec's "Out of Scope" says which).
