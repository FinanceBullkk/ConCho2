---
phase: 2
title: Backend compliance report API
status: completed
priority: P1
effort: 1.5d
dependencies:
  - 1
---

# Phase 2: Backend compliance report API

## Overview

Implement the read-only compliance report and xlsx export. This phase is useful even before certificate expiry lands: assignment status plus certificate issued, missing, or revoked by org and manager.

## Requirements

- Functional: add `GET /api/learning/reports/compliance` behind `report.read` plus Admin/L&D resource policy.
- Functional: add `GET /api/learning/reports/compliance/export` behind `report.read` plus Admin/L&D resource policy and export limiter.
- Functional: include active D4 assignments, expanded learner rows, derived assignment status, certificate state, department, and manager.
- Functional: support filters from Phase 1; invalid ids return through existing validation style.
- Functional: audit export action only.
- Non-functional: no mutations in report builder.
- Non-functional: protect Excel formula injection with `safeCell`.
- Non-functional: keep workload bounded for ~1000 employees; avoid obvious N+1 queries.

## Architecture

Extend `server/domains/learning/reports/` rather than adding legacy controllers.

Related files:

- Modify: `server/domains/learning/reports/schemas.js`
- Modify: `server/domains/learning/reports/controller.js`
- Modify: `server/domains/learning/reports/use-cases.js`
- Modify: `server/domains/learning/reports/repository.js`
- Modify: `server/domains/learning/reports/export.js`
- Modify: `server/domains/learning/routes.js`
- Create: `server/tests/integration/learningComplianceReportsRoutes.test.js`
- Create: `server/tests/unit/learning-compliance-export-formula.test.js`

Data flow:

1. Load assignments using existing assignment repository shape.
2. Expand assignment learners using `resolveAssignmentStatuses`.
3. Batch load users with manager and department references where possible.
4. Batch load certificates by learner and program/cohort where available.
5. Build rows and rollups.
6. Export rows to xlsx with a bounded row count.

## Implementation Steps

1. Add validation schema for compliance report query.
2. Add use-case `buildComplianceReport(query, actor)`.
3. Add repository helpers for active assignments, certificates, managers, departments.
4. Define certificate state helper:
   - `missing` when no relevant certificate exists for learner and target program;
   - `issued` when issued and no expiry applies;
   - `revoked` when latest relevant certificate is revoked;
   - `expiring` / `expired` once Phase 3 fields exist.
5. Add controller methods and route wiring:
   - `/reports/compliance`
   - `/reports/compliance/export`
6. Add export builder with formula guard for all user-controlled strings.
7. Test happy path, permission denial, filter behavior, and export safety.

## Success Criteria

- [x] Admin can fetch compliance report with assignment status and certificate state.
- [x] Teacher and Participant are denied the org-wide compliance report in v1.1.
- [x] Export returns xlsx with `X-TMS-Record-Count`.
- [x] Export action is audited.
- [x] Formula guard covers learner, department, manager, assignment title, program/path name, and certificate number.
- [x] Report builder has no mutation side effects.

## Risk Assessment

- Risk: D4 resolver currently loops over users and programs.
  Mitigation: acceptable for v1.1 scale; document future aggregation if HR grows beyond ~1000 employees.
- Risk: path assignment certificate state is ambiguous.
  Mitigation: path compliant only when all path programs are complete; summary state is `missing` if any required certificate is missing.
