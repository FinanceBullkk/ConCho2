# Development Roadmap — TMS v2 → Internal LMS (living tracker)

> **This is the canonical progress tracker.** Update it as milestones move.
> - *Why / strategy / gap analysis* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot* → [`handoff-2026-06-01.md`](handoff-2026-06-01.md)
>
> **Last updated:** 2026-06-02

---

## Current status

~45% through the TMS → L&D migration. Catalog + cohort + session read path live;
session booking enforces `schedulingMode` (`leader_booking` + `admin_scheduled`);
**cohort-based enrollment is live** (`/api/learning/enrollments`, incl. self-enroll).
Next in Wave A: Learning CRUD UI (M3), then wire session-level
`self_enroll`/`nomination` to close M1.

---

## Migration phases (backend re-architecture)

| Phase | Theme | Progress | Status |
|------|-------|---------:|--------|
| 0 | Architecture baseline + safety net | ~92% | 🟢 near done |
| 1 | Backend modular-monolith refactor | ~35% | 🟡 in progress |
| 2 | Learning catalog + generic cohort model | ~95% | 🟢 near done |
| 3 | Multi-program enrollment + session scheduling | ~55% | 🟡 in progress |
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
| M1 | Enforce all 4 scheduling modes | leader/admin/self-enroll/nomination each have a real flow + tests; no 501 stubs | 🟡 2/4 (leader + admin_scheduled; self_enroll/nomination unblocked by M2 — session-level wiring next) |
| M2 | Cohort-based enrollment | `/api/learning/enrollments` (cohort-based, multi-program) + self-enroll path | 🟢 done (enroll/self-enroll/withdraw/list; bulk + session-roster wiring deferred) |
| M3 | Learning CRUD UI | Create/edit Program, create Cohort, enroll learners (not read-only) | 🔴 |
| M4 | Capability-based authz scaffold | `program.manage`/`session.book` style checks behind `policy/` | 🔴 |
| → | **Wave B kickoff** | Generic Assessment domain design started | ⚪ after M1–M3 |

---

## Recent progress (changelog)

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
