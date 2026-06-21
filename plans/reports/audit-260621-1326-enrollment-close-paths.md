# Enrollment close-path audit — "keep each door, ensure no bug"

Date: 2026-06-21 · Scope: the 6 paths that move an Enrollment out of `Active`.
Owner decision (2026-06-21): do NOT merge the close-paths (#5 deferred); instead
verify each is bug-free. This report records that verification.

## The 6 close-paths reviewed

| # | Path | Route / fn | Audit | Tx | Schedule roster | Verdict |
|---|---|---|---|---|---|---|
| 1 | Team soft-delete | `groups/lifecycle.js:deleteTeam` | ✅ | ✅ | preserved (history) | sound |
| 2 | Cohort soft-delete | `learning/use-cases.js:deleteCohort` (+ controller audit) | ✅ | ✅ | blocked while schedules ref it | sound |
| 3 | Cohort withdraw | `learning/enrollment/use-cases.js:withdraw` | ✅ (controller) | n/a (single write) | n/a — direct-cohort learners link by `classId`, not in `enrolledUsers` | sound |
| 4 | Transfer | `controllers/enrollment/enrollment-transfer.js` | ✅ | ✅ (both teams in 1 tx) | synced both sides; IP-shim preserved in bulk | sound |
| 5 | Admin status override — single | `enrollment-status.js:updateEnrollment` (PUT /api/enrollments/:id) | ❌ **was MISSING** → **FIXED** | ✅ | pulls future on Dropped | **bug fixed** |
| 6 | Admin status override — bulk | `enrollment-status.js:bulkUpdateEnrollmentStatus` (PATCH /bulk-status) | ✅ | ✅ | pulls future on Dropped | sound |

## The one real bug (fixed)
**Path 5 — `PUT /api/enrollments/:id` left no audit trail.** An Admin manually
flipping one enrollment's status (Dropped/Completed/On-hold) or note recorded
NO `AuditLog` entry, while its bulk twin (path 6) did. Violates the golden rule
"audit every mutation."

- **Fix:** snapshot `before` (lean) → after commit `auditService.record({ action:'updated', entity:'Enrollment', entityId, diff: auditService.diff(before, after) })`. Behaviour of the door is unchanged (still updates status + pulls future rosters); only the missing audit trail is added.
- **Regression test:** `enrollmentRoutes.test.js` → "records an audit entry for the admin status override (parity with bulk path)". Suite 26/26 green.

## By-design divergences left in place (NOT bugs — panel froze these)
- **Admin drop (paths 5/6) does NOT sweep emptied sessions / release rooms** the
  way team-delete does. Deliberate (panel `audit-260620-1655`): folding this into
  a uniform spine would change behaviour. Frozen.
- **Cohort withdraw (3) does NOT pull from `Schedule.enrolledUsers`.** Correct:
  direct-cohort learners are associated with sessions via the cohort `classId`
  (`learning/session/use-cases.js` list filter), never individually inserted into
  `enrolledUsers` — only team-booking + attendance-marking write that array. So
  there is nothing to pull.

## Conclusion
6 paths intentionally diverge (their side-effects genuinely differ); that
divergence is correct, not debt. One missing-audit bug found and fixed with a
regression test. No further close-path work needed.

## Unresolved questions
- None.
