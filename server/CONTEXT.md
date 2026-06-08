# Server

The training-operations domain for TMS v2 / Internal LTMS. Glossary of terms specific to this context. Legacy Mongo model names are noted under `_Avoid_` where a platform term supersedes them.

## Scheduling & Booking

**Session**:
One scheduled delivery occurrence of a cohort's class — a single dated, time-bounded meeting that learners attend.
_Avoid_: Schedule (legacy model name), booking, meeting.

**Booking window**:
An allowed start–end time window a Session may occupy. The set of allowed windows is configured, not free-form; a Session's times MUST exactly match one window.
_Avoid_: slot (informal), timeslot, period.

**Weekly cap**:
The maximum number of Sessions one team may hold within a single ISO week. A team-based booking concept only — it does not apply to cohort-based sessions.
_Avoid_: limit, quota, max-sessions.

**Active member**:
A team member whose membership status is Active. Only Active members are snapshotted into a Session's roster (`enrolledUsers`) — both when a Session is first booked and when it is reassigned to a different team. Dropped/inactive members are excluded.
_Avoid_: enrolled user (that is the result of the snapshot, not the input), participant.

**Team-based session**:
A Session booked against a Team/Group (scheduling modes `leader_booking`, `admin_scheduled`). The Weekly cap and leader-authorization apply.
_Avoid_: group session.

**Cohort-based session**:
A Session booked against a Cohort with no team (scheduling modes `self_enroll`, `nomination`); the roster is snapshotted from the cohort's active enrollments. The Weekly cap and leader-authorization do not apply.
_Avoid_: classless session.
