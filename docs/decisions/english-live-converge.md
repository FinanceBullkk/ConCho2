# ADR: English Training goes live in-app — converge onto the generic model

## Status

Proposed (2026-07-19). Owner decision (interview this session). Extends
[`converge-to-one-training-model.md`](converge-to-one-training-model.md) —
re-applies its "one training spine" principle to the English Training subsystem.
Phased — see `plans/260719-2126-english-live-in-app-convergence/`.

## Context

English Training (the `eng_*` tables + `domains/english-training/`) shipped
2026-07 (Phases 1–3) as a **deliberately separate silo**: an Excel-workbook
**import** for HR reporting/compliance. Migration `038` states it plainly —
*"These tables remain separate from legacy schedules/attendances: English
employees are business records and do not require ConCho2 login accounts."* That
was the right call **for an import**: read-mostly, zero risk to the live booking
paths, `eng_employees.user_id` intentionally left null (0/308 linked).

The owner has now changed the premise: English classes will be **operated live
in-app** (staff create classes, book sessions, mark attendance in ConCho2)
instead of maintained in Excel and imported. Once English is a **live training
subsystem**, keeping a second parallel world for the same domain
(sessions/attendance/enrollment/assessment) is exactly the duplication the
`converge-to-one-training-model` ADR ruled against. Running two live training
systems is a DRY violation across the model, the security layers, and reporting.

Owner choices that scope this (interview 2026-07-19):

1. **Who operates:** HR/Teacher act live in-app; **learners do NOT log in**
   (no self-service, no ~1000 accounts to provision).
2. **Historical data:** the imported 984 sessions / 5,962 attendance rows are
   **frozen as a read-only archive** — new live data starts fresh on the generic
   model, not migrated into it.
3. **Scheduling depth:** English sessions use the **full booking grid** (rooms,
   calendar invites, conflict guard) — reuse `domains/schedule`, not a bespoke
   form.

## Decision

**Converge English Training onto the generic training domains** (`learning`,
`schedule`, `attendance`, `assessment`/`evaluation`) rather than build a second
live system on `eng_*`. English becomes a **delivery profile** of the one spine,
not its own world — consistent with the 2026-06-14 ADR.

Target mapping (detail: the plan's `fit-gap-analysis.md`):

| English concept | Generic home |
|---|---|
| English course | `LearningProgram` (+ English policy: ≤2-absence exam gate, 13 levels) |
| English class | `Class`/cohort, `schedulingMode = admin_scheduled` |
| English session | `Schedule` via `domains/schedule` (rooms + calendar + conflict) |
| Attendance | `domains/attendance` (live marking) |
| Enrollment | generic `Enrollment` |
| Level / exam result | `Evaluation`/`assessment` (already partly converged) |
| Learner | `users` record with **login disabled** (managed directory record) |
| `eng_*` history | frozen **read-only archive** (today's "English Training data" section) |

Load-bearing consequence of choice #1: to reuse the generic domains (whose
attendance/enrollment/schedule all reference `users`), **English learners must
exist as `users` rows with authentication disabled** — present in rosters and
reports, but unable to log in. This reconciles "no learner login" with model
reuse and is the central design decision of Phase 0.

Guardrails (unchanged): modular monolith; converge via DTO/abstraction, **no
destructive `eng_*` renames**; every mutation keeps the full security stack
(CSRF, rate limits, two-layer authz, soft delete, audit); English-only UI; tests
are gates; **each phase independently shippable** — no big-bang.

## Consequences

- **Positive:** one training model, one attendance/enrollment/schedule/reporting
  path; English inherits rooms/calendar/conflict + audit + soft-delete for free;
  no second live subsystem to maintain; aligns with the locked convergence ADR.
- **Cost / risk:** multi-milestone; introduces **login-disabled user records** (a
  new account state — auth middleware must refuse them cleanly); the generic model
  must absorb English-specific rules (exam gate, levels, PIC) as config, not forks;
  a coexistence window where the `eng_*` archive and the live model both exist.
- **Explicitly out of scope (owner):** learner self-service/login; migrating
  historical `eng_*` data into the live model (it stays a frozen archive);
  decommissioning the import pipeline before live paths replace it.

## Related

- Extends: [`converge-to-one-training-model.md`](converge-to-one-training-model.md),
  [`coordinator-scheduled-offline-model.md`](coordinator-scheduled-offline-model.md)
- Bounded by: [`ld-platform-modular-monolith.md`](ld-platform-modular-monolith.md),
  [`ld-domain-vocabulary.md`](ld-domain-vocabulary.md)
- Plan: `plans/260719-2126-english-live-in-app-convergence/`
- Supersedes the "separate by design" rationale in migration `038` **only once the
  live paths land** — the archive itself is retained.
