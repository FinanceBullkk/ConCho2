# Plan: M1 — Wire `self_enroll` + `nomination` session scheduling (close M1, 4/4 modes)

**Status:** ✅ DONE (2026-06-03) — server 472/472 green, lint clean, tracker synced · **Milestone:** M1 (Wave A) · **Builds on:** M2 cohort enrollment

## Context
`domains/learning/session/use-cases.js` supports `leader_booking` + `admin_scheduled` (team-based via `scheduleService.bookSlot`). `self_enroll`/`nomination` return **501** ([use-cases.js:71-81](../../server/domains/learning/session/use-cases.js#L71)). These two modes are **cohort-based** (per-learner enrollment, M2) — no team. Blocker: `Schedule.bookedTeamId` is **required** ([models/Schedule.js:30-34](../../server/models/Schedule.js#L30)) so a team-less session can't be created.

## Approach (KISS, additive)
For `self_enroll`/`nomination`, sessions are **Admin-scheduled against a cohort** (not a team) and snapshot the cohort's active cohort-based enrollments (M2 `Enrollment` docs, `teamId:null`, `Active`) as `enrolledUsers`. Who may *enroll* is already gated by M2 (self_enroll → learner self-enrolls; nomination → Admin-only). M1 adds the **session-creation** flow + scheduling-mode routing.

- `bookedTeamId` → **optional** (team-less cohort sessions). Backward-compatible; all existing docs keep their team. Unique index `{classId,startTime}` and collision check are team-independent → double-booking still guarded.
- `bookSession` routes by payload: `cohortId` → cohort path (self_enroll/nomination, Admin-only); `groupId` → team path (leader_booking/admin_scheduled). A team-path request for a self_enroll/nomination program is rejected 400 ("schedule against the cohort"). Unknown future mode → defensive 501.
- New `scheduleService.bookCohortSlot` mirrors `bookSlot` minus team/leader-auth/weekly-limit; enrolls passed learner ids; same slot validation (extracted to a shared helper) + collision + E11000→409 + best-effort calendar.

*Snapshot semantics:* roster = active cohort enrollments **at creation time** (mirrors team-member snapshot). Continuous re-sync on later enrollment deferred (M2 already deferred session-roster wiring).

## Changes
1. **[models/Schedule.js](../../server/models/Schedule.js)** — `bookedTeamId` required → optional (`default: null`).
2. **[services/scheduleService.js](../../server/services/scheduleService.js)** — extract `assertValidBookingSlot(start,end)`; refactor `bookSlot` to use it; add `bookCohortSlot({cohortId,startTime,endTime,enrolledUserIds,requestUser})`; export it.
3. **session/repository.js** — `findSchedulingContextByCohort(cohortId)`; `findActiveCohortLearnerIds(cohortId)` (Enrollment classId+teamId:null+Active → userIds).
4. **session/use-cases.js** — split `bookSession` into team/cohort paths; `COHORT_SCHEDULING_MODES = {self_enroll, nomination}`, `TEAM_SCHEDULING_MODES = {leader_booking, admin_scheduled}`.
5. **session/schemas.js** — `bookSessionBody`: `groupId` XOR `cohortId` (exactly one) via refine.
6. **tests** `learningSessionRoutes.test.js` — update self_enroll-via-leader → 400 (was 501); add admin self_enroll cohort-book 201 (+roster), admin nomination cohort-book 201, leader cohort-path 403, cohortId on leader_booking cohort → 400.

## Out of scope
Bulk/roster re-sync on enrollment, capacity enforcement, frontend (M3), nomination-specific session UI.

## Verification
- `cd server && npm test -- --runTestsByPath tests/integration/learningSessionRoutes.test.js` — pass (15/15).
- `cd server && npm test -- --runTestsByPath tests/integration/booking.test.js tests/integration/bookingRace.test.js tests/integration/learningEnrollmentRoutes.test.js tests/integration/reconcileDrift.test.js` — pass (26/26).
- `cd client && npm run lint` — pass (0 errors, 81 warnings; within current max-warnings budget).
- `cd server && npm test` — **PASS: 47 suites / 472 tests** (exit 0). Earlier "hang" was just suite slowness (full run completes; the pino thread-stream open-handle warning is pre-existing and harmless under `--forceExit`).

## Definition of Done
Code per conventions ✓ · full server suite 472/472 green ✓ · client lint 0 errors/81 warnings (= cap) ✓ · tracker updated (roadmap M1→done, Phase 3 75%, changelog; handoff synced) ✓ · committed ✓.
