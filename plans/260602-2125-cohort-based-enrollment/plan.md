# Plan: M2 — Cohort-based Enrollment (`/api/learning/enrollments`)

**Status:** awaiting approval · **Milestone:** M2 (Wave A) · **Unlocks:** M1 `self_enroll`/`nomination`

## Context

Enrollment today is **team-based**: `Enrollment.teamId` is **required** ([models/Enrollment.js:21-25](../../server/models/Enrollment.js#L21)); records are created only when a member is added to a Team ([teamController.js:145](../../server/controllers/teamController.js#L145)); `/api/enrollments` is Admin-only, team/transfer-centric (544-line controller, no service). M2 needs learners to enroll **directly into a cohort (Class)** — for multi-program L&D and to unlock self-enroll.

**Goal:** add a cohort-based enrollment path **without breaking** the team-based flow (booking auto-enroll, transfer, reconcile all assume a team).

## Approach (recommended, after investigation)

**Additive: new domain module `domains/learning/enrollment/` + make `teamId` optional.** Cohort enrollments are `Enrollment` docs with `classId` set and `teamId = null`. Legacy team-enrollment path stays untouched (DTO/abstraction over the same collection — matches migration ADRs; no destructive rename).

*Rejected:* extending the 544-line legacy controller in place (high ripple across booking/reconcile/transfer that all assume `teamId`).

## Critical dependency found (must handle)
Reconcile **CHECK 2** `checkOrphanedEnrollments` ([services/reconcileService.js:108-115](../../server/services/reconcileService.js#L108)) flags any Active enrollment whose `teamId` is falsy as "orphaned" → a cohort enrollment (`teamId:null`) would be **false-flagged**. Must update to treat team-less enrollments as valid cohort enrollments. CHECK 3 (team→enrollment) is unaffected. Booking (`Schedule.enrolledUsers`) is team-derived and stays as-is — cohort enrollment does **not** auto-populate sessions in this slice.

## Changes

### 1. Model — [server/models/Enrollment.js](../../server/models/Enrollment.js)
- `teamId`: required → **optional** (`default: null`).
- Keep `{userId, teamId}` active-unique but **scope it to real teams**: partial filter `{ status:'Active', teamId:{ $type:'objectId' } }` (so multiple team-less cohort enrollments don't collide on `teamId:null`).
- Add cohort active-uniqueness `{userId, classId}` (partial, Active + has classId). *Index/partial-filter operators need validation at implementation (Mongo partialFilterExpression supports `$type`/`$exists`/`$eq`); if a clean partial filter for "teamId is null" proves brittle, enforce cohort-dup prevention in the use-case instead.*

### 2. New module `server/domains/learning/enrollment/`
`routes.js · controller.js · use-cases.js · repository.js · dto.js · schemas.js · policy.js` (per domain convention). Mount under `/api/learning/enrollments` (add to [domains/learning/routes.js](../../server/domains/learning/routes.js) or sub-router).
- **use-cases:** `enrollLearner({cohortId, userId}, actor)`, `withdraw(id, actor)` (soft: status→`Dropped`, set `leftAt`), `listEnrollments({cohortId, learnerId}, actor)`.
- **repository:** Enrollment queries scoped to cohort enrollments (`teamId:null`).
- **policy:** Admin → always; **self-enroll** → actor enrolls self **iff** the cohort's program `schedulingMode === 'self_enroll'`; **nomination** → Admin/Teacher assigns (program `nomination`). Reuse `findSchedulingContextByGroup` pattern / resolve via `Class.programId`.
- **dto:** learner/cohort vocabulary.

### 3. Endpoints (all `protect`; CSRF + validate)
- `GET /api/learning/enrollments?cohortId=&learnerId=` — Admin all; learner self-scoped.
- `POST /api/learning/enrollments` `{ cohortId, userId? }` — Admin enroll anyone; self-enroll (userId defaults to self) when program allows. Audit `created`.
- `DELETE /api/learning/enrollments/:id` — withdraw (soft). Audit `withdrew`.

### 4. Reconcile fix — [services/reconcileService.js](../../server/services/reconcileService.js)
`checkOrphanedEnrollments`: skip enrollments with `teamId == null` (valid cohort enrollment). Optional new check: cohort enrollment → non-existent/`isDeleted` Class.

### 5. Tests — `server/tests/integration/learningEnrollmentRoutes.test.js` (new)
- Admin enrolls learner into cohort → 201; appears in list.
- self_enroll program: learner self-enrolls → 201; leader_booking program: learner self-enroll → 403.
- Withdraw → soft (status `Dropped`, not deleted).
- Duplicate active cohort enrollment → rejected.
- Reconcile: cohort enrollment (teamId null) **not** flagged orphaned.

## Scope
**In:** model change, new module, 3 endpoints, Admin + self-enroll authz, reconcile guard, tests, DTO.
**Out (later):** bulk ops, wiring cohort enrollment into session rosters/attendance, M1 session-level `self_enroll`/`nomination` booking (builds on this next), multi-program analytics.

## Verification
- `cd server && npm test` (new enrollment suite + existing booking/reconcile suites stay green — the reconcile-skip is the key regression point).
- `cd client && npm run lint` (no client change this slice).
- Manual: `npm run seed` → as Admin `POST /api/learning/enrollments {cohortId, userId}` → 201; `GET ...?cohortId=` shows it; reconcile run shows no orphan flag for it.

## Risks
- **Index/partial-filter** for null `teamId` uniqueness is the trickiest bit — validate at implementation; fall back to use-case-level dup check if needed.
- Reconcile change must not weaken the genuine "team member without enrollment" check (CHECK 3 untouched).
- Keep team-based enrollment behaviour byte-for-byte (transfer/bulk/booking).

## Open questions
1. Withdraw status: `Dropped` (proposed) vs a new `Withdrawn` value? (reuse existing enum = simpler.)
2. Should cohort enrollment immediately make the learner eligible for that cohort's sessions, or is session enrollment kept separate until the M1 self_enroll/nomination session flows land? (proposed: **separate** this slice.)
3. Multi-program: allow a learner Active in multiple cohorts simultaneously — yes (the `{userId,classId}` uniqueness allows different cohorts). Confirm.
