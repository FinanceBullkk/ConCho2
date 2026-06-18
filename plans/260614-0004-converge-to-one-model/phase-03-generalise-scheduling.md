# Phase 3 — Generalise Scheduling (retire the two-world `mode` fork)

> Part of [Converge to One Training Model](plan.md) · ADR
> `docs/decisions/converge-to-one-training-model.md`. **Risk: HIGH** (touches the
> core booking path 1000 users depend on) → strictly sliced, each slice
> independently shippable with **behaviour parity** + tests + lint.

## Goal

Remove the parallel "two worlds" for the same domain (training delivery):
- **Team/English world** — `leader_booking`/`admin_scheduled`, team-booked,
  surfaced under `/english` + `mode=team` list reads.
- **Cohort/L&D world** — `self_enroll`/`nomination`, admin/coordinator-scheduled,
  surfaced under Learning + `mode=cohort` list reads.

Target: ONE spine where a program's `schedulingMode` (+ a derived
`deliveryProfile`) drives behaviour, and the UI shows ONE training catalog with
delivery type as a **facet**, not two disjoint nav sections. `leader_booking`
becomes one mode among several (per the 2026-06-09 ADR), not the centre.

This is the storage/abstraction groundwork that **Phase 4 (UX journeys)** then
builds the unified UI on top of ("collapse English↔Operations once storage
unified").

## Why this is the user-visible root cause

An admin opening **Learning → Cohorts** sees an empty list on production because
all real data lives in the **English** world (`leader_booking`), which the cohort
list filters out via `mode`. Same `CohortsTab` component, two nav homes, disjoint
data → "I go to Cohorts and see nothing." Fixing the fork removes the confusion at
the source instead of papering the empty state.

## Current state (what the fork is, in code)

- **Classification** of team vs cohort modes — **was duplicated** across
  `scheduling-mode-policy`, `schedule/repository`, `learning/repository` (+ client
  `lib/scheduling-mode.js` and `CohortsTab`). schedule/repository copied it
  explicitly to dodge a require cycle.
- **List reads** branch on a `mode=team|cohort` query → `findCohortMode*Ids` →
  `classId/programId {$in|$nin}` (`schedule/queries.listSchedules`,
  `getAttendanceCalendar`, `learning/use-cases.listCohorts`).
- **English delegation surface** `domains/english-class` forces `mode=team`.
- **Booking authz** `scheduling-mode-policy` (assertTeamMode / assertCohortMode)
  already centralises the create-time rule — keep it.

## Slices (sequenced; each independently shippable, parity-preserving)

| # | Slice | Outcome | Risk |
|---|---|---|---|
| 1 ✅ | **Mode classification = one source of truth** | `domains/_shared/scheduling-modes.js` (zero-dep leaf); policy + both repos import it; cycle + "keep in sync" duplication gone. No behaviour change. | low |
| 2 ✅ | **Client classification = one source** | `lib/scheduling-mode.js` gains `COHORT_SCHEDULING_MODES` + `isCohortMode`; `CohortsTab` imports it (local `COHORT_MODES` removed) and `lockedReason` reuses it. No behaviour change. | low |
| 3 | **Derive `deliveryProfile`** | Program DTO exposes `deliveryProfile {instructorLed, groupBased, leaderScheduled}` derived from `schedulingMode` (read-only, additive). Foundation for driving behaviour off a profile, not a string. | low |
| 4a ✅ | **Cohort DTO carries `deliveryType`** | `cohortDto` exposes `deliveryType` ('team'\|'cohort') derived from the program's schedulingMode via the SSOT (program-less → 'team'). Additive — one catalog can now list both worlds + facet by type. `GET /api/learning/cohorts` with no `mode` already returns both worlds. | low-med |
| 4b | **Session DTO `deliveryType` + `mode=` as thin wrapper** | Same field on the session list DTO; `mode=team\|cohort` kept (back-compat) but expressed via the facet. | med |
| 5 | **Collapse the fork** | Once the UI consumes the unified list (Phase 4), retire the disjoint `mode` branching + fold the `english-class` delegation into the unified read. | med-high |

> Slices 1–3 are near-zero behaviour risk (pure consolidation / additive DTO).
> The genuine behaviour change is 4–5 (and the UI merge in Phase 4) — gated behind
> parity tests and shippable one at a time.

## Definition of Done (per slice)
- ☑ Behaviour parity (or intentional, spec'd change); tests cover happy + denial + edge
- ☑ `cd server && npm test` + `cd client && npm run test:run` + lint (≤ cap) green
- ☑ Spec(s) updated only when behaviour changes (slices 4–5); pure refactors (1–3)
  update `current-system-map`/this plan instead
- ☑ `development-roadmap` changelog; committed; PR with green CI before merge

## Risks & guardrails
- **Core booking path** — never weaken weekly cap / collision / capacity /
  scheduling-mode authz while refactoring; they have dedicated tests, keep them green.
- **No physical renames / no data move** (ADR guardrail) — converge via DTO/abstraction.
- **Parity first** — every slice must be provably behaviour-preserving until the
  intentional UX change in Phase 4.

## Status
- **Slice 1 shipped (#153):** `_shared/scheduling-modes.js` + parity unit test;
  full server suite green.
- **Slice 2 shipped (#154):** client SSOT — `lib/scheduling-mode.js` `isCohortMode` /
  `COHORT_SCHEDULING_MODES`; `CohortsTab` consumes it; client tests + lint green.
- **Slice 4a shipped:** `cohortDto.deliveryType` (server-computed via SSOT) + unit
  test; full server suite green. The cohort list can now drive a single catalog.
- Next: slice 4b (session DTO `deliveryType` + `mode` wrapper), then **Phase 4**
  (the visible single-catalog UI). Slice 3 (`deliveryProfile`) deferred (YAGNI —
  no consumer yet).
