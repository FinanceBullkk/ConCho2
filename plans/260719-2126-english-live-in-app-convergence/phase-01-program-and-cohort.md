# P1 — English Program + course-run Cohort

**Priority:** High; first live training aggregate · **Status:** 🟢 implemented

**Context:** [plan.md](plan.md) · [fit-gap §4–7](fit-gap-analysis.md)

## Objective

Create English Programs and live course runs on the correct generic grain. One
English course is a `LearningProgram`; one delivery of that course is a generic
Cohort (`Class`). The familiar stable English class/group remains presentation
context, not the Cohort itself.

## Locked mapping

- Course → `LearningProgram` with `category=english` and
  `schedulingMode=nomination`.
- Course Run → generic Cohort under that Program.
- Stable class/group code → typed `englishGroupCode` on each course-run Cohort;
  the English workspace groups runs by this code.
- Run learner → direct generic Enrollment (`teamId=null`). No legacy Team is
  created for live English.
- PIC → informational English delivery metadata, not `teacherIds`, trainer
  assignment, or an authorization principal.

## Typed policy

- Extend the Program contract/storage with a validated English policy:
  `maxAbsencesAllowed` plus the ordered 13-level scale (code, display name,
  order). Do not store this in arbitrary Custom Fields.
- Snapshot the policy onto the Cohort at run creation. Attendance eligibility
  and final-level validation read the snapshot, so later Program edits apply only
  to future runs.
- Validate that the policy exists only for `category=english`, level codes/orders
  are unique, and the absence allowance is non-negative.

## Enrollment behavior

- Admin/Coordinator select existing/managed learners and bulk-enroll them into
  the course-run Cohort.
- Add validated `startSessionNumber` enrollment metadata for a learner joining
  mid-run; expose it through DTO/reporting and use it to distinguish pre-join
  sessions from genuinely unmarked attendance.
- Copying a stable group's roster is an explicit UI convenience that invokes
  generic bulk Enrollment. It does not create a durable parallel membership
  table.

## Workspace entrypoint

- Add **Classes** to English Operations.
- The list is class-centric: group by `englishGroupCode`, then show its course
  runs. Opening a run shows Program, policy snapshot, PIC display, roster, and
  session/evaluation placeholders.
- Create flow asks for Program, stable group code, run code/dates, PIC display,
  and selected learners. Generic Cohort remains the write target.

## Authorization

- Admin/Coordinator: create/update English Programs, course-run Cohorts, and
  Enrollments through existing management capabilities and resource policy.
- Assigned Teacher: read their English run/roster only; cannot create Program,
  Cohort, or Enrollment.
- Participant/managed learner: no English Operations access.

## Tests

- Create English Program + run Cohort; policy snapshot is exact and remains
  unchanged when the Program policy later changes.
- Two runs for the same stable group and different Programs are allowed and group
  together in the workspace.
- Duplicate active run code and duplicate enrollment are rejected.
- Managed users enroll successfully; mid-run start metadata round-trips.
- Teacher mutation and unrelated-teacher read are denied; PIC never grants
  teacher permissions.

## Success / DoD

- Staff can create and open an English class/course-run in its own workspace,
  with generic Enrollments and the correct policy snapshot.
- No Team or `eng_course_runs` live write is introduced.
- Audit, permission denial, edge-case tests, lint, and manual smoke pass.
- Update `english-training`, `learning-catalog`, `enrollment`, and
  `capability-authz` specs when this phase ships.
