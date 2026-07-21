# ADR: English scheduling is one canonical booking, actors differ by capability + resource scope

## Status

Accepted (2026-07-21). Builds on
[`english-domain-authority.md`](english-domain-authority.md) and
[`converge-to-one-training-model.md`](converge-to-one-training-model.md).

## Context

English live operations follow a phased product vision:

- **Now:** Admin/Coordinator are the primary operators — they input classes and
  Course Runs, schedule sessions, and mark attendance through the English
  Operations workspace (canonical `eng_*` model).
- **Future:** the PIC (Person In Charge of a class) self-registers sessions for
  their own class, while Admin/Coordinator keep marking attendance.

The obvious-but-wrong way to build the future step is to re-activate the legacy
"team-world" leader-booking grid (`/english?tab=book`, `/api/schedules/book-slot`,
the `leader_booking` scheduling mode) and let a leader/PIC book there. That path
writes into the generic `schedules`/`teams` tables, NOT `eng_meetings`. Running
it alongside the canonical Admin path re-creates two disconnected data stores —
exactly the split that caused the 2026-07-21 production incident (attendance
marked in `eng_attendance_records` while the HR export still read `attendances`;
`docs/incidents/2026-07-21-production-truncate.md` and the retired `/calendar`
page are the symptoms).

The codebase already prefers capability-based authorization over role checks
(`server/policy/capabilities.js`: routes ask *what* is allowed — `session.book` —
not *who*; per-user/db-stored grants are called out as the not-yet-built
extension point). The English domain already exposes one booking chokepoint and
an Employee↔User crosswalk.

## Decision

English scheduling has **one canonical write path** and separates *who may act*
from *what the action does*.

1. **One booking chokepoint.** All session create/reschedule/cancel go through the
   canonical English command layer (`domains/english-training` →
   `createCanonicalAttendanceSession` / `rescheduleCanonicalMeeting` /
   `cancelCanonicalMeeting`) writing `eng_*`. There is no second booking backend.

2. **Two-layer authorization, actor-agnostic command.**
   - *Capability (coarse):* the route requires `session.book`.
   - *Resource scope (fine):* a pure policy answers "may THIS actor book for THIS
     Course Run / cohort?".
   The command itself does not know or care which role called it.

3. **Actors differ only by capability grant + scope, never by data path.**

   | Phase | Actor | `session.book` grant | Resource scope |
   |---|---|---|---|
   | Now | Admin / Coordinator | role-derived, global | any cohort |
   | Future | PIC | granted to the PIC actor | only the cohort they are current PIC of (`eng_cohort_pic`) |

4. **Attendance is a separate capability and does not move.** Booking a session
   never confers attendance-marking. `attendance.mark` (and the facilitator gate)
   stay with Admin/Coordinator regardless of who booked.

5. **The future PIC self-service is an extension, not a rewrite.** It needs only:
   - the `eng_employees` ↔ `User` crosswalk to identify a user as a PIC;
   - one resource policy, `canPicBookForCourseRun(user, courseRun)`;
   - a scoped grant of `session.book` to the PIC actor;
   - a self-service UI that calls the SAME
     `POST /workspace/course-runs/:id/sessions` endpoint.
   No new table, no migration of session data, no revived grid.

## Consequences

- Adding a new scheduling actor is additive: one policy + one grant + one UI
  surface, all reusing the canonical command and `eng_*` tables.
- Reporting/attendance/exports have a single source of truth to read.
- The legacy team-world leader-booking subsystem stays **dormant reference only**
  (its slot-window, 2-per-week cap, and auto-enroll logic are worth re-studying),
  and is never re-wired as a live booking path. Its eventual retirement is a
  separate, owner-gated cleanup — not required for this decision.

## Guardrails

- One canonical model; never introduce a parallel booking backend or a second
  attendance store.
- Differentiate actors with capability + resource-scope policy, not by giving a
  new actor its own data path.
- A new self-service UI must call the existing canonical endpoint; it must not
  reach the generic `schedules`/`teams` tables.
- Booking capability and attendance capability remain distinct.
