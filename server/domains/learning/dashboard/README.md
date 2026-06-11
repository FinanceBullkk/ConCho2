# `domains/learning/dashboard` — 2-tier dashboard bundles (Phases 1 + 3)

Read-only KPI endpoints composing existing engines, plus the L&D cost config.
Plan: `plans/260610-0830-ltms-2tier-dashboard/`.

## Endpoints (mounted under `/api/learning`)
| Method | Path | Capability | Returns |
|--------|------|-----------|---------|
| GET | `/dashboard/operational?window=30\|60\|90` | `report.read` | operational bundle below |
| GET | `/dashboard/executive?window=30\|60\|90` | `report.read` + **Admin-only inside** | executive bundle below |
| GET | `/dashboard/cost-config` | `report.read` + **Admin-only inside** | `LND_COST_CONFIG` value or null |
| PUT | `/dashboard/cost-config` | `report.read` + **Admin-only inside** | upserted value (audited `Setting` diff) |

`report.read` is held by Admin + Teacher (not Participant). The executive tier
mirrors the compliance report's defence-in-depth gate: coarse capability at the
route, `assertAdmin` inside the use-case. Operational: Teacher gets class-scoped
data via `teacher-class-scope` (same helper the completion rollup uses); Admin
gets org-wide.

## Layout
```
controller.js            → 4 handlers (envelope + cost-config audit)
use-cases.js             → operational bundle (compose + scope)
executive-use-cases.js   → executive bundle (Admin gate, financials, Kirkpatrick)
repository.js            → operational aggregations
executive-repository.js  → exec aggregations + LND_COST_CONFIG over Setting
compose-fail-soft.js     → shared per-metric fail-soft composer
schemas.js               → zod (window query, costConfigBody)
```

## DRY composition (what is reused, not rebuilt)
- **completion** → `reports/completion-rollup-use-case.buildCompletionRollup(actor)`
- **assignments.overdue** → `assignment/status-resolver` over `listComplianceAssignments({})`
- **certificates expiry** → D6 `validUntil` fields (+ `learnerName`/`programName` snapshots)
- **attendance "present"** → completion engine's `ATTENDED_STATUSES` (P|L)
Only the new aggregations (session split, feedback averages, coverage, expiry
buckets) live in this module's `repository.js`.

## Response contract (Phase 2 frontend consumes this)
```jsonc
{
  "generatedAt": "ISO",
  "windowDays": 30,                  // coverage window (query `window`, default 30)
  "errors": [{ "metric": "coverage", "message": "..." }],  // fail-soft: failed metrics land here
  "completion": {                    // null on failure (same for every block)
    "summary": { "cohorts": 0, "learners": 0, "complete": 0, "completionRate": 0, "certificatesIssued": 0 },
    "programs": [ { "key": "", "label": "", "cohorts": 0, "learners": 0, "complete": 0, "completionRate": 0, "certificatesIssued": 0 } ],
    "departments": [ /* same row shape */ ]
  },
  "attendance": { "totalRecords": 0, "presentRecords": 0, "rate": 0 },          // rate = % P|L
  "sessions": { "upcoming": 0, "next7Days": 0, "past": 0 },
  "assignments": {                   // ORG-WIDE for all callers (matches D4 Teacher assignment.read)
    "activeAssignments": 0,
    "overdueLearners": 0,
    "topOverdue": [ { "assignmentId": "", "assignmentTitle": "", "dueDate": "ISO",
                      "learner": { "id": "", "empCode": "", "name": "", "department": "" } } ]  // ≤10, soonest due first
  },
  "certificates": {                  // day-level buckets over Issued certs with validUntil
    "expired": 0, "expiring30": 0, "expiring60": 0,
    "topExpiring": [ { "certificateNumber": "", "learnerName": "", "programName": "", "validUntil": "ISO" } ]  // ≤10
  },
  "assessments": { "totalAttempts": 0, "passedAttempts": 0, "passRate": 0 },    // ATTEMPT-level, not per-learner
  "feedback": {
    "count": 0, "averageRating": null,                                          // null when no feedback yet
    "byProgram": [ { "programId": "", "programName": "", "count": 0, "averageRating": 0 } ]  // top 10 by volume
  },
  "coverage": {                      // ORG-WIDE by design (counts only, no resource access)
    "windowDays": 30, "activeParticipants": 0, "engagedParticipants": 0, "coveragePercent": 0
  }
}
```

## Executive bundle (Phase 3 — Admin-only)
```jsonc
{
  "generatedAt": "ISO", "windowDays": 30, "errors": [],
  "coverage": { "windowDays": 30, "activeParticipants": 0, "engagedParticipants": 0, "coveragePercent": 0,
                "departments": [ { "department": "", "active": 0, "engaged": 0, "percent": 0 } ] },
  "trend": { "months": [ { "month": "2026-01", "enrollments": 0, "certificatesIssued": 0 } ] },  // 6 months, oldest first
  "kirkpatrick": {
    "l1Reaction": { "measured": true, "averageRating": null, "submissions": 0 },
    "l2Learning": { "measured": true, "passRate": 0, "attempts": 0 },
    "l3Behavior": { "measured": false, "reason": "..." },   // honest: not yet measured
    "l4Results":  { "measured": false, "reason": "..." },
    "l5Roi":      { "measured": false, "reason": "..." }
  },
  "mobility": { "activePaths": 0, "certificateBasedPathCompletions": 0, "basis": "certificates" },
  "certificates": { "totalIssued": 0, "valid": 0, "nonExpiring": 0, "expiring30": 0, "expired": 0, "revoked": 0 },
  "financials": { "configured": false }                      // OR, when LND_COST_CONFIG is set:
  // { "configured": true, "currency": "VND", "annualBudgetMinor": 0, "activeEmployees": 0,
  //   "completionsTrailing12Months": 0, "costPerEmployeeMinor": 0, "costPerCompletionMinor": 0 }
}
```

## Scope + honesty notes
- `assignments` and `coverage` are org-wide for Teachers too — counts/top-N only,
  consistent with the exposure Teachers already have via the Assignments tab.
- `assessments.passRate` is attempt-level (a learner with 3 attempts counts 3×).
- Certificate buckets use day-level boundaries; the per-row truth stays
  `reports/compliance-certificate-state.deriveCertificateState`.
- **Trend series are recorded events** (enrollments created, certificates
  issued) — "completion" itself is derived and has no stored timestamp.
- **Mobility is a certificate-based proxy**: a learner completes a path when
  they hold Issued certificates for every program in it. Date-expired-but-Issued
  certificates still count (D6: expiry is a reporting signal, not a completion
  change). Paths whose programs issue no certificates undercount.
- **Financial KPIs are never fabricated**: absent `LND_COST_CONFIG` →
  `financials: { configured: false }` with no numeric fields. Amounts are
  integer minor currency units. `costPerEmployee` divides by ALL active users
  (the budget covers the whole org); `costPerCompletion` divides by certificates
  issued in the trailing 12 months.

## Iterate (deferred)
Executive frontend (Phase 4), per-Office breakdowns (after the Office model
ships), dashboard exports, L3 behavior survey.
