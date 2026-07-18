# English Integration — Phase 3: Exam Result & Level (Evaluation)

- **Status:** planned (not started) — rules confirmed with owner 2026-07-19.
- **Decision source:** `plans/reports/eng-phase3-hr-decisions-260719.md`
- **Depends on:** Phase 1 (identity/structure) + Phase 2 (sessions/attendance/
  eligibility), both shipped on dev (PR #322).

## 1. Goal

Turn "attended enough" into "took the exam → achieved a level". HR records, for
each learner who finishes a course run, **which level** they reached. The system
blocks recording for anyone who is **not eligible to sit** the exam.

## 2. Confirmed rules (owner, 2026-07-19)

- **Completion = passing a final exam; the exam result IS a level.** No numeric
  score, **no fail state** — everyone who sits gets some level.
- **Exam-sit gate:** a learner with **more than 2 absences** in the course run
  **cannot sit** the exam (≤2 = eligible). Blanket max of 2 for every course
  (the per-course `max_absences_allowed` stays as historical data, not the gate).
- **13 ordered levels** (rank 1→13): Foundation, Beginner, Beginner 2,
  Beginner 3, Pre-Intermediate, Pre-Intermediate 1, Pre-Intermediate 2,
  Pre-Intermediate 3, Intermediate, Intermediate 1, Intermediate 2,
  Upper-Intermediate, Advanced.
- **Who enters:** HR / Admin (operate as Admin/Coordinator users — no new role).
- **Entry method:** a manual screen in the app (not a file import).
- **Completed-run nudge:** for course runs already **completed**, the app should
  **prompt HR to fill in levels** — surface a "needs level" worklist of learners
  who are eligible to sit (≤2 absences) but have no exam level yet. This is a
  reminder/highlight only; the app does **not** auto-pick a level (no score to
  derive one from) — HR still chooses.
- **Certificates:** out of scope — HR issues them separately in another file.

## 3. Data model (new)

Migration `039_english_training_evaluation.js`:

- **`eng_levels`** — reference table, seeded with the 13 levels.
  `id, code (unique), display_name, rank (int, unique), is_active`.
  `code` is a stable slug (e.g. `pre_intermediate_2`); `rank` gives order.
- **`eng_exam_results`** — one exam outcome per run enrollment.
  `id, run_enrollment_id (FK eng_run_enrollments, unique), level_id (FK
  eng_levels), exam_date (date), entered_by (text — user id), note (text null),
  created_at, updated_at, is_deleted (bool default false), deleted_at`.
  Unique on `run_enrollment_id` (one active result per enrollment; re-recording
  updates it). Soft-delete per platform rule; audit every mutation.

Rationale: keying on `run_enrollment_id` (not employee+run) reuses the existing
learner↔run link and inherits its course-run/absence context for the gate.

## 4. Backend (extend `server/domains/english-training/`)

- **`repository.pg.js`** (extend): `listLevels()`, `getEnrollmentForExam(id)`
  (returns enrollment + course_run + `absence_count`), `getExamResult(enrollmentId)`,
  `upsertExamResult({...})`, `softDeleteExamResult(id)`.
- **`evaluation.js`** (new use-cases): `recordExamResult({ runEnrollmentId,
  levelCode, examDate, note, actor })` —
  1. load enrollment + absence_count; 404 if missing;
  2. **gate:** `absence_count > 2` ⇒ throw `ServiceError(422, 'Not eligible to
     sit the exam (more than 2 absences)')`;
  3. resolve `levelCode` → level id; 400 if unknown;
  4. upsert result; return before/after for audit.
- **`reads.pg.js`** (extend): course-run detail roster gains `examLevel` +
  `examDate` per learner; `listEligibility` exam-sit flag uses the fixed rule
  (`absence_count <= 2`), which also fixes review finding F2 (NULL snapshot).
  Add **`listPendingExamEntries()`** — learners on **completed** course runs who
  are eligible to sit (≤2 absences) but have **no exam result yet**, grouped by
  course run with a per-run count (drives the completed-run nudge worklist).
- **`controller.js`** (extend): `listLevels`, `recordExamResult`,
  `deleteExamResult`; standard envelope + `auditService.record` on writes.
- **`routes.js`** (extend), all under the existing `Admin`/`Coordinator` +
  `report.read` router:
  - `GET  /levels`
  - `GET  /pending-exam-entries`  (completed-run nudge worklist)
  - `POST /enrollments/:id/exam-result`  → `requireCapability('enrollment.manage')`
  - `DELETE /enrollments/:id/exam-result` → `requireCapability('enrollment.manage')`
- **`schemas.js`** (extend): `examResultBody = { levelCode: enum(13 codes),
  examDate: iso date, note?: string ≤500 }`; `idParams` reused for `:id`.
- **`dto.js`** (extend): `levelList`, and fold `examLevel`/`examDate` into the
  course-run roster + eligibility rows.

## 5. Frontend (`client/src/features/english-training/`)

- New tab/section in the Course Run view: roster table with each learner's
  attendance summary + **exam-sit eligibility**. For eligible learners, HR picks
  a **level** (dropdown of 13) + **exam date** → save. Not-eligible learners show
  "Not eligible (>2 absences)" and the level control is disabled.
- **"Needs level" worklist** (completed-run nudge): a top-level list/badge of
  completed course runs that still have eligible learners without a level, each
  linking into that run's roster. HR clears the list by filling levels. Uses
  `GET /pending-exam-entries`.
- Hooks (extend `useEnglishTraining.js`): `useEnglishLevels`,
  `useRecordExamResult`, `useDeleteExamResult` (invalidate `qk.englishTraining.all`).
- `api.js`: add `getLevels`, `recordExamResult`, `deleteExamResult` to
  `englishTrainingAPI`. Query keys: add `levels` + result keys to `qk.englishTraining`.
- i18n: add strings to `en.json` (English-only).

## 6. Tests

- **Unit** (`server/tests/unit/`): use-case — records level when ≤2 absences;
  **422 when >2 absences**; 400 on unknown level; re-record updates in place;
  soft-delete hides the result.
- **Integration** (`server/tests/integration/`): route happy-path + authz denial
  (Teacher/Participant blocked) + audit entry written.
- **Client** (`__tests__/`): eligible learner can pick+save a level; not-eligible
  learner's control is disabled; loading/error/empty states.

## 7. Definition of Done

- ☑ Migration `039` reversible; 13 levels seeded; constraints verified on disposable PG.
- ☑ Exam-sit gate enforced server-side (absences >2 ⇒ 422), not just UI.
- ☑ Every write audited; soft-delete only.
- ☑ HR (Admin/Coordinator) can record/correct a level from the Course Run screen.
- ☑ Tests + lint + build green (real pass).
- ☑ Capability spec (`docs/specs/english-training/spec.md`) + registry + route
  matrix + system map + `docs/development-roadmap.md` updated.

## 8. Explicit non-goals

- Certificates (HR external file).
- Numeric scoring, pass/fail, re-sit history/versioning of exam attempts.
- Placement test at entry (only end-of-course level today).
- Live teacher attendance entry / offline PWA (unchanged from Phase 2).
- Auto-promotion between levels / prerequisite enforcement across course runs.

## 9. Implementation order

1. Migration `039` + seed levels; verify on disposable PG.
2. Repository + `evaluation.js` use-case + unit tests (gate first).
3. Controller + routes + schemas + integration tests (incl. authz denial).
4. DTO + reads (roster/eligibility fold-in).
5. Client screen + hooks + api + query keys + client tests.
6. Update spec/registry/route-matrix/system-map/roadmap; commit as reviewable slices.

## 10. Open items to confirm at plan review

- `entered_by` stores the user id as text (consistent with Phase-1 corrections'
  `corrected_by`); confirm that's the desired audit granularity vs a FK to users.
- Exam date: required, or optional (some historical rows may lack it)? Assumed
  **required** for new HR entries; historical backfill (if any) is a separate task.
