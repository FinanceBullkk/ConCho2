# English Training Integration — Phase 1 Plan (Identity + Structure, real-data import)

- **Status:** 🟢 Complete — identity/structure import, operations UI, and targeted DQ correction shipped
- **Created:** 2026-07-18 · **Last updated:** 2026-07-18 (after real-data analysis + owner grilling)
- **Owner:** (to assign) · **Host platform:** ConCho2 (TMS v2 → LTMS)
- **English business authority:** `kyphucclv/ConMeoGauGau` (ADR 0001)
- **Real source workbook analyzed:** `.tmp/Copy of ENGCLASS_MANA.xlsx` (25 sheets) — the
  owner's current file (newer + cleaner than ConMeoGauGau's `okok_FIXED_v2.xlsx`).
- **Baseline SHAs to freeze before coding:** ConCho2 `main` = _(record)_ · ConMeoGauGau = _(record)_

> This is a **proposal/spec**. Authority order when docs disagree: ConMeoGauGau
> `DATA_DICTIONARY.md` → `TARGET_ARCHITECTURE.md` → this plan → real data → legacy.
> ConCho2 conventions (`.claude/rules/*`) govern the host code.

---

## 0. TL;DR

Build a new deep ConCho2 domain module `server/domains/english-training/`
(mounted `/api/english-training`, **feature-flagged, ships dark**) that owns
canonical English **identity + learning structure**, and **import the owner's
real workbook data losslessly** for those 6 entities only:

1. **Employee** (`eng_employees`, keyed by `emp_code`, no login account yet)
2. **Cohort** (`eng_cohorts`) + **Cohort Membership** (`eng_cohort_memberships`) + **PIC assignment** (`eng_cohort_pic`)
3. **Course** (`eng_courses`) + **Course Run** (`eng_course_runs`)
4. **Run Enrollment** (`eng_run_enrollments`)
5. **Read models** + minimal read-only **admin view**
6. **Contract tests** + a **staging → clean → load → reconcile** import pipeline

**Real data scale:** 308 employees · 51–52 cohorts · 6 courses · 91 course runs ·
552 enrollments · 14 levels. Referential integrity is near-perfect (see §2).

**NOT in Phase 1:** attendance, session units, meetings, make-up, evaluations,
placement, levels-as-canonical, transfer command, full org-history model,
login-account creation. See §11.

> **Giải thích đơn giản:** ConCho2 là "cái nhà" (đăng nhập/giao diện/phân quyền).
> Phase 1 dựng **khung xương nghiệp vụ tiếng Anh** và **nạp data thật** của bạn
> vào — nhưng chỉ phần: ai là học viên, thuộc nhóm nào, khoá gì, lần mở lớp nào,
> ghi danh ra sao. **Chưa** đụng điểm danh / học bù / chấm điểm. Nạp theo kiểu
> "không mất dòng nào": dòng lỗi thì ghi vào sổ, không bỏ lặng.

---

## 0.5 Locked decisions (owner grilling, 2026-07-18)

| # | Decision | Locked value |
|---|---|---|
| D-A | Course table | **New `eng_courses`** — do not reuse `learning_programs`. |
| D-B | Employee data source | **English workbook is the sole source.** ConCho2 has no employee data today; all learners are company employees. Flow English → ConCho2. |
| D-C | Login accounts | **Create `eng_employees` business records only — NO `users`/login** in Phase 1. `user_id` crosswalk stays NULL; accounts created later. |
| D-D | Phase-1 data | **Import the REAL workbook** (identity+structure), cleaned + reconciled — not a synthetic pilot. |
| D-E | Model scope | **English-only** canonical model for now (YAGNI). Consolidating into a shared instructor-led model is a later, separate decision. |
| D-F | `employment_status` | **`Drop reason == 'Resign'` → `inactive` (16 people); everyone else → `active` (292).** Course-lifecycle status (Completed/Stopped/Waiting) is NOT employment. |
| D-G | Multi-active enrollment | **REVISED 2026-07-18 (owner "clean it"):** "one active enrollment" is a **soft/reporting rule, NOT a DB guard** — real data has legitimate concurrent enrollment (267040 in two different courses). Both rows kept `active`; a `multi_active_enrollment` DQ issue + `meta.dq='multi_active'` flag them for review. (Supersedes the earlier "keep guard + demote to waiting" plan.) See `plans/reports/eng-import-data-quality-review-260718.md`. |
| D-H | `Waiting for class` enrollment | **Add a canonical `waiting` status** to English run-enrollment (11 rows). This is our own English model, so extending the controlled set is allowed + honest. |
| D-I | `run_number` | Real data has **zero repeated `(cohort,course)`** → `run_number` always `1`. Keep the Course-Run model + unique `(cohort,course,run_number)` for future repeats; default `1`. |
| D-J | Eligibility policy | Real rule is **absolute: absent > 2 sessions → not eligible** (allowed max 2). Store **`max_absences_allowed = 2`** on course, snapshot to run — NOT a ratio. Diverges from ConMeoGauGau's `attendance_threshold_ratio` (faithful to the real business; Phase-2 eligibility uses the count). |
| D-K | Course codes | Workbook has course names only → **auto-generate a stable slug `course_code`** from the name (`Business English → business-english`). **Confirmed by owner.** |
| D-L | PIC assignment | **Include `eng_cohort_pic` in Phase 1** (data clean + small). Tie-break for the 2 multi-active enrollments: **latest `Start Date` stays `active`**, the other flagged. Cohort set = union of CLASSES ∪ PIC (keep the 1 extra PIC cohort with a DQ note for owner review). |

---

## 1. Why this small slice first

1. **Grain before columns.** ConCho2 already has `classes/enrollments/attendances`
   whose row-meanings differ from English Cohort/Run/Session-Unit. Locking grain
   now (new `eng_*` tables) prevents a collapse that would be expensive later.
2. **Foundation gates the hard facts.** Attendance grain = `(run_enrollment,
   session_unit)`; evaluation attaches to a run enrollment. None can be correct
   until Employee→Cohort→Course→Run→Enrollment exist with the right keys.
3. **Reversible + dark.** New tables behind a flag touch zero live behavior; drop
   them to roll back.
4. **Real data is clean enough to import now.** The messy parts (attendance /
   placement) are exactly what Phase 1 excludes; the identity/structure parts have
   near-perfect referential integrity (§2), so importing them yields real value
   with low risk.

> **Giải thích đơn giản:** Làm nhỏ để **không phá cái đang chạy** và **chốt đúng
> "một dòng nghĩa là gì"** ở gốc. Phần data sạch (học viên/lớp/khoá/ghi danh) nạp
> luôn được; phần rối (điểm danh) để phase sau.

---

## 2. Real-data findings (from `Copy of ENGCLASS_MANA.xlsx`)

Analyzed read-only via `scratchpad/phase1_analysis.py`. 25 sheets total; most are
dashboards/tools/formula tabs (raw-only). **Phase-1 canonical source sheets:**

| Sheet | Rows | Role in Phase 1 |
|---|---:|---|
| `STUDENTS` | 308 | Employee identity (Emp Code, Full Name, BU, ROLE, Status, Drop reason). |
| `COURSE_PLAN` | 6 | Course catalog (Course Name, Expected Sessions). |
| `LEVEL_HELPER` | 14 | Levels — **deferred** (placement/eval); not loaded Phase 1. |
| `CLASSES` | 91 | **Course Run** grain (Class Code + Course Name + PIC + dates). |
| `PIC` | 52 | Cohort PIC assignment (Class Code, PIC, EMP Code, Mail). |
| `ENROLLMENTS` | 552 | **Run Enrollment** grain (Emp, Class, Course, dates, Status). |

Out of Phase 1 (later phases): `ATTENDANCE` (5,996), `CLASS_SESSIONS` (984),
`ATTENDANCE_GRID/INPUT`, `Attendance_Dropped` (48), `Placement` (369),
`LEVEL_RESULTS` (537), `EVALUATION_LINKS_import` (226), all `📊/🎛️/🗺️` UI tabs.

**Integrity (excellent):**
- STUDENTS: 308 distinct emp codes, **0 missing, 0 duplicate**.
- ENROLLMENTS: **0 duplicate** `(emp,class,course)`; **every** emp ∈ STUDENTS;
  **every** class ∈ CLASSES; **every** `(class,course)` matches a CLASSES run.
- CLASSES: **0 repeated** `(class_code,course_name)` → `run_number` always 1.
  Courses-per-cohort: 25×1, 15×2, 9×3, 1×4, 1×5 → cohorts take several *different*
  courses (real Cohort↔Run relationship), never the same one twice yet.

**Anomalies to record as `data_quality_issues` (never drop):**
| Issue | Count | Handling |
|---|---:|---|
| Employee `Drop reason == Resign` | 16 | → `employment_status = inactive` (D-F). |
| Employee with >1 active enrollment | 2 (213817, 267040) | Load both; record DQ issue `multi_active_enrollment` (D-G). |
| Employee blank `BU` / blank `ROLE` | 7 / 7 | Org snapshot = `unknown` placeholder; record. |
| PIC row without `EMP Code` | 8 | Use `pic_label` (name) only; record `unmapped_pic_employee`. |
| Cohort in `PIC` but not in `CLASSES` | ~1 (52 vs 51) | Create cohort; record `cohort_without_course_run`. |
| Eligibility policy absent in workbook | n/a | **Resolved (D-J): `max_absences_allowed = 2`** (absent >2 → ineligible). |
| `courses.course_code` absent in workbook | n/a | Auto-generate a stable slug from name (D-K); record. |

---

## 3. Entity grain (write the sentence first)

| Table | One row = exactly… |
|---|---|
| `eng_employees` | one known English-training employee, keyed by `emp_code`. |
| `eng_cohorts` | one stable learning group (`class_code`) across course runs. |
| `eng_cohort_memberships` | one continuous membership period of one employee in one cohort. |
| `eng_courses` | one reusable course definition. |
| `eng_course_runs` | one numbered delivery of one course to one cohort. |
| `eng_run_enrollments` | one employee's participation in one course run. |

**Invariants for Phase 1:**
- **I1** `emp_code`/`class_code` are stable ids; names are never keys.
- **I2** cohort takes many courses; repeat = new `run_number` (unique `(cohort,course,run_number)`). Data: `run_number` = 1 everywhere (D-I).
- **I3** `start_session_number ≥ 1` (mid-run join). Workbook has no per-enrollment first-session → default `1`; real mid-run inference is a Phase-2 attendance concern.
- **I4** at most one **active** run enrollment per employee — **SOFT/reporting rule, not a DB guard** (D-G revised): real data has legitimate concurrent enrollment; both kept `active`, flagged for review.
- **I5** an active enrollment's `cohort_membership_id` → an active membership in that run's cohort.
- **I6** enrollment BU/role snapshots are immutable (copied at import).
- **I7** course policy (`expected_units`, `max_absences_allowed`) snapshotted per run.

---

## 4. Source → Target field mapping (Phase 1)

Normalization (all): `emp_code`/`class_code` → string, trim, **drop trailing `.0`**
(Excel numerics), uppercase class codes; text → trim/collapse whitespace; blank → NULL.

### 4.1 `eng_employees` ← `STUDENTS`
| Source col | Target field | Rule / issue |
|---|---|---|
| `Emp Code` | `emp_code` | unique; `missing_emp_code` if blank (none in data). |
| `Full Name` | `full_name` | not a key. |
| `Status` + `Drop reason` | `employment_status` | `Drop reason=='Resign'` → `inactive`; else `active` (D-F). |
| `BU` | (org snapshot source for enrollment) | Phase 1 store as text on enrollment; blank → `unknown`. |
| `ROLE` | (org snapshot source for enrollment) | blank → `unknown`. |
| `Current/Entrance Level`, `Current Course`, `PIC`, all helper cols | — | **raw-only** (placement/eval/derived → deferred). |
| _(email/english_name)_ | `email`, `english_name` | STUDENTS has none → NULL; email filled from `PIC.Mail` for PICs. |

### 4.2 `eng_courses` ← `COURSE_PLAN`
| Source | Target | Rule |
|---|---|---|
| `Course Name` | `course_name` | 6 rows. |
| _(none)_ | `course_code` | **generated** stable slug (e.g. `business-english`) (D-K); record. |
| `Expected Sessions` | `expected_units` | integer. |
| _(none)_ | `max_absences_allowed` | **`2`** for all courses (D-J); overridable per course later. |

### 4.3 `eng_cohorts` ← distinct `class_code` (union of CLASSES ∪ PIC ∪ ENROLLMENTS)
| Source | Target | Rule |
|---|---|---|
| `Class Code` | `class_code` | unique; ~51–52. |
| _(none)_ | `display_name` | default = `class_code`. |
| derived | `status` | `active` if any active run/enrollment else `completed`/`archived`. |
| _(none)_ | `capacity` | NULL (not in workbook). |

### 4.4 `eng_cohort_pic` (PIC assignment) ← `PIC`  *(included in Phase 1 — D-L)*
`Class Code`→cohort; `EMP Code`→`pic_employee_id` (resolve; 8 blank → NULL +
`pic_label` from `PIC`); `PIC`→`pic_label`; `Mail`→also sets that employee's `email`.
CHECK: at least one of `pic_employee_id` or `pic_label` present.

### 4.5 `eng_course_runs` ← `CLASSES` (one row each)
| Source | Target | Rule |
|---|---|---|
| `Class Code` | `cohort_id` | resolve. |
| `Course Name` | `course_id` | resolve; `unknown_course` if absent (none in data). |
| _(computed)_ | `run_number` | seq within `(cohort,course)` = **1** (D-I). |
| `Expected Sessions` | `expected_units_snapshot` | else course default. |
| course default | `max_absences_allowed_snapshot` | from `eng_courses` (D-J). |
| `Start Date` / `End Date` | `start_date` / `end_date` | parse; `malformed_date` → issue. |
| derived | `status` | `completed` if End past, else `active`/`planned`. |
| `PIC`, `Sessions Held` | — | PIC→`eng_cohort_pic`; Sessions Held ignored (attendance-derived). |

### 4.6 `eng_cohort_memberships` ← derived: distinct `(emp_code, class_code)` from `ENROLLMENTS`
`start_date` = min enrollment Start Date in that cohort; `status` = `active` if any
active enrollment in the cohort else `completed`. (An employee in EL001/Business +
EL001/Comm-1 = **one** membership, two run enrollments.)

### 4.7 `eng_run_enrollments` ← `ENROLLMENTS` (one row each)
| Source | Target | Rule |
|---|---|---|
| `Emp Code` | `employee_id` | resolve. |
| `Class Code`+`Course Name` | `course_run_id` | resolve to the run. |
| derived | `cohort_membership_id` | the `(emp,class)` membership (I5). |
| `Status` | `status` | `Active→active`, `Completed→completed`, `Stopped→dropped`, `Waiting for class→waiting` (D-H). |
| `Start Date` | `joined_at` (meta) / membership start | parse. |
| employee `BU`/`ROLE` | `business_unit_id_snapshot`/`job_role_id_snapshot` | text snapshot; blank→`unknown` (I6). |
| _(none)_ | `start_session_number` | default `1` (I3). |
| `Entrance Level`,`Final Level`,`Sessions Present`,`Absences` | — | placement/eval/attendance → **deferred**. |

---

## 5. Target schema (new migration, in-chain)

New `eng_*` tables via a knex migration in `server/db/pg/migrations/` (next free
**in-chain** number after `035` — confirm via `knex_migrations`; note `036` also
exists in `migrations-cutover/`, a different dir). ConCho2 conventions: text PK
(24-hex), `TIMESTAMPTZ`/`DATE`, `jsonb meta`.

> **Avoid the mig-036 CI trap:** `eng_*` are greenfield → put **FK + CHECK +
> UNIQUE inline in the creating migration** so they run in CI *and* prod via
> `migrate:latest`. Do not defer `eng_*` constraints to a cutover file.

```
eng_employees(id pk, emp_code UNIQUE(lower), full_name NN, english_name, email,
  employment_status CHECK in(active,inactive,unknown) NN, user_id -> users(id) NULL,
  meta, created_at, updated_at)
eng_cohorts(id pk, class_code UNIQUE NN, display_name NN,
  status CHECK in(planned,active,completed,archived) NN, capacity CHECK>0 NULL, meta, stamps)
eng_cohort_memberships(id pk, cohort_id FK NN, employee_id FK NN, start_date NN, end_date,
  status CHECK in(active,completed,transferred,cancelled) NN, transfer_to_membership_id NULL,
  created_at, UNIQUE(cohort_id,employee_id) WHERE status='active')
eng_courses(id pk, course_code UNIQUE NN, course_name NN, expected_units CHECK>=0 NN,
  max_absences_allowed CHECK>=0 NN default 2, is_active NN default true, meta, created_at)
eng_course_runs(id pk, cohort_id FK NN, course_id FK NN, run_number CHECK>=1 NN,
  status CHECK in(planned,active,completed,cancelled,archived) NN,
  expected_units_snapshot NN, max_absences_allowed_snapshot NN, start_date, end_date,
  stamps, UNIQUE(cohort_id,course_id,run_number))
eng_run_enrollments(id pk, course_run_id FK NN, employee_id FK NN, cohort_membership_id FK NULL,
  status CHECK in(active,waiting,completed,transferred,dropped,cancelled) NN,   -- 'waiting' added (D-H)
  start_session_number CHECK>=1 NN default 1,
  business_unit_id_snapshot, job_role_id_snapshot, transfer_from_enrollment_id NULL,
  meta, stamps, UNIQUE(course_run_id,employee_id),
  INDEX(employee_id) WHERE status='active'   -- non-unique: I4 is a soft/reporting rule (D-G), not a guard)
```
Plus a small `eng_data_quality_issues(id, issue_code, entity_type, entity_key,
source_sheet, source_row, detail jsonb, created_at)` for lossless import (§6).
FK columns all indexed. `levels` are **not** created in Phase 1 (deferred).

**Migration discipline:** query `knex_migrations` first; one coherent migration
(`up`/`down`); run on `.env.pg-prototype` Neon; record a forward-verify query;
prove rollback; never edit an applied migration.

---

## 6. Import pipeline (staging → clean → load → reconcile)

Lossless, idempotent (ConMeoGauGau PROJECT_RULES §3/§8). Run as a **script**
(`server/scripts/eng-import/`), not app runtime.

1. **Stage** — read the xlsx, write every meaningful source row of the 6 core
   sheets into `raw_eng_workbook_rows` (workbook SHA-256, sheet, source row #,
   raw payload, row hash). Re-running same checksum inserts 0 new rows.
2. **Clean/normalize** — apply §4 rules deterministically; resolve keys; classify
   each row's outcome: loaded | staged | issue | ignored-by-rule.
3. **Load** — insert canonical `eng_*` in dependency order inside transactions:
   courses → cohorts → employees → memberships → course_runs → run_enrollments.
4. **Reconcile** — per sheet: `source rows = loaded + issue + ignored`. Assert:
   STUDENTS 308→308 employees; COURSE_PLAN 6→6 courses; CLASSES 91→91 runs;
   ENROLLMENTS 552→552 enrollments (incl. 2 flagged); cohorts 51–52.

### 6.1 Employment status (D-F)
`Drop reason=='Resign'` → `inactive`; else `active`. Expect 16 inactive / 292 active.

### 6.2 Enrollment status (D-H)
`Active→active · Completed→completed · Stopped→dropped · Waiting for class→waiting`.

### 6.3 Multi-active handling (D-G revised)
Detect employees with >1 active enrollment (213817, 267040) and write a
`multi_active_enrollment` DQ issue + `meta.dq='multi_active'` on the rows. **Both
kept `active`** — no DB unique guard, no demotion (the one-active rule is soft;
real data has legitimate concurrent enrollment across different courses). Surfaced
for owner review, not blocked.

> **Giải thích đơn giản:** Nạp theo thứ tự (khoá → nhóm → người → ghi danh) trong
> "giao dịch trọn gói". Cuối cùng **đếm lại**: 308 học viên vào phải ra 308, 552
> ghi danh ra 552 — lệch là biết ngay. 2 ca lỗi được ghi sổ để bạn xử lý, không
> bị mất.

---

## 7. Backend command Interface (Seam) + read models

Module `server/domains/english-training/` (routes/controller/use-cases/
repository.pg/schemas/dto/policy + `import/`), files < ~200 lines, mounted behind
`ENGLISH_TRAINING_ENABLED`. Intent-shaped commands; server owns ids, `run_number`,
snapshots, status defaults, actor, audit. Each command = one transaction + audit
committed in the same tx.

**Commands:** upsert employee · create cohort · add membership · create course ·
create course run (lock `(cohort,course)`, assign `run_number`, snapshot policy) ·
enroll learner (atomic: ensure membership, snapshot org, enforce I4 target, audit).
The **import script** uses these same use-cases (not raw SQL) where practical.

**Read models (task-oriented):** `GET /cohorts` (list + member counts) ·
`/cohorts/:id` (members + runs) · `/courses` · `/course-runs/:id` (run + roster) ·
`/employees/:empCode` (membership + enrollment history).

**Authz/audit:** reuse ConCho2 `roleGuard`/`requireCapability` + `policy/`
(Admin/Coordinator manage; reads role-gated); actor = server session. Audit rows
written **inside the business transaction** (verify `auditService` can take a tx
client against `audit_log`, else a module-local audit write).

---

## 8. Frontend — minimal read-only admin view

`client/src/features/english-training/` — `EnglishTrainingPage.jsx` (tabs:
Cohorts | Courses | Employees | Data-quality issues) + `useEnglishTraining.js`
(React Query) + `__tests__/`. Uses central `api/api.js` (`englishTrainingAPI`) +
`queryKeys.js`. **English-only UI strings** via `t()` + `en.json`. Flag + role
gated. The canonical views remain read-only; a post-import correction overlay is
the one targeted write seam for missing BU/job role. It preserves raw staging,
writes correction history/audit, resolves matching DQ issues, and survives
reset/re-import. Generic entity editing remains out of scope.

---

## 9. Contract tests (the durable spec)

Run on a **disposable PG** (CI `server-tests-pg` lane / local scratch) — **never**
`npm test` on the dev login DB (it truncates). Each command: success · permission
denied · invalid input · duplicate/stale · rollback · actor-attributed audit.

Key cases: unique `emp_code`/`class_code`/`course_code`; `(cohort,course,run_number)`
repeat → `run_number` increments; policy snapshot immutable after course edit (I7);
enrollment `waiting` status accepted (D-H); one-active guard + the flagged-exception
path (D-G); membership↔run cohort match (I5); org snapshot immutable (I6); reads
return task-oriented shapes. **Import tests:** reconciliation equation balances on a
fixture workbook; re-run is idempotent; every anomaly (§2) produces the expected DQ
issue and no row is dropped.

---

## 10. Risks & conflicts

| Risk | Mitigation |
|---|---|
| Table-name collision (`classes/enrollments/...`) | `eng_` prefix; never write existing tables. |
| Grain temptation (`Class=Cohort`, reuse `enrollments`) | Explicit §4 mapping + contract tests; forbidden in review. |
| FK/CI gap (mig-036 pattern) | `eng_*` constraints inline in-chain. |
| Audit not transactional in ConCho2 | Write audit in the business tx (verify against `audit_log`). |
| Dev login DB truncated by tests | Import + contract tests on disposable PG only. |
| `emp_code` `.0` / normalization | Normalize both sides; unresolved → issue, never drop. |
| Multi-active (2) breaking the unique index | §6.3 pre-insert handling + DQ flag. |
| Missing business config (`attendance_threshold_ratio`) | Owner default before load (Unresolved). |
| Scope creep into attendance/eval | §11 non-goals; PR review rejects out-of-scope tables. |

---

## 11. Explicit non-goals (Phase 1)

❌ attendance / `session_units` / `meetings` / `CLASS_SESSIONS` · ❌ make-up ·
❌ evaluations + versions / `LEVEL_RESULTS` / `EVALUATION_LINKS` · ❌ placement /
`Placement` sheet · ❌ **levels as canonical** (`LEVEL_HELPER` deferred) ·
❌ transfer command · ❌ full `employee_org_history` (Phase 1 keeps nullable org
snapshots) · ❌ **login-account creation** (D-C) · ❌ capacity override ·
❌ certificates/notifications/calendar wiring · ❌ dual-write / DB-sync / shared-table
/ direct UI table writes (banned by ADR 0001).

---

## 12. Definition of Done

- ☑ Migration: 6 `eng_*` + `eng_data_quality_issues` + `raw_eng_workbook_rows`,
  inline FK/CHECK/UNIQUE; `up`/`down` proven on disposable PG; verify query recorded.
- ☑ Module: commands + 5 read models, feature-flagged, mounted; two-layer authz +
  transactional audit.
- ☑ Import pipeline: stage→clean→load→reconcile; reconciliation balances
  (308/6/91/552, cohorts 51–52); all §2 anomalies recorded as DQ issues, nothing dropped.
- ☑ Contract + import tests green on the PG lane (incl. adversarial + idempotency).
- ☑ Minimal read-only admin view (English-only) behind flag; client lint ≤ cap.
- ☑ Tracker (`docs/development-roadmap.md`) + capability spec
  `docs/specs/english-training/spec.md` (`evolving`) + registry row.
- ☑ Baseline SHAs recorded; eligibility policy = `max_absences_allowed=2` (D-J); course-code slug scheme confirmed (D-K).

---

## 13. Task breakdown

1. Freeze baseline SHAs; confirm last in-chain migration.
2. Obtain `attendance_threshold_ratio` default + confirm course-code slug scheme.
3. Migration `0xx_eng_identity_structure.js` (6 tables + DQ + raw staging +
   constraints); run/rollback on `.env.pg-prototype`; record verify query.
4. Scaffold `server/domains/english-training/` + tx + audit helper.
5. Implement commands + read models (intent-shaped, locking, snapshots).
6. Import pipeline script (stage→clean→load→reconcile) using the use-cases; DQ
   issue writer; multi-active handling (§6.3).
7. Contract + import tests on the PG lane; make green for real.
8. Feature flag + mount; minimal client read view + hooks + query keys; lint.
9. Run the import against the real workbook on the prototype DB; verify
   reconciliation + inspect the DQ issue list with the owner.
10. Docs: capability spec + registry + roadmap changelog. Commit (no push until asked).

---

## Unresolved questions

**None — all decisions locked in owner grilling (2026-07-18).** Resolved:
`course_code` = auto-slug (D-K) · eligibility = `max_absences_allowed=2` (D-J) ·
`display_name=class_code` · multi-active tie-break = latest Start Date (D-L) ·
PIC included (D-L) · `start_session_number=1` for waiting · keep the extra PIC
cohort with a DQ note. Ready to implement per §13.
