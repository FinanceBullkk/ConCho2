# Session 01 Report — Assignment + Due Dates v1

**Date:** 2026-06-05
**Status:** complete

## Done

- Added `Assignment` model with Program/Path target, user/department targets,
  due date, soft-delete, and indexes.
- Added `server/domains/learning/assignment/`:
  - Admin create/archive.
  - Admin/Teacher read.
  - Department expansion to assignable users.
  - Derived learner status: `not_started`, `in_progress`, `complete`, `overdue`.
  - Due date stays open through the whole due date.
- Added capabilities:
  - `assignment.read`: Admin, Teacher.
  - `assignment.manage`: Admin.
- Added Learning → **Assignments** tab:
  - summary chips for complete/in-progress/overdue/not-started.
  - Admin-only create/archive.
  - create modal for Program/Path + departments + searchable users.
- Updated docs:
  - `docs/development-roadmap.md`
  - `docs/lms-roadmap.md`
  - `docs/ltms-gap-analysis.md`
  - D4 plan status.

## Verification

- Server focused: 2 suites, 17 tests passed.
- Client focused: 3 suites, 28 tests passed.
- Client lint: pass, 0 errors / 81 existing warnings.
- New frontend files lint: pass with `--max-warnings 0`.
- Client build: pass.

## Deferred

- Reminder emails and manager escalation: Wave D5.
- Assignment exports/report joins: Wave D6 report depth.
- Certificate expiry/recertification: Wave D6.
- Cohort-specific assignment: out of v1.

## Unresolved Questions

- None for v1.
