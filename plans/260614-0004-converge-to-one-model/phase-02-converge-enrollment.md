# Phase 2 — Converge Enrollment (team-based → one Enrollment, read layer)

**Priority:** High · **Status:** 🟢 shipped (2026-06-14) — read/contract convergence
done. **Behaviour change:** additive (new unified self read; learner "My programs"
now shows team-booked cohorts too) — existing flows unchanged.
server 978/100 + client 313 green.

> **Shipped:** `GET /api/learning/enrollments/mine` (self-scoped) — returns a
> learner's enrollments across BOTH modes in ONE shape, each tagged
> `mode: 'group'` (team-based, `teamId` set) or `mode: 'direct'` (cohort-based,
> `teamId:null`). `domains/learning/enrollment` gained `listEnrollmentsForLearner`
> (repository) + `getMyEnrollments` (use-case) + `myEnrollmentDto` (dto) +
> `listMine` (controller) + route. Learner `MyProgramsPage` consumes it (was
> cohort-only) → a team-booked learner finally sees their cohort there; the card
> falls back to the enrollment's `cohortName` when the cohort isn't in the open
> catalog. Spec `enrollment` + domain-model rule updated.

## Why
Both enrollment shapes already share ONE `Enrollment` model, discriminated by
`teamId` (set = team/group enrollment; null = direct cohort enrollment). They were
**read** in two places: cohort-based via `/api/learning/enrollments` (teamId null
only) and team-based via legacy `/api/enrollments`. A learner in the team-booking
world saw **nothing** on `/me/programs`. Smallest, safest convergence: unify the
**read**, like Phase 1 did for assessment.

## Approach (mirrors Phase 1 — read adapter first, no data move)
1. **One read across both modes.** `listEnrollmentsForLearner(userId)` reads ALL
   of a learner's enrollments (team + cohort), populated with cohort + group.
2. **One shape (DTO).** `myEnrollmentDto` tags each row `mode` (`group`|`direct`),
   carries cohort (`cohortId`/`cohortCode`/`cohortName`/`programId`) and, for group
   rows, `group {id,name}`.
3. **Self-scoped surface.** `GET /api/learning/enrollments/mine`
   (`enrollment.self`/`enrollment.read`); use-case always scopes to the caller.
4. **Client.** `MyProgramsPage` switches to the unified read so both modes render;
   `ProgramEnrollmentCard` gains a `cohortName` title fallback for catalog-absent
   (team) cohorts.

## Tests
- Server integration (`myEnrollments`): empty / group-mode / direct-mode / both /
  self-scope / unauthenticated (6).
- Client (`MyProgramsPage`): renders both modes, group-mode card via fallback name.

## Write-spine slice (2026-06-15) ✅
- **Done:** one create write-spine — `domains/learning/enrollment/writes.createActiveEnrollment`
  → `repository.insertActiveEnrollment` is now the SINGLE place an Active
  enrollment is born for both modes. Cohort `enroll`/`bulkEnroll` AND team
  `enrollment-sync` create through it (team-create no longer has its own
  `Enrollment.create`).
- **Done:** team enrollment now publishes `ENROLLMENT_CREATED` (post-commit, only
  when the team has a cohort) so the `cohort_enrolled` bell + automation subscribe
  uniformly for both modes. Behaviour-parity change, covered by parity tests
  (`teams.test.js`: cohort-bound team → bell; program-less team → none).
- Full suite 1046 green; spec `enrollment` + domain-model rule + roadmap updated.

## Deferred (follow-up, not this slice)
- Fold the team **transfer/drop** close-paths (`enrollment-sync` Transferred/
  Dropped saves) onto the shared spine — they still carry team-specific email
  side-effects and have no generic domain event yet.

## Done
One self read serves both enrollment modes; learner My-programs consumes it; tests
+ lint + build green; `docs/specs/enrollment` + domain-model rule updated; roadmap
changelog.
