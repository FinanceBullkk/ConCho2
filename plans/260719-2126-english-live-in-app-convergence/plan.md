---
change: english-live-in-app-convergence
status: proposed
target_specs: [english-training, capability-authz]
milestone: English Training — live convergence
created: 2026-07-19
---

# Proposal: English Training goes live in-app (converge onto the generic model)

> ADR: [`docs/decisions/english-live-converge.md`](../../docs/decisions/english-live-converge.md)
> Fit/gap: [`fit-gap-analysis.md`](fit-gap-analysis.md)

## Why

Owner changed the premise: English classes will be **operated live in ConCho2**
(HR/Teacher create classes, book sessions, mark attendance) instead of imported
from Excel. A live English subsystem on the separate `eng_*` silo would be a
second parallel training world — the exact duplication
[`converge-to-one-training-model`](../../docs/decisions/converge-to-one-training-model.md)
ruled against. Decision: **converge English onto the generic domains**, phased.

Owner choices (2026-07-19): learners **do not log in** (HR/Teacher operate) ·
historical `eng_*` data **frozen as read-only archive** · sessions use the
**full booking grid** (rooms/calendar/conflict).

## Central design decision

To reuse the generic domains (attendance/enrollment/schedule all FK to `users`),
English learners become **`users` rows with login disabled** — real directory
records that appear in rosters/reports but cannot authenticate. Phase 0 delivers
this; everything else depends on it.

## Phases (each independently shippable — tests + lint + spec update)

| # | Phase | Outcome | Depends |
|---|---|---|---|
| P0 | [People as managed users](phase-00-people-as-managed-users.md) | English learners = login-disabled `users`, linked by `emp_code` | — |
| P1 | [Program & cohort on generic model](phase-01-program-and-cohort.md) | English course→`LearningProgram` (admin_scheduled) + class→cohort, English policy config | P0 |
| P2 | [Sessions via booking grid](phase-02-sessions-booking-grid.md) | Live session create through `domains/schedule` (rooms/calendar/conflict) | P1 |
| P3 | [Live attendance](phase-03-live-attendance.md) | Mark attendance through `domains/attendance` | P2 |
| P4 | [Levels & exam](phase-04-levels-and-exam.md) | 13 levels + ≤2-absence gate on `evaluation`/`assessment` | P1 |
| P5 | [Cutover & freeze archive](phase-05-cutover-and-archive.md) | `eng_*` read-only archive; import retired as primary path; UX unified | P2–P4 |

## Guardrails

Modular monolith · converge via DTO/abstraction, **no `eng_*` destructive
renames** · full security stack on every mutation (CSRF, rate limit, two-layer
authz, soft delete, audit) · English-only UI · no big-bang; coexistence window
kept green by tests.

## Open questions (resolve during P1 fit/gap)

1. **Exam/level model:** keep English's 13 ordered levels + ≤2-absence gate as
   program config, or normalise onto the generic assessment rubric? (leaning: keep
   as config — fidelity over churn).
2. **Login-disabled user state:** new `users` flag vs. reuse an existing
   inactive/status field — decide in P0 without weakening auth.
3. **PIC role:** map to cohort teacher/facilitator binding or a custom field?
