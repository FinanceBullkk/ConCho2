# Session 08 Report - Reports + Export

**Date:** 2026-06-05
**Verdict:** Risk → fixed (1 P1 export formula-injection regression fixed in-session; 1 P2 promoted → QB-009)
**Action:** Fix now (done) — applied SEC-004 `safeCell` to learning completion export + regression test
**Status:** completed

## Goal

Are reports and exports correct, scoped, and safe for HR use?

## Scope

In: completion reports, rollups, HR Excel export, formula-injection safety,
soft-deleted exclusion, row correctness.
Out: new report types, compliance recertification.

## Evidence

- Read: `domains/learning/reports/{use-cases,export,controller,repository,
  schemas}.js`, `services/exportService.js` (safeCell + SEC-004 usage),
  `helpers/excel-formula-guard.js` (new), `learning/routes.js` (report.read
  gating), `policy/capabilities.js`.
- Tests run green (clean isolated runs): new unit `learning-reports-export-
  formula` (2/2), legacy `exportFormulaInjection` (14/14, proves refactor),
  `learningReportsRoutes` (7/7). **23/23.**

## Scenario Verdicts

| Scenario | Verdict | Evidence |
|---|---|---|
| Report totals match source records | OK | `buildCompletionReport` reuses `evaluateCompletion` per learner; `summary` derived from rows. Tested: 2 learners, 1 complete → rate 50%, per-row attendance/complete correct. Rollup department sum == summary learners. |
| Teacher report access scoped | OK (route) | `/reports/completion*` require `report.read` (Admin+Teacher); Participant 403, Teacher 200 (tested). **Caveat:** Teacher `report.read` is org-wide (no cohort binding) — same root as **QB-007**; not a new item. |
| Soft-deleted excluded where required | OK (cohorts/certs/enrollments); **gap (users)** | `listActiveCohorts` filters `isDeleted:$ne true`; `buildCompletionReport` 404s a deleted cohort; certs `isDeleted:false`; enrollments use `ACTIVE_ENROLLMENT_STATUSES`. **But `findUsers` has no `isDeleted` filter** → a soft-deleted (offboarded) learner still on a roster appears as a report row and counts in the denominator → QB-009 (P2). |
| Formula-leading strings escaped in Excel | **Broken → fixed (P1)** | New `reports/export.js` wrote `empCode/name/department/cert#` **raw** via `addRow`, bypassing the `safeCell` guard the legacy exports use (SEC-004). A formula-leading stored/imported name (`=HYPERLINK(...)`) auto-executes when HR opens the `.xlsx`. **Fixed** (see below). |
| Large exports respect safeguards | OK (acceptable) | Completion export is per-cohort (bounded ≪ the 100k-row legacy attendance case that needed PERF-001's 413 cap); `writeBuffer` in-memory is fine. Rollup builds all active-cohort reports in memory (JSON, not a file) — acceptable at ~1000-employee scale; noted, not a finding. |

## P1 fixed — export formula-injection regression (SEC-004)

**Root:** the learning completion Excel export ([reports/export.js]) is a second
export path that never adopted the `safeCell()` guard the legacy attendance/
evaluation exports were hardened with (SEC-004). User-controlled strings
(`name`, `department`, `empCode`; `name`/`department` are Admin-set or
**bulk-imported** from external HR data) landed in cells unescaped. Reachable via
`GET /api/learning/reports/completion/export` (gated `report.read` = Admin/
Teacher). Violates the golden rule "security layers are load-bearing — never
bypass them."

**Fix (minimal, DRY):**
1. **New** `server/helpers/excel-formula-guard.js` — `safeCell` extracted as the
   single source of truth (prepends `'` to values starting `= + - @ \t \r`).
2. `services/exportService.js` — imports `safeCell` from the helper (local copy
   removed; still re-exported, so the existing SEC-004 test is unaffected).
3. `domains/learning/reports/export.js` — wraps `empCode/name/department` and the
   cert number in `safeCell`. (Banner row is prefixed `"Cohort: …"` → never
   formula-leading; numbers/Yes/No are non-strings → untouched.)
4. **New** `tests/unit/learning-reports-export-formula.test.js` — loads the
   generated workbook, asserts payload cells start with `'` and no cell begins
   with a raw trigger; benign strings pass through. Unit-level because
   `buildCompletionWorkbookBuffer` is pure (no DB) → fast, deterministic.

## Finding promoted

- **QB-009 (P2):** completion report/rollup includes **soft-deleted users**.
  `reports/repository.findUsers` resolves roster ∪ enrollment ids with no
  `isDeleted` filter, so an offboarded learner still on a session roster appears
  as a row and inflates the denominator (skews completion rate). No data leak
  (Admin/Teacher-only). Intent ambiguous (compliance may *want* historical
  learners). Promote for a product decision: exclude soft-deleted from the
  denominator, or show them flagged. Next step: filter or flag in `findUsers`
  / row builder.

## Verification

- `learning-reports-export-formula` (new) — 2/2.
- `exportFormulaInjection` (legacy SEC-004) — 14/14 (refactor intact: `safeCell`
  still imported + re-exported, no dangling `FORMULA_TRIGGER`).
- `learningReportsRoutes` — 7/7 (totals, scoping, export route, 404).
- `node -e require(...)` loads all three touched modules.
- Note: running multiple export suites in one `--runInBand` jest invocation
  deadlocks mongodb-memory-server (suites mix `mongoose.disconnect()` with the
  shared `getApp()/teardown()`); ran isolated. Harness flake, not product — but
  worth a setup cleanup later.

## Unresolved Questions

- None.
