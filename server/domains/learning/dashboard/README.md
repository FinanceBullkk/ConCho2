# `domains/learning/dashboard` — operational KPI bundle (2-tier dashboard, Phase 1)

One read-only endpoint composing existing engines into the L&D operational
dashboard bundle. Plan: `plans/260610-0830-ltms-2tier-dashboard/`.

## Endpoint (mounted under `/api/learning`)
| Method | Path | Capability | Returns |
|--------|------|-----------|---------|
| GET | `/dashboard/operational?window=30\|60\|90` | `report.read` | JSON bundle below |

`report.read` is held by Admin + Teacher (not Participant). Teacher gets
class-scoped data via `teacher-class-scope` (same helper the completion rollup
uses); Admin gets org-wide.

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

## Scope + honesty notes
- `assignments` and `coverage` are org-wide for Teachers too — counts/top-N only,
  consistent with the exposure Teachers already have via the Assignments tab.
- `assessments.passRate` is attempt-level (a learner with 3 attempts counts 3×).
- Certificate buckets use day-level boundaries; the per-row truth stays
  `reports/compliance-certificate-state.deriveCertificateState`.

## Iterate (deferred)
Executive tier + `LND_COST_CONFIG` (Phase 3), per-Office breakdowns (after the
Office model ships), trend buckets, dashboard exports.
