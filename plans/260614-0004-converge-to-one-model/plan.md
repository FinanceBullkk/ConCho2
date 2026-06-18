# Converge to One Training Model (rearchitecture Option A)

**Created:** 2026-06-14 · **Status:** 🟡 in progress (Phase 0,1,2 shipped; Phase 3 started — slice 1) · **Decision:** owner chose
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
| 3 | [Generalise Scheduling](phase-03-generalise-scheduling.md) 🟡 | retire `Schedule` `mode` fork; Program `schedulingMode`/deliveryProfile drives it (leader_booking = one mode). **Done 2026-06-18:** slice 1 server SSOT (#153), slice 2 client SSOT (#154), slice 4a cohort DTO `deliveryType` (#155). Remaining: 4b session DTO + retire `mode` branching. | high |
| 4 | UX journeys 🟡 | re-cut sidebar groups into persona journeys; collapse English↔Operations once storage unified. **Slice 1 done (2026-06-18):** Learning→Cohorts is now a UNIFIED catalog (mode="all") listing BOTH worlds with a deliveryType column + world filter; per-row actions gate by deliveryType. **Slice 2 done (2026-06-19):** retired the now-redundant English "Classes" tab (nav + page) — team-world class CRUD lives in the unified catalog. Remaining: fold the rest of English (schedules/attendance/evaluations) + persona-journey sidebar. | med |
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
