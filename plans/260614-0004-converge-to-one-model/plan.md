# Converge to One Training Model (rearchitecture Option A)

**Created:** 2026-06-14 · **Status:** 🟢 Phases 0–4 shipped (2026-06-19) — parallel-world surfaces unified (catalog · calendar · attendance · schedules · grading) + persona-clean sidebar; Phase 3 COMPLETE (slice 5 `mode`-fork removal shipped 2026-06-20); Phase 5/6 remain · **Decision:** owner chose
**Option A — full convergence** (ADR `docs/decisions/converge-to-one-training-model.md`).
**Proposal:** `plans/reports/architecture-260614-0004-rearchitecture-proposal.md`.

## Goal
Collapse the two parallel training worlds into ONE generic spine
`Program → Session → Enrollment → Completion → Certificate`; English-class becomes a
Program *delivery profile*, not a separate world. Phased, each phase shippable with
tests + lint + spec update. No big-bang.

## Guardrails (locked — do not violate while converging)
- Modular monolith (not microservices); MongoDB now, Postgres at Phase-6 gate.
- **No physical collection renames** — converge via DTO/abstraction.
- Security layers intact (CSRF, rate limits, two-layer authz, soft delete, audit).
- English-only UI; tests are gates; eslint ≤ cap.
- Behaviour parity per phase — especially audit/notification when moving to events.

## Phases (sequenced; each independently shippable)
| # | Phase | Outcome | Risk |
|---|---|---|---|
| 0 | [Foundations](phase-00-foundations.md) | in-process **domain-event bus** (audit/notify/completion subscribe) + **finish authz** (legacy roleGuard → capability). No behaviour change. | low |
| 1 | [Converge Assessment](phase-01-converge-assessment.md) | `Evaluation` flows fold onto `Assessment`; one assessment model. | med |
| 2 | [Converge Enrollment](phase-02-converge-enrollment.md) ✅ | **read layer done (2026-06-14)** — one self read `GET /api/learning/enrollments/mine` serves both modes. **create write-spine + event done (2026-06-15)** — both modes create via one spine + publish `ENROLLMENT_CREATED` (team post-commit). Transfer/drop close-paths still deferred. | med-high |
| 3 ✅ | [Generalise Scheduling](phase-03-generalise-scheduling.md) | retire `Schedule` `mode` fork; Program `schedulingMode`/deliveryProfile drives it (leader_booking = one mode). **Done 2026-06-18:** slice 1 server SSOT (#153), slice 2 client SSOT (#154), slice 4a cohort DTO `deliveryType` (#155). **Done 2026-06-19:** slice 4b session `deliveryType` tag (#159). **Done 2026-06-20 (slice 5):** retired the `mode=team\|cohort` split + the `/api/english` read delegation (`domains/english-class/` deleted → domains 21→20); unified reads serve both worlds tagged `deliveryType`, faceted client-side. **Phase 3 COMPLETE** (slice 3 `deliveryProfile` deferred — YAGNI). | high |
| 4 | UX journeys ✅ | re-cut sidebar groups into persona journeys; collapse English↔Operations once storage unified. **Slice 1 done (2026-06-18):** Learning→Cohorts is now a UNIFIED catalog (mode="all") listing BOTH worlds with a deliveryType column + world filter; per-row actions gate by deliveryType. **Slice 2 done (2026-06-19):** retired the now-redundant English "Classes" tab (nav + page) — team-world class CRUD lives in the unified catalog. **Slice A1 done (2026-06-19):** Operations Attendance unified (`mode="all"`) — ONE attendance calendar showing BOTH worlds with a client-side Team/Cohort facet (uses session `deliveryType` from 4b); marking is world-agnostic so no drawer change needed (#160). **Slice A1b done (2026-06-19):** retired the now-redundant English Attendance tab (nav + page); Teacher's English section defaults to Evaluations; the e2e attendance-marking flow now goes through the unified `/calendar` (#161). **Slice A2a done (2026-06-19):** Operations Schedules unified (`mode="all"`) — both worlds + Team/Cohort facet; the edit drawer handles team-less (cohort) sessions (no team picker, omits `bookedTeamId` on save); cell-click CREATE still books a team — cohort sessions are created in Learning → Cohorts (owner chose A2-α: display-fold, no create-path merge) (#162). **Slice A2b done (2026-06-19):** retired the English Schedules tab (nav + page) — team-world schedules live in the unified `/calendar` (#163). **Parallel-world duplication is now fully converged: ONE catalog, ONE calendar, ONE attendance, ONE schedules surface.** **Slice C done (2026-06-19) — grading-UI unification ([phase-04-grading-ui-unification.md](phase-04-grading-ui-unification.md)):** a unified **Grading workspace** (`/grading`, Learning group) grades BOTH modes — quiz manual-grade + English rubric — from one place, each opening its native entry; the English **Evaluations** tab is retired. Shipped C1 grading-queue read (#165), C2 workspace page (#166), C3+C4 nav/retire + spec (#167). No model merge (owner A2-α-style: converge by read/UI, not collections). **Slice D done (2026-06-19) — sidebar persona cleanup (#168):** retired the now-vestigial English admin nav group and moved **Teams → People** (`/people?tab=teams`; a Team is a group of people — matches the shipped target IA). `/english` is now learner-persona-only (the leader booking grid); Admin/Teacher reach every former English surface from the unified Admin Console nav. **PHASE 4 COMPLETE** — the parallel-world convergence (catalog · calendar · attendance · schedules · grading) plus the persona-clean sidebar are all shipped. | med |
| 5 | Retire legacy `routes/`+`controllers/` | fold remaining legacy into bounded contexts. | med |
| 6 | (existing) Postgres gate | unchanged — separate plan. | — |

## Bounded contexts (target module map)
Identity&Access · Org · Catalog · Scheduling · Enrollment · Delivery(Attendance) ·
Assessment · Completion&Certification · Compliance · Notification+Audit(platform).
Cross-cutting concerns communicate via domain events (Phase 0).

## Definition of Done (per phase)
- ☑ Behaviour parity (or intentional change spec'd); tests cover happy + denial + edge
- ☑ Tests + lint (≤ cap) + build green (real pass)
- ☑ Spec(s) updated (`docs/specs/`) + registry; `current-system-map` if locations moved
- ☑ `development-roadmap` changelog; committed

## Decisions (resolved)
- **Leader-booking** = one scheduling mode, not the centre (per 2026-06-09 ADR). ✓
- **Evaluation→Assessment** + **team→cohort enrollment** convergence = approved (this ADR). ✓
- Start with **Phase 0 foundations** (safe, high-leverage, direction-independent).

## Open questions
1. Phase 0 entry slice — **event-bus first** (invisible, foundational) or **authz-finish
   first** (mechanical, visibly removes the two-layer split)? (Recommend: event bus
   foundation + migrate ONE concern as the reference pattern, then authz in parallel.)
2. Timebox / cadence — run the full track, or cap at highest-ROI slice (Phase 0 + 1)
   then re-review? (Recommend: ship Phase 0 + 1, review, continue.)
