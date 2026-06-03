# Development Roadmap — TMS v2 → Internal LMS (living tracker)

> **This is the canonical progress tracker.** Update it as milestones move.
> - *Why / strategy / gap analysis* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot* → [`handoff-2026-06-01.md`](handoff-2026-06-01.md)
>
> **Last updated:** 2026-06-03

---

## Current status

~50% through the TMS → L&D migration. Catalog + cohort + session read path live;
session booking now enforces **all 4** `schedulingMode`s (`leader_booking`,
`admin_scheduled`, `self_enroll`, `nomination` — no 501 stubs);
**cohort-based enrollment is live** (`/api/learning/enrollments`, incl. self-enroll).
Next in Wave A: Learning CRUD UI (M3), then capability-based authz scaffold (M4).

---

## Migration phases (backend re-architecture)

| Phase | Theme | Progress | Status |
|------|-------|---------:|--------|
| 0 | Architecture baseline + safety net | ~92% | 🟢 near done |
| 1 | Backend modular-monolith refactor | ~35% | 🟡 in progress |
| 2 | Learning catalog + generic cohort model | ~95% | 🟢 near done |
| 3 | Multi-program enrollment + session scheduling | ~75% | 🟡 in progress |
| 4 | Frontend L&D workspace (CRUD UI) | ~5% | 🔴 not started |
| 5 | Reporting, completion, feedback | ~10% | 🔴 not started |
| 6 | PostgreSQL decision gate | 0% | ⚪ gated |

## LMS waves (forward — see [`lms-roadmap.md`](lms-roadmap.md))

| Wave | Goal | Status | Depends on |
|------|------|--------|-----------|
| A — Foundation | Generic learning core works E2E (scheduling modes, cohort enrollment, CRUD UI, capability authz) | 🟡 in progress | — |
| B — Assessment & Certification | Generic assessment engine, completion enforcement, certificates | 🔴 planned | A |
| C — Catalog, Paths & Self-service | Learner catalog, self-enroll, learning paths/prerequisites | 🔴 planned | A |
| D — Platform & Scale | SSO, HRIS sync, advanced analytics, mobile, Postgres gate | 🔴 planned | B, C |

---

## Near-term milestones (Wave A)

| ID | Milestone | Acceptance | Status |
|----|-----------|-----------|--------|
| M1 | Enforce all 4 scheduling modes | leader/admin/self-enroll/nomination each have a real flow + tests; no 501 stubs | 🟢 done 4/4 (leader/admin team-booking; self_enroll/nomination Admin-schedule cohort sessions over M2 enrollments) |
| M2 | Cohort-based enrollment | `/api/learning/enrollments` (cohort-based, multi-program) + self-enroll path | 🟢 done (enroll/self-enroll/withdraw/list; bulk + session-roster wiring deferred) |
| M3 | Learning CRUD UI | Create/edit Program, create Cohort, enroll learners (not read-only) | 🔴 |
| M4 | Capability-based authz scaffold | `program.manage`/`session.book` style checks behind `policy/` | 🔴 |
| → | **Wave B kickoff** | Generic Assessment domain design started | ⚪ after M3 (M1+M2 done) |

---

## Recent progress (changelog)

- **2026-06-03** — **M1 complete — all 4 scheduling modes enforced (no 501 stubs).**
  `self_enroll`/`nomination` now have a real flow: an Admin schedules a **team-less
  cohort session** (`POST /api/learning/sessions/book-slot` with `cohortId`) that
  snapshots the cohort's active cohort-based enrollments (M2) as the roster.
  `Schedule.bookedTeamId` made optional; new `scheduleService.bookCohortSlot`;
  `bookSession` routes `groupId` (team modes) vs `cohortId` (cohort modes); a
  team-based program booked via group is rejected, cohort-based via group → 400.
  6 new/updated session tests (self_enroll/nomination 201 + roster, non-admin 403,
  wrong-target 400, validation). Server 472 tests green; lint clean.
- **2026-06-02** — **M2 cohort-based enrollment shipped.** `Enrollment.teamId`
  now optional; new `domains/learning/enrollment/` module + `/api/learning/enrollments`
  (list / enroll / withdraw-soft → `Dropped`). Admin enrolls anyone; learners
  self-enroll when the program is `self_enroll`; multi-program allowed. Reconcile
  no longer false-flags team-less cohort enrollments. 6 integration tests;
  team-based enrollment path untouched.
- **2026-06-02** — `admin_scheduled` mode shipped: Admin-only session creation;
  team leaders rejected with 403 (reuses `bookSlot`). **M1 → 2/4 modes.**
  `self_enroll`/`nomination` still 501 — they need cohort-based per-learner
  enrollment (**M2**). Tests added (admin 201 / leader 403 / self_enroll 501).
- **2026-06-02** — Enforce `schedulingMode` foundation (`ee7ba54`): leader_booking
  works, admin/self-enroll/nomination return 501 until built. Committed + pushed
  the full migration backlog (5 commits). Added `system-overview.md`,
  `lms-roadmap.md`, and this tracker. Verified: 459 server + 98 client tests, lint clean.
- **2026-06-01** — Learning domain (programs/cohorts/sessions), `LearningProgram`
  model + `Class.programId` backfill, schedule adapter (thinned `scheduleController`),
  ADRs, current-system-map, route-permission-matrix.

---

## How to keep this current

After each milestone or significant change: update the phase/wave %, move the
status emoji, add one changelog line (dated), and sync `handoff-2026-06-01.md`.
Keep this doc lean — strategy detail stays in `lms-roadmap.md`.
