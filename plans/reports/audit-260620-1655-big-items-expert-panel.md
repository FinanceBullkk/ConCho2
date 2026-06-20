# Big-items expert panel — what to do (decision support)

Date: 2026-06-20 · Method: 11-agent workflow (5 deep-dives + 5 adversarial reviews
+ 1 synthesis), read-only, code-verified. Respects locked ADRs.

## TL;DR
- **#1 finding (act on this): `classBinding` is a real, live SECURITY hole.** When a
  class has empty `teacherIds`, the policy is PERMISSIVE → a Teacher reaches ANY
  class's evaluation/attendance/grading. **0 of 4 active classes are bound today.**
  Fix is the flagship, split into 2 PRs (PR1 zero-risk).
- **Postgres migration: HOLD** — gate criteria not clearly met, effort under-stated
  (XL ~2–2.5mo, 37 mongoose sites + 56 aggregation call-sites), bus-factor-1 = the
  real blocker. Try a Mongo-native reporting fix first; resume the paused Phase-0
  hygiene meanwhile.
- **Enrollment close-path merge: do NOT big-bang** — 6 paths have genuinely
  different side-effect semantics; a uniform spine would change behavior on 4/6
  (forbidden by no-big-bang ADR). A small bounded slice is possible after an owner
  decision; ship the standalone bug fixes now regardless.
- **authz roleGuard→capability finish: DEFER** — ~90% done; the remaining ~9 route
  files are non-mechanical landmines (silent Coordinator privilege-escalation).
  Current roleGuard is CORRECT. Convergence will delete the trio anyway.
- **Evaluation→Assessment: STOP, do-not-do** — the painful duplication is already
  gone (unified read + grading queue shipped); two write-paths are the CORRECT
  domain model per stable specs, not debt.

## ⚠️ Post-panel code verification (2026-06-20) — 2 corrections + 1 shipped
Before acting on the do-now list, the recommendations were checked against code:
- **Item 1 create-guard is NOT viable as stated.** The legacy class-create path
  (`controllers/class/class-mutations.js`) does not accept `teacherIds` at all —
  classes are created, THEN teachers assigned ("create-then-assign"). Requiring
  teachers at create would break the workflow. ⇒ classBinding is **fully
  owner-gated**: backfill existing classes (ops: `migrate-teacherIds.js` vs prod)
  → then the fail-closed flip (PR2). There is no safe do-now *code* slice here.
- **Item 3 "missing audit" is wrong.** The cohort-withdraw controller
  (`domains/learning/enrollment/controller.js:67-82`) DOES record audit. Only the
  analytics-cache invalidation is absent — and the cache TTL is 30s, so staleness
  is ≤30s. Marginal ⇒ **skipped (YAGNI)**, not a bug worth touching a working path.
- **Item 2 SHIPPED.** Coordinator→403 regression suite added
  (`tests/integration/coordinatorAuthzRegression.test.js`, 9 cases, full server
  suite 1175 green) — pins that Coordinator cannot manage enrollments/classes, the
  escalation guard the panel flagged.

## Priority sequence (8)
| # | Item | Verdict |
|---|---|---|
| 1 | **classbinding PR1** — create-guard on BOTH create paths (`class-mutations.js:63` + `domains/learning/use-cases.js:197`) + run `diagnose-class-teacher-binding.js` + `migrate-teacherIds.js` backfill | **DO NOW** (zero lockout risk) |
| 2 | **authz regression tests** — Coordinator→403 on `/api/enrollments` + `/api/classes` write (mirror `officeRoutes.test.js:159`) | **DO NOW** (sub-hour insurance) |
| 3 | **convergence bug fix** — cohort-withdraw missing `invalidateAnalyticsCache` + missing-audit on an admin close path | **DO NOW** (pre-existing bugs) |
| 4 | **classbinding PR2** — fail-closed flip (`classBinding.js:29` + `teacher-class-scope.js` + `sessionInstructors.js` chain; rewrite ~6–8 assertions in 2 suites) | **GATED** (after PR1 diagnostic = 0 unbound AND English convergence settles) |
| 5 | **convergence slice** — `closeEnrollment` helper for ONLY the 2 identical admin paths + parity matrix; add `ENROLLMENT_CLOSED` only with a real subscriber | **GATED** (owner accepts 4/6 paths stay divergent) |
| 6 | **postgres** — resume Phase-0 hygiene (paused) + try Mongo-native PERF-003 fix first | do-after Phase-0 |
| 7 | **postgres** — gated read-only prototype | **GATED** (owner window + cutover owner) |
| 8 | **eval-assessment** — STOP | **DO-NOT-DO** |

## Decisions needed from owner
1. **Convergence (item 5):** accept that team-delete / cohort-delete / withdraw /
   transfer close-paths stay context-specific BY DESIGN (their side-effects truly
   differ)? Without this the slice has no clean stopping point.
2. **Postgres (item 7):** (a) confirm a Mongo-native PERF-003 fix did NOT resolve
   the reporting pain; (b) pre-assign the cutover-comms-to-1000-users owner; (c)
   commit a dedicated window. Bus-factor-1 mid-port abandonment is the catastrophic
   risk.
3. **classbinding PR2 (item 4):** operational — needs PR1 diagnostic = 0 unbound +
   a quiet window after EL001/EL002 convergence settles.

## Biggest risks if mishandled
- **Teacher lockout** — flipping classbinding fail-closed before backfill (0/4 bound) → every Teacher locked out of all active classes. Strict PR1→diagnostic→PR2 order is mandatory.
- **Silent privilege escalation** — a naive authz swap grants Coordinator booking/enrollment/cohort-manage. The booking trio's `session.book` exists but is role-mismatched (a 3rd trap). Defer + pin tests.
- **Behavior-change-as-refactor** — a uniform close-path spine starts pulling rosters deliberately preserved as history; also the transfer path's `req.ip`/`req.get` audit IP-shim (`enrollment-transfer.js:234`) must be preserved.
- **Compliance/integrity data loss (postgres)** — soft-delete `pre('aggregate')` hooks (6 models) have no SQL equivalent (silent leak); 5 TTL indexes incl. AuditLog 730d (compliance); partial-unique predicates (double-booking guard). Lead with integrity, not reporting.
- **Wasted effort on eval-assessment** — firm stop, not a backlog item.

## Corrections the panel made to first-pass analyses (handoff-critical)
- Parity-test anchor is `p2-regression.test.js` + `learningEnrollmentRoutes.test.js`, NOT `enrollmentRoutes.test.js`.
- Admin drop omits the empty-schedule sweep + room-release the team path does → can leave ghost empty live sessions holding a room lock (freeze in parity matrix, do not "accidentally fix").
- classbinding touches a THIRD policy module (`sessionInstructors.js`) + a 2nd permissive test (`unit/policy.test.js:32`).

## Unresolved questions
- Owner go/no-go on decisions 1–3 above.
- Is the live "reporting pain" reproducible enough to try the Mongo-native PERF-003 fix as a gate-closer before any Postgres prototype?
