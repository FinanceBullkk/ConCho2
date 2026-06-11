# LTMS Quality + D4 Status Summary

**Date:** 2026-06-05
**Quality plan:** `plans/260604-2008-precision-first-ltms-quality/plan.md`
**D4 plan:** `plans/260605-1135-assignment-due-dates/plan.md`
**Status:** Quality freeze complete; D4 assignment + due dates v1 complete

## Executive Verdict

Quality freeze is complete. Sessions 01-10 finished and Release Gate verdict is
**GO**: no open P0/P1, locally runnable CI-equivalent gates green at the gate.

Feature work resumed after the GO verdict. Wave D4 v1 is now complete: Admin can
assign required Programs or Learning Paths to users/departments with due dates;
Admin/Teacher can read assignment status; Admin can archive assignments.

## Quality Plan Rollup

| Session | Area | Verdict |
|---|---|---|
| 01 | Baseline Truth | completed |
| 02 | Auth + Session Security | P1 fixed |
| 03 | Role/Authz Matrix | P1 fixed |
| 04 | People + Org | P1 fixed |
| 05 | Learning Enrollment | race fixed |
| 06 | Scheduling + Attendance | OK |
| 07 | Assessment + Completion + Certificates | OK |
| 08 | Reports + Export | P1 fixed |
| 09 | Cron + Reconcile + Observability | OK |
| 10 | Release Gate | GO |

## D4 Done

- Added `Assignment` model + `server/domains/learning/assignment/`.
- Mounted `/api/learning/assignments`.
- Capabilities:
  - `assignment.read`: Admin, Teacher.
  - `assignment.manage`: Admin.
- Derived learner status:
  - `not_started`
  - `in_progress`
  - `complete`
  - `overdue`
- Department targets expand to assignable active users.
- Soft-deleted/inactive/dropped/transferred users excluded from assignment
  status.
- Due dates stay open through the due date; overdue starts after the whole date
  has passed.
- Learning workspace now has an **Assignments** tab and create modal.
- Docs updated: roadmap, system overview, current system map, route matrix,
  LTMS gap analysis, D4 plan/report.

## Verification

Quality Release Gate (before D4):

- Server Jest: 588/588.
- Client Vitest: 153/153.
- Client build: pass.
- Client lint: pass, 0 errors / 81 warnings.
- Server audit high+: pass, moderate-only.
- Client audit high+: pass.
- Gitleaks working tree: pass.

D4 focused gates:

- Server focused: 2 suites / 17 tests passed.
- Client focused: 3 suites / 28 tests passed.
- New frontend files lint: pass with `--max-warnings 0`.
- Client build: pass.
- `git diff --check`: pass.

## Accepted Risks / Later Work

- QB-005 local seeded Playwright backend harness.
- QB-006 pre-deploy dedupe for active cohort enrollment unique index.
- QB-007 product decision: Teacher org-wide vs class-bound scopes.
- QB-008 certificate unique guard resolved in later committed fix.
- QB-009 completion denominator soft-deleted learners resolved in later
  committed fix.
- QB-010 gitleaks legacy default-password history allowed/contained.
- D4 deferred: reminders/escalation, exports/report joins, recertification,
  cohort-specific assignment.

## Recommended Next

1. Commit + push D4 v1.
2. If Google OAuth/domain inputs are ready: D2 Google OIDC + Directory sync.
3. If Google inputs are not ready: D5 reminders/escalation on assignment due
   dates.
4. Run full release gate again before deploying D4.

## Unresolved Questions

- Google Workspace domain(s) for OIDC.
- Whether manager data is available in Google Directory.
- Exact reminder/escalation cadence for D5.
