---
phase: 3
title: "E3+ Rooms, Session Instructors, and Waitlists Gates"
status: pending
priority: P2
effort: 3d
dependencies: [2]
---

# Phase 3: Later Expansion Gates

## Overview

Planning gate only. Do not code rooms, session instructors, or waitlists until
capacity and roster semantics are implemented and measured.

## Gate A: Rooms

Decide identity, exclusive/partitioned behavior, online/offline semantics,
archive behavior, and conflict lock. Preserve legacy `roomLink`
(`server/models/Schedule.js:50`).

Acceptance: concurrent writes cannot allocate one exclusive room twice; legacy
sessions remain readable.

## Gate B: Session Instructors

Decide whether session instructors may differ from Cohort `teacherIds`.
Teacher visibility/attendance currently derives from Cohort assignment
(`server/policy/attendance.js:5`). Change list/detail, attendance authz,
Calendar attendees, UI, and tests together.

Acceptance: no roster leak; instructor rights match approved policy; legacy
empty-`teacherIds` behavior remains explicit.

## Gate C: Cancellation And Waitlists

Future cancellation currently hard-deletes Schedule
(`server/services/scheduleService.js:480`,
`server/domains/schedule/use-cases.js:177`). Decide durable cancellation states,
cutoff, queue order, auto-promotion versus acceptance, notification channel.

Acceptance: promotion atomic with capacity; retries cannot duplicate roster or
notification; started-session attendance never deleted.

## Dependencies And Ownership

- Rooms/instructors depend on E2 capacity semantics.
- Waitlists depend on E2 plus durable cancellation policy.
- No parallel implementation until file ownership is re-grepped.
- New models additive and soft-deletable where applicable; mutations audited.
- New strings English-only via `client/src/i18n/locales/en.json` and `t()`.

## Risks

| Risk | Likelihood x impact | Mitigation |
|---|---|---|
| Room double-book | Medium x Critical | Resource lock + concurrency test |
| Instructor authz leak | Medium x High | Atomic policy/query/attendance change |
| Waitlist oversubscription | Medium x Critical | Reuse capacity transaction |
| Hard-delete break | High x High | Durable status + dual-read grace |
| Duplicate notification | Medium x High | Persisted idempotency before send |

## Rollback And Compatibility

Keep `/api/schedules`, `Schedule`, `roomLink`, Cohort `teacherIds`, and current
reads during additive rollout. Old code ignores new refs. Never rewrite/delete
history without reversible manifest.

## Success Criteria

- [ ] Each gate has approved policy and measurable workflow.
- [ ] Caller/file inventory re-verified with file:line citations.
- [ ] Race, authz, migration, rollback, test matrices approved.
- [ ] No speculative implementation starts.

## Unresolved Questions

- Rooms exclusive, partitionable, or pooled?
- May session instructor differ from Cohort teacher?
- Waitlist FIFO, priority, or Admin-managed?
- Auto-promotion or learner acceptance?
