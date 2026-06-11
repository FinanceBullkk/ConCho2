# Phase 2 — Coordinator-scheduled session flow (primary UX)

## Context Links
- ADR: [`coordinator-scheduled-offline-model.md`](../../docs/decisions/coordinator-scheduled-offline-model.md)
- Plan: [`plan.md`](./plan.md) · Depends on **Phase 1** (Office + Coordinator role).
- Grounding: `server/services/scheduleService.js` (`adminCreate`, `bookCohortSlot`), `server/domains/schedule/scheduling-mode-policy.js`,
  `server/domains/learning/assignment/`, client `/me/catalog`, booking pages (`BookClassPage`, `CalendarGrid`).

## Overview
- **Priority:** high · **Status:** ✅ done 2026-06-10 (roster model = cohort/team-less, confirmed with owner; server 738/75, client 220/47, lint cap, build clean)
- Make **`admin_scheduled` the first-class create flow**: a **Coordinator** opens a Session by choosing
  **course (Program/Cohort) + Office + time + Trainer** (Room placeholder until Phase 3), then opens it for
  **self-enrol** / **coordinator-assign**. **Demote `leader_booking`** in the UI (keep the backend mode intact).
- Mostly **wiring existing backend** (admin_scheduled is already enforced; self-enrol catalog + Assignment +
  admin-enroll already exist) + a new coordinator-facing create surface + attaching `officeId`.

## Key Insights (grounded)
- `scheduleService.adminCreate` already creates an admin-scheduled session; `scheduling-mode-policy.js` already
  **enforces** `admin_scheduled` (leader self-booking an admin_scheduled program → 403). So the server path exists —
  this phase is the **coordinator UI + Office attachment + demoting the leader grid**, not new booking logic.
- Roster mechanisms already exist and are the two the owner chose (grill #2): **self-enrol** (`/me/catalog` →
  `/api/learning/enrollments` self path) and **coordinator assign** (`domains/learning/assignment` + admin enroll).
  No "Team snapshot" needed.
- The current booking UX centers on `BookClassPage` (leader grid). Per grill #1 that is the **legacy** path; the new
  primary UX is a **coordinator "Create session" form**, with the leader grid kept but de-emphasised/secondary.
- `Schedule.officeId` (Phase 3 schema) is **set here at create**: a coordinator session always picks an Office. Pin the
  rule so Phase 3's `assertSameOffice` can never be bypassed by a null Office (review M2).

## Requirements
**Functional**
- FR1 — A Coordinator/Admin MUST create a Session via an `admin_scheduled` flow choosing course + **Office** + time
  (+ Trainer in Phase 3); `session.book` capability. The created Session carries `officeId`.
- FR2 — The session create flow MUST support both roster modes: open for **self-enrol** (learner catalog) and/or
  **coordinator assign** (assign individuals; department-target reuses the Assignment feature).
- FR3 — The booking UI MUST present the **coordinator create flow as primary**; the leader self-booking grid is kept
  but secondary (shown only for `leader_booking` programs / explicitly). No backend mode removed.
- FR4 — `officeId` MUST be required at coordinator create (even though the column is nullable for legacy rows).
- FR5 — Per-course config "enrol per course vs per session" surfaced (default: multi-session→course; single→session).
  *(Toggle location = open question; default applies until set.)*

**Non-functional**
- NF1 — No change to the enforced mode policy or transactions; regression (booking/mode/reassign) green.
- NF2 — English-only strings; audit on create; capability-gated (Coordinator + Admin).

## Architecture
**Data flow (create)**
Coordinator → "Create session" form (course, Office, time, roster mode) → `POST` admin-create →
`scheduleService.adminCreate` (mode policy + window + capacity already enforced) → Session persisted with `officeId`
→ opened for self-enrol and/or assignment. Calendar/email stay post-commit fail-soft.

**Roster**
- Self-enrol: existing `/me/catalog` + `/api/learning/enrollments` (self).
- Assign: existing `domains/learning/assignment` (individuals + department targets) + admin enroll.

**UI**
- New coordinator **Create-session** surface (in Learning or a Calendar view): course picker → Office picker →
  time (exact slot grid from E1) → roster mode. Leader `BookClassPage` grid demoted to a secondary entry.

## Related Code Files
**Modify**
- `server/services/scheduleService.js` (`adminCreate` accepts/sets `officeId`) · `server/domains/schedule/*` (DTO exposes office)
- `server/domains/learning/session/` (create payload/schema: add `officeId`, optional trainer in Phase 3)
- client: new `CreateSessionModal`/coordinator create surface; demote `BookClassPage` grid; `learningAPI`/`scheduleAPI`
  create method; query keys; en.json strings; `useRole` (Coordinator can create)
- tests: `server/tests/integration/` admin-create-with-office happy + non-coordinator deny + mode-conflict; client create-form test
**Create**
- client `CreateSessionModal` + hook
**Reuse (no change)**
- `scheduling-mode-policy.js`, self-enrol catalog, `assignment` domain

## Implementation Steps
1. Add `officeId` to the admin/coordinator session-create payload + schema + DTO (depends on Phase 1 Office).
2. Build the coordinator **Create-session** UI (course → Office → exact-slot time → roster mode); gate by `session.book` (Coordinator/Admin).
3. Wire roster: link to self-enrol (catalog) + assign (Assignment/admin enroll) from the created session.
4. Demote the leader grid: show `BookClassPage` only for `leader_booking` programs / as a secondary action.
5. Enforce `officeId` required at coordinator create (server validation); keep column nullable for legacy.
6. Surface the per-course enrol-granularity config with the documented default.
7. DoD: tests + lint green; update roadmap + scheduling spec; commit.

## Todo
- [x] `officeId` on the cohort create path (Schedule model + bookCohortSlot + session DTO + schema)
- [x] Coordinator Create-session UI (cohort→office→exact-slot), `book:session`-gated
- [x] Roster wiring — reuses self-enrol catalog + assignment (cohort snapshot at create; team-less)
- [x] Demote leader grid — kept as-is (already mode-gated; Coordinator Calendar nav stays off until later)
- [x] Require officeId at coordinator create (server: 400 missing, 422 unknown)
- [ ] Enrol-granularity config + default — **deferred** (ADR open question; no owner decision yet)
- [x] Tests + docs + commit

**Decision (2026-06-10):** roster model = **cohort / team-less** (owner chose "mở lớp,
tự đăng ký + chỉ định"). Coordinator-scheduled offline sessions target a
`self_enroll`/`nomination` cohort via `bookCohortSession`; `admin_scheduled`
(team mode) stays for teams but is not the offline create surface. The Admin-only
checks on cohort booking + the `admin_scheduled` team gate were widened to a
scheduler set {Admin, Coordinator}.

## Success Criteria
- A Coordinator opens an offline Session (course + Office + time), then learners self-enrol and/or the Coordinator assigns them.
- A Participant cannot create a Session (403); leader grid no longer the default surface.
- Created Sessions always have `officeId`. Regression suite (mode/booking/reassign) green.

## Risk Assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Nullable `officeId` lets a room-less/office-less session slip through, breaking Phase 3 `assertSameOffice` | Med×High | server requires `officeId` at coordinator create; Phase 3 forbids Room assignment when `officeId` null |
| Demoting leader grid breaks existing leader_booking users | Low×Med | keep backend mode + grid for `leader_booking` programs; gate by effective mode |
| Coordinator create bypasses mode policy | Low×High | reuse `adminCreate` chokepoint (policy already enforced); add deny test |

## Security Considerations
- Create gated by `session.book` (Coordinator + Admin via Phase 1 bundle); audit on create; mode policy unchanged.
- UI demotion is UX only — server mode enforcement remains the security boundary.

## Next Steps / Dependencies
- Needs **Phase 1** (Office + Coordinator). Feeds **Phase 3** (Room pick within the Session's Office + Trainer).
- Resolve open questions: enrol-granularity toggle location; offline attendance/completion (no quiz).
