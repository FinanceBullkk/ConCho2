# English Class Separation — bounded section for the legacy English-class business

> **Goal:** everything English-class-shaped (classes, teams, leader booking,
> schedules, attendance, evaluations) lives in ONE dedicated nav section
> (`/english`), fully separated from the generic Training/Learning surfaces.
> Supersedes/extends Cohesion P4 (membership gating) per owner decision
> 2026-06-12: full separation, including schedules+attendance split and an
> additive backend read surface.
> Status: `archived` (shipped 2026-06-12) · Owner: anhha · Branch: `feat/cohesion-p4-team-booking-separation`

## Owner decisions (locked, 2026-06-12)
1. New top-level nav item **"English Class"** → route `/english` (tabs inside).
2. Schedules + Attendance ALSO split by mode: English section gets team-mode
   tabs; `/calendar` keeps cohort-mode (generic training) only.
3. Learning → Cohorts tab hides team-mode classes (server-side filter).
4. Backend separated too — **additive only** (ADR: no model/URL renames):
   new `domains/english-class/` read router at `/api/english/*` delegating
   into existing use-cases with mode forced to `team`; existing list
   endpoints gain an optional `mode=team|cohort` filter.

## Boundary definition (technical)
"English class" = team-scheduling world: `Class` whose program
`schedulingMode ∈ {leader_booking, admin_scheduled}` **or** program-less
(legacy fallback `leader_booking` — matches server
`findClassSchedulingMode`). Cohort world = `self_enroll | nomination`.
`Team`, leader `/book` grid, and legacy `Evaluation` are English-world by
nature (no filter needed).

## Phases
| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | Backend: mode filters + `/api/english` read router | `phase-01-backend-mode-filter-english-router.md` | 🟢 done 2026-06-12 (11 integration tests) |
| 2 | Frontend: `/english` section + navbar + world split | `phase-02-frontend-english-section.md` | 🟢 done 2026-06-12 (EnglishPage suite; 264/57 client green) |
| 3 | Cleanup: old tabs, redirects, e2e, docs, specs | `phase-03-cleanup-tests-docs.md` | 🟢 done 2026-06-12 (4 e2e specs + seed + docs) |

## Key dependencies
- `domains/schedule/queries.js` (list/attendance-calendar reads),
  `domains/learning` cohorts list, `lib/scheduling-mode.js` (client),
  CalendarPage/PeoplePage/ReportsPage/LearningPage shells, Navbar,
  e2e: booking/waitlist/navigation/permissions specs.

## Explicitly NOT in scope
- Model/collection/URL renames (ADR locked); `Team` vocabulary stays.
- Moving feature files between folders (SchedulesPage/AttendancePage serve
  both worlds — parameterized, not duplicated).
- Sheets Sync stays in Reports for now (open question below).
- Mutation endpoints unchanged (`/api/schedules/book-slot`, `/api/teams`,
  `/api/evaluations` already English-world; mode policy enforced audit r8).

## Unresolved questions
1. Sheets Sync (team-enrollment import) — move into English section later?
2. Admin combined calendar view (both worlds at once) — dropped per owner
   choice; revisit if ops misses it.
