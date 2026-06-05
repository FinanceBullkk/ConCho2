---
phase: 1
title: Discovery and report contract
status: in-progress
priority: P1
effort: 0.5d
dependencies: []
---

# Phase 1: Discovery and report contract

## Overview

Lock the D6 v1.1 report contract before code. The goal is one monthly compliance report shape that combines D4 assignment status, D3 org scope, and certificate state without inventing a BI platform.

## Requirements

- Functional: define filters, summary buckets, row columns, export naming, and UI placement.
- Functional: map certificate validity states: `issued`, `missing`, `revoked`, `expiring`, `expired`.
- Functional: define recertification meaning for v1.1: report + reminders first; auto-created follow-up assignments only if explicitly approved later.
- Non-functional: report path must be safe for ~1000 employees and avoid unbounded workbook memory.
- Non-functional: preserve authz (`report.read`) and teacher class/resource scope where applicable.

## Architecture

Use a new report contract beside the existing completion report:

- `GET /api/learning/reports/compliance`
- `GET /api/learning/reports/compliance/export`

Rows are per learner per active assignment target. Summary is grouped by assignment status, certificate state, program, department, and manager. The report should reuse `assignment/status-resolver.js`, `completion/prerequisites.hasCompletedProgram`, existing certificate records, and D3 org fields.

## D6 v1.1 Report Contract

This is the proposed contract for Phase 2 tests before implementation code.

### Endpoints

- `GET /api/learning/reports/compliance`
  - JSON report for the UI.
  - Auth gate: `report.read`.
  - Resource policy for v1.1: Admin/L&D full scope. Teacher org-wide compliance is out until a safe cohort or program scope is defined; do not leak department-wide data to Teachers.
- `GET /api/learning/reports/compliance/export`
  - Same filters and rows as JSON.
  - XLSX response, audit export event, and export rate limit if an existing limiter fits.
  - Filename: `compliance-report-YYYY-MM-DD.xlsx`.
  - Header: `X-TMS-Record-Count: <row count>`.

### Query Filters

All filters are optional unless noted.

| Filter | Type | Meaning |
|--------|------|---------|
| `assignmentId` | Mongo ObjectId | Limit to one active assignment. |
| `programId` | Mongo ObjectId | Limit direct program assignments and path assignments containing the program. |
| `departmentId` | Mongo ObjectId | Limit learners by D3 `User.departmentId`. |
| `managerId` | Mongo ObjectId | Limit learners by D3 `User.managerId`. |
| `status` | enum | Assignment status: `not_started`, `in_progress`, `complete`, `overdue`. |
| `certificateState` | enum | `issued`, `missing`, `revoked`, `expiring`, `expired`. |
| `dueFrom` | ISO date | Inclusive assignment due date start. |
| `dueTo` | ISO date | Inclusive assignment due date end. |

Default scope:

- Include active D4 assignments only.
- Include assignable active learners only, matching D4 status resolver behavior.
- Exclude soft-deleted users, departments, assignments, certificates.
- Do not depend on D2 Directory sync. Manual D3 org fields are source of truth.

### Response Shape

```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-06-05T00:00:00.000Z",
    "filters": {
      "assignmentId": null,
      "programId": null,
      "departmentId": null,
      "managerId": null,
      "status": null,
      "certificateState": null,
      "dueFrom": null,
      "dueTo": null
    },
    "summary": {
      "rows": 0,
      "learners": 0,
      "assignments": 0,
      "notStarted": 0,
      "inProgress": 0,
      "complete": 0,
      "overdue": 0,
      "issued": 0,
      "missing": 0,
      "revoked": 0,
      "expiring": 0,
      "expired": 0
    },
    "rollups": {
      "programs": [],
      "departments": [],
      "managers": []
    },
    "rows": [
      {
        "learner": {
          "id": "userId",
          "empCode": "000123",
          "name": "Learner Name",
          "email": "learner@example.com"
        },
        "org": {
          "departmentId": "departmentId",
          "departmentName": "Academy",
          "managerId": "managerId",
          "managerName": "Manager Name"
        },
        "assignment": {
          "id": "assignmentId",
          "title": "Annual safety training",
          "targetType": "program",
          "targetId": "programId",
          "targetName": "Workplace Safety",
          "dueDate": "2026-06-30T00:00:00.000Z",
          "status": "overdue"
        },
        "completion": {
          "complete": false,
          "evidence": "none"
        },
        "certificate": {
          "id": null,
          "number": "",
          "status": null,
          "issuedAt": null,
          "validUntil": null,
          "state": "missing"
        }
      }
    ]
  }
}
```

Rollup rows use the same compact shape:

```json
{
  "key": "departmentId-or-unassigned",
  "label": "Department name",
  "rows": 0,
  "learners": 0,
  "complete": 0,
  "overdue": 0,
  "issued": 0,
  "missing": 0,
  "expiring": 0,
  "expired": 0,
  "revoked": 0
}
```

### Certificate State Rules

- `revoked`: certificate status is `Revoked`; wins over expiry.
- `missing`: no relevant certificate for learner and target program.
- `expired`: certificate is `Issued` and `validUntil` is before end of today.
- `expiring`: certificate is `Issued` and `validUntil` is within the next 30 days.
- `issued`: certificate is `Issued` and either no `validUntil` exists or expiry is later than the 30-day window.

Certificate matching:

- Program assignment: match learner certificate by `programId`.
- Path assignment: find the weakest program certificate state across the path programs. The row is `complete` only when every path program is complete.
- If multiple non-deleted certificates exist for learner + program, prefer `Issued` over `Revoked`, then latest `issuedAt`.

### Export Contract

- Columns: Emp code, learner name, email, department, manager, assignment title, target type, target name, due date, assignment status, completion, certificate number, certificate status, issued at, valid until, certificate state.
- Use existing report export `safeCell` behavior for every user/admin-provided string.
- Cap rows with `COMPLIANCE_EXPORT_MAX_ROWS`, default `5000`.
- If over cap, return `413` JSON for the export endpoint instead of creating a partial workbook.
- Streaming writer is deferred unless this cap is proven insufficient for the internal 1000-employee scope.

### UI Contract

- Location: existing Learning `Reports` area.
- Use a compact tab or segmented control inside Reports: `Completion` and `Compliance`.
- Filters shown in one screen: assignment, program, department, manager, status, certificate state, due date range.
- Default load: no automatic full-org query on first tab open. Show filters and load report after user clicks refresh.
- Table is operational, not dashboard-style: rows first, summary tiles and rollups above or beside it.

### Out Of Scope For v1.1

- Saved filter presets.
- Broad BI charts.
- In-app notification center.
- Auto-create next-cycle assignments.
- SCORM/xAPI, video hosting, mobile app, billing, multi-tenant behavior.
- D2 Google Directory sync dependency.

## Decisions Needed Before Phase 2

- Confirm v1.1 compliance report is Admin/L&D-only in UI, even though the existing coarse capability is `report.read`.
- Confirm certificate validity source: add `LearningProgram.certificateValidityDays` with null as no expiry.
- Confirm recertification action in v1.1: report + export only; reminder email can reuse D5 later, no auto-created assignment.
- Confirm HR's monthly Excel columns can start with the export contract above.

## Related Code Files

- Read: `docs/lms-roadmap.md`
- Read: `docs/development-roadmap.md`
- Read: `server/domains/learning/reports/*`
- Read: `server/domains/learning/assignment/*`
- Read: `server/models/Certificate.js`
- Read: `server/domains/org/*`
- Create/modify in later phases only after contract is agreed.

## Implementation Steps

1. Write the target JSON contract in a short comment block or test fixture before implementation.
2. Choose filters:
   - `assignmentId`
   - `programId`
   - `departmentId`
   - `managerId`
   - `status`
   - `certificateState`
   - `dueFrom` / `dueTo`
3. Choose row fields:
   - learner identity: empCode, name, email
   - org: department, manager
   - assignment: title, target type, target name, due date, status
   - completion: complete boolean, completion evidence source
   - certificate: number, status, issuedAt, validUntil, state
4. Choose summary fields:
   - total, complete, overdue, notStarted, inProgress
   - certified, missingCertificate, expiring, expired, revoked
   - rollups by program, department, manager.
5. Confirm xlsx max row strategy: row cap env or streaming writer. For 1000 employees, a cap is enough; keep streaming deferred unless tests show pressure.

## Success Criteria

- [ ] D6 v1.1 contract is explicit enough to write backend tests first.
- [ ] Out-of-scope items are listed so implementation does not become feature factory.
- [ ] Report filters match what UI can realistically expose in one screen.
- [ ] No dependency on D2 Directory sync for codeable path.

## Risk Assessment

- Risk: report contract grows into a full analytics product.
  Mitigation: keep v1.1 as operational compliance table + export.
- Risk: manager/department data incomplete before D2.
  Mitigation: show `Unassigned` / `No manager`; do not block D6.
- Risk: certificate expiry policy is unclear.
  Mitigation: add program-level default validity plus certificate override; default null means no expiry.
