---
title: Re-center LTMS on the coordinator-scheduled, offline, multi-office model
status: pending
priority: high
effort_total: TBD per phase (see phase files)
created: 2026-06-09
based_on:
  - docs/decisions/coordinator-scheduled-offline-model.md (ADR)
  - server/CONTEXT.md (glossary: Office, Trainer, Training coordinator)
  - grill session 2026-06-09 (owner)
---

# Re-center LTMS — coordinator-scheduled, offline, multi-office

## Context
A grill session with the owner (2026-06-09) revealed the system's real operating
model differs materially from its English-class origins. This plan re-centers the
product on that model. Decision recorded in
[ADR](../../docs/decisions/coordinator-scheduled-offline-model.md); vocabulary in
[server/CONTEXT.md](../../server/CONTEXT.md).

## The real operating model (from grill)
| # | Reality | Legacy system assumed |
|---|---|---|
| 1 | **Training coordinator/HR** schedules sessions (`admin_scheduled`) | Team leader self-books (`leader_booking`) |
| 2 | **Self-enrol** + coordinator **assign** fallback | Pre-built Team snapshot |
| 3 | Course = **1 or many** sessions; enrol-per-course/session is configurable | — |
| 4 | **Office (2–3 sites)** first-class; **Rooms belong to an Office** | No Office concept |
| 5 | **Trainer** = internal employee **or** external (name+contact, no login) | Internal teacher only |
| 6 | **Training coordinator** role ≠ full Admin | Only Admin/Teacher/Participant |

## What already exists vs the gaps
- **Reuse (already built):** self-enrol catalog, Assignment (assign program + due
  date), Sessions, attendance, assessments, certificates, completion + compliance
  reports, Department/manager org.
- **Gaps to fill:** Office concept · external Trainer · Training-coordinator role ·
  Rooms (Office-scoped, Wave E3) · make coordinator-scheduling the primary UX.

## Phases
| Phase | Title | Depends on | Status |
|---|---|---|---|
| 1 | [Office + Training-coordinator role](./phase-01-office-and-coordinator-role.md) — additive Office model (employee + Room → Office); Coordinator capability set | — | pending |
| 2 | [Coordinator-scheduled session flow (primary UX)](./phase-02-coordinator-scheduling-flow.md) — make `admin_scheduled` the first-class create flow (course+office+room+time+trainer → self-enrol/assign); demote `leader_booking` | 1 | pending |
| 3 | [Rooms + Trainers](./phase-03-rooms-and-trainers.md) — Office-scoped Rooms + internal/external Trainer + waitlists; refines the existing Wave E3 plan | 1, 2 | pending |

Wave E3 detail (rooms/instructors/waitlists/cancellation) lives in
[`plans/260609-2053-wave-e3-generic-scheduling/`](../260609-2053-wave-e3-generic-scheduling/);
Phase 3 here folds in two grill deltas: **Rooms are Office-scoped** and **Trainers can
be external**.

## Two tracks (parallel)
- **Track A (needs owner):** Google SSO → auto-fill Office/Department from Directory →
  always-on hosting. *Blocked on owner: Google OAuth app + Workspace domain; hosting budget.*
- **Track B (codeable now):** Phase 1 → Phase 2 → Phase 3.

## Owner decisions (blockers)
1. Google OAuth app + allowed Workspace domain (unblocks Track A / SSO).
2. Always-on hosting budget.

## Definition of Done (per phase)
Code + tests + lint green · tracker updated (`docs/development-roadmap.md`) · capability
spec updated (`docs/specs/`) · `server/CONTEXT.md` / route-permission-matrix synced if
behavior/authz changed · committed.

## Open questions (grill tail — resolve as each phase starts)
- Offline attendance/completion when there is no quiz.
- Where the enrol-per-course-vs-session toggle lives + default.
- Cancellation: who may cancel, notice period, notifying waitlisted learners.
- External-trainer calendar invite + timesheet needs.
