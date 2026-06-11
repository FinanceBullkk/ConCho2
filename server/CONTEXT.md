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

**Scheduling mode**:
A Program attribute deciding who creates a Session and how: `leader_booking` (team leader self-books), `admin_scheduled` (only an Admin books the team's sessions), `self_enroll` / `nomination` (Admin schedules cohort sessions). It reaches a Session via the Cohort's program link; when no program is linked it falls back to `leader_booking`.
_Avoid_: booking mode, session type.
_Primary real-world flow_: `admin_scheduled` (a Training coordinator opens sessions). `leader_booking` is a legacy English-class mode, kept as a secondary option.

## Organisation & People

**Office**:
A physical site/location where training is delivered (e.g. "Hanoi Office"). A small managed set (currently 2–3). Distinct from Department. Every Room belongs to exactly one Office; a Session is delivered at one Office. An employee has a home Office (may be unknown until Directory sync populates it).
_Avoid_: site, branch, location, campus (use "Office"); do NOT conflate with Department.

**Department**:
A logical org unit an employee belongs to (e.g. "Production"), independent of physical Office. Used for org hierarchy, assignment targeting, and reporting.
_Avoid_: team (that is a different legacy concept), office.

**Training coordinator**:
The person who runs training operations: opens Sessions (course + Office + Room + time + Trainer), manages Programs/Cohorts, assigns or approves learners, and reads reports. Holds those capabilities WITHOUT full Admin powers (no user-account management, MFA, or security settings). Granted via the capability layer, not the Admin role.
_Avoid_: admin (an Admin is broader), organiser.

**Trainer**:
The person who delivers a Session. Either an internal employee (a User) or an external person represented lightly by name + contact only (no account, no system access). Assigned per Session.
_Avoid_: teacher (legacy, cohort-level), instructor, facilitator — prefer "Trainer".

## Legacy concepts (kept for compatibility, not used in the coordinator-scheduled flow)

**LearningGroup / Team**:
A pre-built group of learners with a leader, used by the legacy `leader_booking` flow to snapshot a Session roster. In the coordinator-scheduled offline flow the roster comes from self-enrolment + coordinator assignment instead, so Team is largely vestigial.
_Avoid_: relying on Team for new offline-training work.
