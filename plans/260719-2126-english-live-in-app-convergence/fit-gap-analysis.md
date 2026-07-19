# Fit / Gap — English Training vs the generic training model

How each English concept maps onto the generic domains, what fits, what is
missing, and the decision. Feeds the phase files. Grounded in the code as of
2026-07-19 (`domains/english-training/*`, `domains/learning`, `domains/schedule`,
`domains/attendance`, `domains/assessment`, `evaluation`).

Legend — **Fit:** generic model already supports it · **Gap:** needs new work ·
**Decision:** the chosen resolution.

## 1. Learner (person)

- **English today:** `eng_employees` (308) — business records; `user_id` column
  exists but 0/308 populated; import sets it null. Not `users`, cannot log in.
- **Generic home:** `users`. Attendance/enrollment/schedule rosters all FK to it.
- **Fit:** users model already carries emp_code, org (department/office), status.
- **Gap:** English learners are not users; owner wants them to **not log in**.
- **Decision:** create/link a `users` row per English learner, **authentication
  disabled** (present in rosters/reports, cannot sign in). Link by `emp_code`.
  Provision the missing ones as managed directory records. This is Phase 0 and
  gates everything. Keep `eng_employees` as the archive's identity table.

## 2. Login-disabled account state

- **Gap:** ConCho2 has no "exists but cannot authenticate" account state today.
- **Decision (P0):** add a minimal, explicit flag (e.g. `canLogin=false` /
  `accountType='managed'`) that `middleware/auth.js` and the login path refuse
  **before** password logic — never a silent weakening. Audited. Exact field vs.
  reusing an inactive/status column decided in P0 (see plan open question 2).

## 3. English course → Program

- **English today:** `eng_courses` — code, name, `expected_units`,
  `max_absences_allowed`; a course repeats as a `eng_course_runs` row per class.
- **Generic home:** `LearningProgram` (+ the cohort is one run of it).
- **Fit:** program→cohort→session spine already models "a course delivered N times".
- **Gap:** `expected_units`, `max_absences_allowed`, the ≤2-absence exam-sit gate,
  13 ordered levels are English-specific.
- **Decision:** English course = `LearningProgram` with an **English policy block**
  (absence allowance + exam gate + level scale) as program config — not a schema
  fork. `schedulingMode = admin_scheduled` (HR/Teacher create, not leader-booked).

## 4. English class → Cohort

- **English today:** `eng_cohorts` (class_code, status) + `eng_cohort_memberships`
  (learner in class) + `eng_cohort_pic` (Person-In-Charge).
- **Generic home:** `Class`/cohort + its enrollment + teacher/facilitator binding.
- **Fit:** cohort + membership is a direct match.
- **Gap:** **PIC** has no generic equivalent; PICs are Person-In-Charge, not
  teachers (see memory `feedback_pic_not_teacher`).
- **Decision:** map PIC to a cohort **facilitator/owner binding** or a custom field
  (custom-field domain exists) — decide in P1; do **not** mislabel PIC as teacher.

## 5. English session → Schedule

- **English today:** `eng_session_units` (session_number, held_at, status) under a
  course run; import-only.
- **Generic home:** `Schedule` via `domains/schedule` — owner chose the **full
  booking grid** (rooms, calendar invites, conflict guard, capacity).
- **Fit:** schedule domain already does admin-created sessions with rooms/calendar/
  conflict; `schedulingMode=admin_scheduled` is enforced at the `bookSlot`
  chokepoint.
- **Gap:** English sessions are numbered within a run (`session_number`) — a
  sequence concept the generic session may not carry.
- **Decision:** live English sessions = `Schedule` rows created by HR/Teacher via
  the booking grid; carry the run/sequence as session metadata. Historical
  `eng_session_units` stay in the archive (not migrated).

## 6. Attendance

- **English today:** `eng_attendance_records` (5,962) — import-only; per
  session_unit × run_enrollment; `present`/`absent`/`unmarked`.
- **Generic home:** `domains/attendance` — live marking, facilitator-assignment
  gate, audit.
- **Fit:** same shape (roster × session, present/absent). Live marking + audit +
  soft-delete already built.
- **Gap:** the ≤2-absence **eligibility projection** is an English rule.
- **Decision:** live attendance = `domains/attendance`. Eligibility stays a
  **read projection** over generic attendance (reuse the shared
  `ELIGIBILITY_STATUS_SQL` idea). Historical attendance stays archived.

## 7. Enrollment

- **English today:** `eng_run_enrollments` (learner in a course run;
  status/start_session/dq meta).
- **Generic home:** generic `Enrollment` (already converged read+create per the
  domain-model doc).
- **Fit:** strong — one enrollment concept, group/direct modes exist.
- **Gap:** English "start_session_number" (join mid-run) is English-specific.
- **Decision:** generic `Enrollment`; carry start-session as enrollment metadata.

## 8. Level / exam result

- **English today:** `eng_levels` (13 ordered), `eng_exam_results` (one active
  level per enrollment, ≤2-absence gate, audited, soft-delete). UI: Evaluation tab.
- **Generic home:** `Evaluation`/`assessment` — **already partly converged**
  (unified `GET /api/assessment/results/mine`, ADR Phase 1).
- **Fit:** evaluation already models an instructor-scored result; unified read
  exists.
- **Gap:** the ordered **13-level scale** + the ≤2-absence sit-gate are English
  rules; generic assessment is rubric/quiz-shaped.
- **Decision (P4):** represent levels as a program-scoped ordered scale on the
  evaluation/assessment path; keep the ≤2-absence gate as program policy. Open
  question: config vs. normalise onto the generic rubric (plan open question 1).

## 9. Data-quality issues + import pipeline

- **English today:** `eng_data_quality_issues` (182 open), `raw_eng_workbook_rows`,
  `import/*` pipeline, corrections overlay.
- **Decision:** import + DQ + corrections belong to the **archive** — retained
  read-only for history/audit. Live data is created in-app and never re-imported,
  so DQ issues do not propagate into the live model. Import is **not** the primary
  path after P5; do not decommission it before the live paths replace it.

## Summary — convergence is highly feasible

The generic model already provides program/admin_scheduled + booking grid +
attendance + enrollment + evaluation. English needs mostly **configuration + a few
policy bits** (absence allowance, exam gate, level scale, PIC binding) and one
genuinely new primitive: the **login-disabled user**. No second live subsystem is
warranted.

## Rejected alternatives

- **Build the live layer on `eng_*`:** a second live training world — rejected
  (DRY + contradicts the convergence ADR + doubles security/reporting).
- **Big-bang migrate history into the live model:** owner chose freeze-and-archive;
  avoids back-filling 182 DQ issues and messy historical rows into live tables.
- **Give every learner a real login:** owner scoped out self-service; ~1000
  accounts + self-enroll flows are unnecessary for an HR/Teacher-operated system.
