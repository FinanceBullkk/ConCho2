# Development Roadmap — TMS v2 → Internal LMS (living tracker)

> **This is the canonical progress tracker.** Update it as milestones move.
> - *Why / strategy / gap analysis* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot* → [`handoff-2026-06-01.md`](handoff-2026-06-01.md)
>
> **Last updated:** 2026-06-02

---

## Current status

~40% through the TMS → L&D migration. The catalog + cohort + session **read**
path is live; session booking now **enforces `schedulingMode`** (foundation,
`leader_booking` works, other 3 modes gated). Next: finish **Wave A**
(remaining scheduling modes, cohort-based enrollment, Learning CRUD UI).

---

## Migration phases (backend re-architecture)

| Phase | Theme | Progress | Status |
|------|-------|---------:|--------|
| 0 | Architecture baseline + safety net | ~92% | 🟢 near done |
| 1 | Backend modular-monolith refactor | ~35% | 🟡 in progress |
| 2 | Learning catalog + generic cohort model | ~95% | 🟢 near done |
| 3 | Multi-program enrollment + session scheduling | ~40% | 🟡 in progress |
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
| M1 | Enforce all 4 scheduling modes | leader/admin/self-enroll/nomination each have a real flow + tests; no 501 stubs | 🟡 1/4 (foundation shipped) |
| M2 | Cohort-based enrollment | `/api/learning/enrollments` (cohort-based, multi-program) + self-enroll path | 🔴 |
| M3 | Learning CRUD UI | Create/edit Program, create Cohort, enroll learners (not read-only) | 🔴 |
| M4 | Capability-based authz scaffold | `program.manage`/`session.book` style checks behind `policy/` | 🔴 |
| → | **Wave B kickoff** | Generic Assessment domain design started | ⚪ after M1–M3 |

---

## Recent progress (changelog)

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
