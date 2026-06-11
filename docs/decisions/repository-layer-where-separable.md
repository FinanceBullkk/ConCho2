# ADR: Repository Layer Applies Where the Query Layer Is Separable

## Status

Accepted (2026-06-10).

## Context

The domain-module convention (`ld-platform-modular-monolith`) lists a
`repository.js` per `server/domains/<domain>/` — "all Mongoose calls live behind
a repository". `learning/` and `schedule/` follow this: their read queries and
CRUD primitives form a layer that is cleanly separable from the use-case logic
that orchestrates them (e.g. `schedule/use-cases.js` calls
`repository.findScheduleByIdRaw`, `repository.deleteAttendanceByScheduleId`,
etc.).

Phase 1 relocated two more areas into the convention:

- `domains/attendance/` — `marking.js` (bulk upsert + edit-window guards) and
  `analytics.js` (by-employee / by-team / by-class / personal-stats rollups).
- `domains/groups/` — `queries.js` / `mutations.js` / `lifecycle.js` /
  `enrollment-sync.js` (Team CRUD + transactional member/enrollment sync).

In both, the data access is **fused with the domain logic**, not separable from
it:

- The attendance analytics rollups *are* aggregation pipelines — the `$group` /
  `$lookup` / invert-join strategy (PERF-003) is the logic, not a thin query a
  repository would hide. Splitting "build pipeline" from "run pipeline" yields
  indirection, not isolation.
- The groups mutations are MongoDB transactions whose ordering (team write →
  schedule sync → enrollment sync, with post-commit email flush) is the logic;
  the individual `Team.findOneAndUpdate` calls have no meaning apart from the
  transaction that sequences them.

This mirrors the project's existing "kept large by design" calls
(`scheduleService`, `syncController`): structure follows the work, not a uniform
template.

## Decision

Introduce `repository.js` in a domain **only when a query/CRUD layer is genuinely
separable** from the use-case logic that calls it (as in `learning/`,
`schedule/`).

Where data access is fused with the domain logic — aggregation pipelines,
multi-document transactions — keep the Mongoose calls inline in the focused
module that owns that logic. Do not add a `repository.js` purely to satisfy the
template. This is the YAGNI/KISS reading of the modular-monolith convention.

Applies now to: `attendance/`, `groups/` (no `repository.js`, by design).

## Consequences

- `learning/` and `schedule/` keep `repository.js`; `attendance/` and `groups/`
  do not. The convention's `repository.js` is "where separable", not "always".
- New domains: add `repository.js` if a query layer naturally falls out; skip it
  if access is fused. Record the call here if non-obvious.
- The model surface for `attendance`/`groups` is still small and localized (2 and
  4 focused files respectively), each covered by integration tests, so the
  isolation a repository would provide is not needed for testability.

## Unresolved Questions

- If/when `attendance` analytics grows a second consumer (e.g. the executive
  dashboard pulling the same rollups), revisit extracting a shared read module —
  but as a use-case, not a thin repository.
