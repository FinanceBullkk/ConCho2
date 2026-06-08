# Research Report: Wave E Generic Scheduling Phase 1

---
date: 2026-06-06
role: researcher
branch: main
commit: 501c63d
scope: read-only architecture research
---

## Summary

**Recommendation:** Phase 1 should make existing configured time windows authoritative
end-to-end. Support exact start/end minutes and duration from scheduling config while
preserving every current booking, roster, attendance, calendar, email, and API contract.

Do not start with waitlists, room conflict enforcement, or session-level instructors.
Those features depend on unresolved capacity, roster, cancellation, and resource-locking
semantics.

No application files changed. Tests not run; findings come from current code, tests,
ADRs, and roadmaps.

## Source Credibility

| Source | Weight | Reason |
|---|---:|---|
| Current server/client code at `501c63d` | Highest | Runtime truth |
| Integration/unit tests | High | Pin authorization, race, roster, attendance, reminder behavior |
| Accepted ADRs | High | Locked architecture and compatibility direction |
| `current-system-map.md`, `system-overview.md` | Medium-high | Recent code-truth summaries |
| Roadmaps/gap analysis | Medium | Product intent, not runtime proof |
| `README.md` | Medium-low | Useful workflow context; contradicted by current code/tests in places |

No external sources used. This is repository-specific architecture research; no new
technology or dependency is recommended.

## Architecture Map

### Persistence

- `server/models/Schedule.js`
  - Physical session record remains `Schedule`.
  - `classId`, optional `bookedTeamId`, `startTime`, `endTime`, `roomLink`,
    `capacity`, roster snapshot `enrolledUsers`.
  - Calendar/reminder state: `googleEventId`, `meetLink`, `remindersSentAt`.
  - Unique `{ classId, startTime }`; overlap checks remain application-level.
- `server/models/LearningProgram.js`
  - Four `schedulingMode`s already live.
  - `capacityPolicy` and `facilitatorPolicy` exist but are not enforced by session booking.
- `server/models/Class.js`
  - Legacy `Class` is Cohort.
  - `teacherIds` is cohort-level facilitator assignment and teacher authorization scope.
- `server/models/Team.js`
  - Team membership changes transactionally rewrite future schedule rosters.
- `server/models/Enrollment.js`
  - Supports team and team-less cohort enrollments.
- `server/models/Attendance.js`
  - Attendance identity is `{ scheduleId, userId }`.

### APIs and ownership

- Legacy surface: `server/routes/scheduleRoutes.js` ->
  `server/controllers/scheduleController.js` -> `server/services/scheduleService.js`.
- Platform surface: `server/domains/learning/session/*` under `/api/learning/sessions`.
- Extracted admin update/delete logic: `server/domains/schedule/*`.
- Client calendar still uses `/api/schedules/*` through
  `client/src/api/api.js` and `client/src/hooks/useSchedules.js`.
- No client caller currently reaches `/api/learning/sessions`.

### Booking modes

`server/domains/learning/session/use-cases.js`:

- `leader_booking`: Team Leader/Admin books against `groupId`.
- `admin_scheduled`: Admin books against `groupId`.
- `self_enroll`: Admin books team-less session against `cohortId`.
- `nomination`: Admin books team-less session against `cohortId`.

Both team and cohort booking delegate into `server/services/scheduleService.js`.

## Invariants to Preserve

1. **Physical compatibility:** keep `Schedule`, `Class`, and `Team` collection names.
2. **API compatibility:** keep `/api/schedules` vocabulary and behavior while adding
   platform behavior under `/api/learning`.
3. **Race safety:** retain transactions, Team write-lock for weekly cap, overlap checks,
   and unique `{ classId, startTime }` fallback.
4. **Leader flow:** non-admin booking requires matching `Team.leaderId`.
5. **Mode enforcement:** team modes use Group; cohort modes use Cohort; only Admin can
   create cohort sessions.
6. **Roster snapshot:** `Schedule.enrolledUsers` remains authoritative for attendance,
   participant read scope, reminders, calendar attendees, completion/report learner set.
7. **Future-only roster mutation:** team/user/enrollment changes may alter future
   schedules; past rosters remain evidence.
8. **Attendance evidence:** started sessions cannot be cancelled/deleted through normal
   routes; users not in the schedule roster cannot receive attendance.
9. **Side-effect order:** local Schedule commit first; Calendar/email remain fail-soft.
10. **Security:** auth, capability/role gate, resource checks, CSRF, rate limit, audit,
    and i18n remain mandatory.
11. **Completion semantics:** every Schedule for a cohort currently counts toward the
    completion denominator.
12. **Reminder idempotency:** `remindersSentAt` continues to gate one reminder batch per
    schedule.

## Key Compatibility Risks

### Critical

1. **Configured slots are not authoritative in non-admin UI.**
   - `GET /api/settings` is Admin-only.
   - `useTimeSlots()` is used by Participant and Teacher pages, so failed reads silently
     fall back to five hard-coded slots.
   - Server test config already uses 90-minute windows, but Participant booking rebuilds
     every slot as `hour + 1`.

2. **Calendar grid assumes integer-hour starts.**
   - `CalendarGrid` accepts `number[]` hours.
   - Booking, schedules, and attendance key cells by hour.
   - Minute-offset starts or two windows in one hour cannot render reliably.

3. **Capacity is metadata, not an invariant.**
   - Main booking paths do not reject roster > `Schedule.capacity`.
   - Team roster sync can push beyond capacity.
   - `LearningProgram.capacityPolicy` is not consumed by scheduling.
   - Enforcing it immediately risks breaking existing teams and future roster edits.

4. **Roster changes do not update Calendar attendees.**
   - Team/enrollment sync rewrites `enrolledUsers`.
   - Calendar update is only called by schedule update, not roster sync.

### High

5. **Collision semantics differ between client and server.**
   - Server conflicts are scoped to `classId`.
   - Participant booking loads all availability and treats any session as a blocker.
   - Different cohorts can legally overlap server-side but appear globally occupied.

6. **Admin update bypasses allowed-slot validation.**
   - Create/book paths validate `ALLOWED_TIME_SLOTS`.
   - `domains/schedule/use-cases.js` update checks only `end > start`, collision, and
     weekly cap.

7. **Instructor means Cohort today, not Session.**
   - Teacher visibility and attendance authorization use `Class.teacherIds`.
   - Session-level instructor assignment would require policy, calendar, attendance,
     list/query, and UI changes together.

8. **Location is conflated.**
   - `roomLink` represents room or URL.
   - Calendar may create a separate `meetLink`.
   - Reminder email sends `roomLink`, not `meetLink`.

### Medium

9. Booking confirmation email goes only to the request actor; cancellation/reminders go
   to the roster. README states all members receive booking confirmation.
10. Future cancellation hard-deletes Schedule; no cancellation lifecycle/status exists.
    Waitlists and notification audit will need a durable cancellation decision first.
11. Cohort sessions snapshot active enrollments at creation; later cohort enrollment does
    not automatically join existing future sessions.
12. Completion counts every cohort Schedule, not learner-eligible sessions. Session types
    such as optional/open office hours could lower completion incorrectly.

## Ranked Options

| Rank | Slice | User value | Complexity | Performance | Maintenance | Migration/cost | Adoption risk | Architectural fit |
|---:|---|---|---|---|---|---|---|---|
| 1 | Exact config-driven session windows | Medium-high | Medium | Neutral | Low | No data migration; no dependency | Low | Excellent |
| 2 | Canonical Learning Sessions UI/API only | Medium | Medium | Neutral | Medium | No data migration | Low-medium | Excellent, but does not remove fixed-slot rigidity |
| 3 | Enforce existing capacity policy | High | Medium-high | Low overhead | Medium-high | Data audit/backfill required | High | Good after roster semantics are explicit |
| 4 | Room + session instructor resources/conflicts | High | High | More conflict queries/locks | High | New models/indexes/UI | High | Good later |
| 5 | Waitlist | High | Very high | Queue/fan-out overhead | Very high | New lifecycle, notifications, audit | Very high | Poor until capacity/cancellation settle |

No community/abandonment risk applies: Rank 1 adds no library or service. Existing
Express, Mongoose, React Query, and React stack remains unchanged. Risk is internal
contract breakage, not third-party maturity.

## Recommended Phase 1 Boundary

### Phase E1: Exact Scheduling Windows and Compatibility Baseline

**Goal:** remove the hidden fixed-one-hour frontend assumption and make the existing
configured windows work for all roles, without changing persistence or roster behavior.

### In scope

1. Add a protected, read-only scheduling-config endpoint under the Learning/session
   domain. Return only safe scheduling data, not all system settings:
   - exact start/end hour+minute;
   - stable slot ID/label;
   - timezone;
   - current legacy weekly team cap for display.
2. Centralize exact-slot validation in the Schedule domain and reuse it from:
   - leader team booking;
   - cohort booking;
   - legacy admin create;
   - time-changing admin update.
3. Refactor shared calendar rows from integer hours to exact slot descriptors.
4. Update all three consumers:
   - Admin Schedules;
   - Teacher Attendance;
   - Participant Booking.
5. Participant booking must submit the exact configured end time. Remove `hour + 1`.
6. Scope booking availability to the selected Team's Cohort/Class, matching server
   collision semantics.
7. Keep legacy/off-policy sessions visible as read-only derived rows so historical or
   imported data is not hidden.
8. Preserve both legacy `/api/schedules` and platform `/api/learning/sessions`.
9. Add focused server and client tests plus manual smoke documentation.

### Explicitly out of scope

- New `Room`, `SessionType`, `Waitlist`, or session-instructor models.
- Capacity enforcement or program capacity-policy changes.
- Changes to `Schedule.enrolledUsers` ownership/snapshot behavior.
- New collision dimensions beyond Cohort/Class.
- Changes to `{ classId, startTime }` unique index.
- Cancellation lifecycle/soft-delete redesign.
- Calendar retry/outbox or notification-log redesign.
- Legacy route removal or physical collection rename.
- Arbitrary free-form start times; Phase 1 supports configured windows only.

### Likely files

Backend:

- `server/domains/learning/routes.js`
- `server/domains/learning/session/controller.js`
- `server/domains/learning/session/use-cases.js`
- `server/domains/learning/session/repository.js`
- `server/domains/learning/session/dto.js`
- `server/domains/schedule/use-cases.js`
- `server/services/scheduleService.js`
- `server/controllers/settingController.js` only if config read is delegated

Frontend:

- `client/src/api/api.js`
- `client/src/hooks/useTimeSlots.js` or replacement scheduling-config hook
- `client/src/components/CalendarGrid.jsx`
- `client/src/pages/BookClassPage.jsx`
- `client/src/pages/SchedulesPage.jsx`
- `client/src/pages/AttendancePage.jsx`
- `client/src/i18n/locales/en.json`

Tests:

- `server/tests/integration/booking.test.js`
- `server/tests/integration/bookingRace.test.js`
- `server/tests/integration/learningSessionRoutes.test.js`
- `server/tests/integration/settings.test.js`
- focused client tests for exact slot rendering and request payloads

### Acceptance tests

1. Participant/Teacher/Admin can read safe scheduling config; general Settings remains
   Admin-only.
2. Existing five one-hour production defaults render and book unchanged.
3. A configured 90-minute window books through legacy and Learning APIs with exact end.
4. A minute-offset window renders and submits exact minutes.
5. Invalid windows fail consistently on all create/update paths.
6. Same Cohort overlap returns 409; same time in another Cohort remains allowed.
7. Concurrent identical booking still yields exactly one success.
8. Weekly two-session Team cap remains race-safe.
9. Attendance roster and completion results remain unchanged.
10. Historical/off-policy session remains visible but cannot be newly booked.

## Follow-on Order

1. **E1:** exact config-driven windows.
2. **E2:** capacity integrity: audit/backfill, program/session precedence, enforcement,
   roster mutation rules.
3. **E3:** first-class room and session-facilitator assignment with resource locking.
4. **E4:** waitlist + promotion + durable notification/audit lifecycle.
5. **E5:** session types and completion eligibility after HR defines concrete types.

## Limitations

- No production database inspected; unknown whether any roster exceeds capacity 9.
- No Google Workspace or SMTP integration exercised.
- Tests were read, not executed.
- No performance benchmark run.
- HR requirements for actual room, capacity, waitlist, and instructor workflows remain
  unconfirmed.

## Unresolved Questions

1. Which concrete non-English training workflow needs Wave E first?
2. Are configured windows global, program-specific, or location-specific?
3. Can the same room host multiple partitions/resources?
4. Does capacity mean seats, approved enrollments, or checked-in attendees?
5. Should late cohort enrollment join already-scheduled future sessions?
6. Are session instructors allowed to differ from Cohort `teacherIds`?
7. Should optional session types count toward completion denominator?

**Status:** DONE_WITH_CONCERNS
**Summary:** Safest Phase 1 is exact config-driven scheduling windows with shared validation and slot-aware UI. It has no schema migration and preserves current leader booking, roster, attendance, Calendar, reminder, and API contracts.
**Concerns/Blockers:** Full Wave E requirements remain unconfirmed. Capacity is currently unenforced; Calendar attendee sync and notification semantics have known gaps that must be handled before rooms/waitlists/instructor expansion.
