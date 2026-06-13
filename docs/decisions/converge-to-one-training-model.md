# ADR: Converge the two training worlds into one generic model

## Status

Accepted (2026-06-14). Owner decision. Supersedes the tactical
"English-class separation" (2026-06-12) and **completes** the re-center begun in
[`coordinator-scheduled-offline-model.md`](coordinator-scheduled-offline-model.md)
(2026-06-09). Phased — see `plans/260614-0004-converge-to-one-model/`.

## Context

After the IA rework (sidebar + persona, 2026-06-13) the owner judged the system
still "messy" and asked for a whole-system re-architecture against best-in-class
references. Analysis (`plans/reports/architecture-260614-0004-rearchitecture-
proposal.md`) found the root cause is **two parallel worlds for the same domain
(training delivery)**:

- **English-class world** — `Class` (+`Team`), `Schedule` (mode=team, leader-booked),
  team-based enrollment, `Evaluation`, `Attendance` (mode=team).
- **Generic L&D world** — `Class` exposed as **Cohort** (DTO), `Schedule` as
  **Session** (mode=cohort, admin-scheduled), cohort `Enrollment`, `Assessment`,
  `Attendance` (mode=cohort).

i.e. **the same Mongo models carry two semantics behind a `mode` flag**, with two UIs,
two enrollment paths and two assessment systems. Best-in-class LMS (Docebo,
Cornerstone, SAP SuccessFactors) run a **single** spine — `Program → Session →
Enrollment → Completion → Certificate` — where "English-class" is merely a *delivery
profile* (instructor-led + group + leader-scheduled), not a separate world. The
2026-06-09 ADR already established that the real operating model is
**coordinator-scheduled + self-enroll**, with leader-booking/Teams being legacy shape.

## Decision

**Converge to one generic training-delivery model** (rearchitecture Option A):

1. **One spine.** `LearningProgram → Session → Enrollment → Completion →
   Certificate`. English-class becomes a Program with
   `deliveryProfile = { instructorLed, groupBased, leaderScheduled }`, NOT its own
   world.
2. **Scheduling: retire the `mode` fork.** Behaviour is driven by the Program's
   `schedulingMode` (`admin_scheduled` / `self_enroll` / `nomination` /
   `leader_booking`). **`leader_booking` is now ONE mode among several**, not the
   centre of gravity (per the 2026-06-09 ADR).
3. **Enrollment: converge team-based onto cohort-based.** A "team booking" becomes a
   group-enrollment into a cohort — one `Enrollment` model.
4. **Assessment: converge `Evaluation` onto `Assessment`** (clears the deferred item).
5. **Vocabulary:** finish Class→Cohort and Schedule→Session at the API/DTO layer.
   **Physical collection renames stay out of scope** (per `mongo-now-postgres-later`
   and `ld-domain-vocabulary`) — converge via DTOs/abstractions, not destructive
   renames.
6. **Backend hygiene (foundation):** an in-process **domain-event bus** so audit,
   notifications and completion rollups subscribe to events
   (`SessionBooked`/`AttendanceMarked`/`EnrollmentCreated`/`CompletionAchieved`)
   instead of being hand-wired into each mutation; **finish the authz migration** of
   legacy `roleGuard` routes onto `requireCapability` + `policy/*`.

This reverses the prior "dual by design" stance for Evaluation↔Assessment and
team↔cohort enrollment, and the English-class separation — all now targets for
convergence, phased.

## Consequences

- **Positive:** removes the #1 source of cognitive + code duplication; one mental
  model, one UX journey; matches best-in-class LMS; reporting/completion/cert flows
  stop being doubled; microservice-ready (events) without being microservices.
- **Cost / risk:** multi-month, phased; touches the core booking/enroll/assess paths;
  requires data backfill + careful behaviour-parity tests; the event-bus refactor must
  preserve exact audit/notification behaviour.
- **Guardrails preserved:** modular monolith (not microservices); MongoDB now,
  Postgres at the Phase-6 gate; no physical renames; security layers (CSRF, rate
  limits, two-layer authz, soft delete, audit) intact; English-only UI; tests are
  gates.
- **Migration discipline:** each phase is independently shippable with tests + lint +
  spec update; no big-bang. Order: Phase 0 foundations → Assessment → Enrollment →
  Scheduling → UX journeys → retire legacy `routes/`.

## Related

- Proposal: `plans/reports/architecture-260614-0004-rearchitecture-proposal.md`
- Plan: `plans/260614-0004-converge-to-one-model/`
- Supersedes/extends: `coordinator-scheduled-offline-model.md`,
  `ld-domain-vocabulary.md`; bounded by `ld-platform-modular-monolith.md`,
  `mongo-now-postgres-later.md`.
