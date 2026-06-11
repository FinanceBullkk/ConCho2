# LTMS Execution Sequence — canonical order for the next build cycle

> **What this is:** the agreed execution order tying together the new dashboard plan + the two
> existing scheduling/re-center plans + the owner-blocked Track A. One canonical "what next, in what
> order, why" index. Detailed work lives in the linked plans; this file is the sequencer only.
>
> **Created:** 2026-06-10 · **Source:** business case [`260610-0811`](./260610-0811-business-case-ltms-vs-excel.md)
> recommendation §7.6 + existing plans. Update `docs/development-roadmap.md` when each item starts/ships.

## The order (Track B = codeable now; Track A = owner-blocked, parallel)

| # | Item | Plan | Depends on | Status | Why here |
|---|------|------|-----------|--------|----------|
| 1 | **2-tier Dashboard** (ops + ROI) on existing data | [`260610-0830-ltms-2tier-dashboard/`](./260610-0830-ltms-2tier-dashboard/plan.md) | existing data only | 🔴 pending | **Quick win first** — proves L&D value to leadership *before* spending the long scheduling effort; unlocks buy-in for the rest |
| 2 | **Re-center P1** — Office + Training-coordinator role | [`260609-2215-…/phase-01`](./260609-2215-ltms-recenter-coordinator-offline/phase-01-office-and-coordinator-role.md) | — (additive) | 🔴 pending | Foundation: Office model + Coordinator capability; everything offline/multi-office needs it |
| 3 | **Wave E3 P1** — generic-scheduling foundation | [`260609-2053-…/phase-01`](./260609-2053-wave-e3-generic-scheduling/phase-01-foundation-session-types-and-data-model.md) | E1, E2 (done) | 🔴 pending | Shared Schedule fields/indexes/seams + the `releaseSchedule` contract every later E3 phase plugs into |
| 4 | **Re-center P2** — coordinator-scheduled flow = primary UX | [`260609-2215-…/phase-02`](./260609-2215-ltms-recenter-coordinator-offline/phase-02-coordinator-scheduling-flow.md) | #2 | 🔴 pending | Makes `admin_scheduled` the first-class create flow (course+Office+time→self-enrol/assign); mostly wiring existing backend |
| 5 | **Wave E3 P2 + P3** (parallel) + **Re-center P3** deltas | [`E3/phase-02`](./260609-2053-wave-e3-generic-scheduling/phase-02-rooms-and-conflict-lock.md) · [`E3/phase-03`](./260609-2053-wave-e3-generic-scheduling/phase-03-session-instructors.md) · [`recenter/phase-03`](./260609-2215-ltms-recenter-coordinator-offline/phase-03-rooms-and-trainers.md) | #2, #3, #4 | 🔴 pending | Rooms (Office-scoped) + conflict lock ∥ instructors (UNION authz); re-center P3 folds in **Office-scoped rooms** + **external trainers** |
| 6 | **Wave E3 P4** — durable cancellation + waitlists | [`E3/phase-04`](./260609-2053-wave-e3-generic-scheduling/phase-04-cancellation-states-and-waitlists.md) | #3, #5 | 🔴 pending | Lands last — owns the partial-unique index migration + the seat-freeing `releaseSchedule` hooks every other subsystem touches |
| A | **Track A** — Google SSO + Directory sync + always-on hosting | re-center [`plan.md`](./260609-2215-ltms-recenter-coordinator-offline/plan.md) §Two tracks; roadmap Wave D1/D2 | **owner inputs** | ⏸ blocked | Runs **in parallel** the moment the owner provides the Google OAuth app + Workspace domain + hosting budget; unblocks auto-fill of Office/Department + production reliability |

## Critical path & parallelism
```
#1 Dashboard ──────────────► (ships value; independent of everything else)

#2 Re-center P1 ─┬─► #4 Re-center P2 ─┐
                 │                     ├─► #5 (E3 P2 ∥ E3 P3 + recenter-P3 deltas) ─► #6 E3 P4
#3 E3 P1 ────────┴─────────────────────┘

Track A (SSO/Directory/hosting) ── parallel, owner-gated, joins whenever inputs arrive
```
- **#1 is fully independent** — start immediately; do not block it on the scheduling chain.
- **#2 and #3 can start together** (#2 additive Office/role; #3 additive Schedule fields) — different files.
- **#5's E3 P2 and E3 P3 run in parallel** if file ownership is split (room domain vs instructor policy);
  re-center P3 deltas (Office-scoped room, external trainer) land *on top of* E3 P2/P3, so sequence
  them right after / alongside those.
- **#6 last** — it migrates the `{classId,startTime}` index to partial-unique and owns `releaseSchedule`.

## Rationale (one line each)
- **Dashboard first** because the business case shows the expensive build is already done; the missing
  piece is *visibility*, and visibility is what earns leadership's continued investment. Cheapest, fastest proof.
- **Re-center before/with E3** because E3's rooms/instructors must be **Office-scoped** and **trainer =
  internal-or-external** per the ADR — building E3 without the re-center deltas would bake in the wrong model.
- **E3 strictly sequenced** (foundation → resource gates → cancellation/waitlist) because all four
  subsystems share the load-bearing booking chokepoint; P4 owns the most invasive change.
- **Track A parallel** because it is gated on owner inputs (Google app, Workspace domain, hosting budget),
  not engineering — never let it block Track B.

## Definition of Done (applies to every item)
Per each plan's own DoD: code + tests + lint (≤ cap 81) green (real pass) · `docs/development-roadmap.md`
changelog + status moved · capability spec(s) in `docs/specs/` updated on behavior change ·
`server/CONTEXT.md` / `route-permission-matrix.md` synced if vocab/authz changed · committed
(conventional commit, no AI refs) · pause before `git push`.

## Unresolved questions (cross-cutting)
- **#1 cost config:** who enters `LND_COST_CONFIG` (Admin via dashboard, or HR via a form)? (blocks ROI financials only)
- **#4/#5 offline attendance:** how is attendance/completion recorded for an offline session with no quiz? (ADR Q1)
- **#5 enrol granularity:** where does the "enrol per course vs per session" toggle live + default? (ADR Q2)
- **#5/#6 cancellation policy:** who may cancel, notice period, notifying waitlisted learners? (ADR Q3 / E3 Q1)
- **Track A:** Google OAuth app + allowed Workspace domain + always-on hosting budget — **owner decisions**.
