# `domains/learning/reports` — completion reporting + export (Wave B, Phase 5)

Cohort-wide completion reporting built on top of the completion engine. Closes
the Phase 5 "Reports by program/cohort/department/learner" + "Program completion
export" gaps. Read-only.

## Endpoints (mounted under `/api/learning`)
| Method | Path | Capability | Returns |
|--------|------|-----------|---------|
| GET | `/reports/completion?cohortId=` | `report.read` | JSON: cohort meta + summary + per-learner rows |
| GET | `/reports/completion/rollup` | `report.read` | JSON: program + department aggregates |
| GET | `/reports/completion/export?cohortId=` | `report.read` | `.xlsx` attachment (same data) |

`report.read` is held by Admin + Teacher (not Participant — cohort-wide views).

## How it works
1. Enumerate the cohort's learners = session roster (`Schedule.enrolledUsers`) ∪
   non-dropped enrollments (`Enrollment`), distinct.
2. For each learner, reuse `completion/use-cases.evaluateCompletion` (single
   source of truth for the policy) and attach certificate status.
3. Roll up a summary (complete/total, completion rate, certificates issued).
4. Export builds an `.xlsx` buffer via `exceljs` (`export.js`).

## Layout
```
controller.js  → getCompletionReport (JSON) · exportCompletionReport (xlsx + audit)
use-cases.js   → buildCompletionReport (enumerate + evaluate + summarise)
repository.js  → cohort learners, users, certificates
export.js      → exceljs workbook → Buffer
schemas.js     → zod (cohortId)
```

## Iterate (deferred)
Learner cross-program history, date ranges, rollup export, streaming for very
large cohorts (current path buffers — fine per-cohort), dashboard surfacing. The
per-learner `evaluateCompletion` loop is N queries per learner; batch if cohorts
grow large.
