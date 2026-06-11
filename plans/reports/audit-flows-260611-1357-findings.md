# Audit Round — Phase 03: Business Flows & UX Wiring

**Date:** 2026-06-11 · **Plan:** `plans/260611-1230-full-system-audit/phase-03-business-flows-and-ux.md`
**Method:** live persona walkthroughs on seeded dev env (agent-browser @ localhost:3000) + code/API confirmation.
**Verdict: 1×P1 (broken core flow), 3×P2, 2×P3.** Auth, booking, learner self-service, learner enrollment, feedback loops verified clean end-to-end.

## Personas exercised
Admin (000001, +MFA enrolled live), Teacher (000002), Participant-leader (000004), Participant-member (000005). Coordinator/trainer-only not re-walked (trainer-only visibility fixed 2026-06-11, prior round).

## Verified CLEAN (evidence-backed)

| Flow | Evidence |
|---|---|
| Auth — login | empCode+password → 200; wrong password → "Invalid credentials"; lands /home |
| Auth — forced password change | default-pw admin → blocking modal; old pw rejected post-change; new pw works; server guard `auth.js:157` 403s all non-/me,/logout,/change-password until rotated |
| Auth — MFA enroll/verify | QR+secret shown; live TOTP (speakeasy) verify → enabled; 8 backup codes shown once; login challenge accepts TOTP, wrong code → "Invalid MFA code", backup code single-use (reuse → 401). **BUT see SEC-018** — repeated TOTP logins falsely rejected (replay-counter bug found on deeper testing) |
| Auth — forgot password | anti-enumeration response ("if the code exists…") |
| Admin People — Users | list/filter/search/export; create (validation: code required, name≥2, email format, pw≥10; "User created" + appears); own-row has no Force-logout (can't self-kick) |
| Admin People — Teams/Depts/Offices/Rooms | Teams cards (leader ★, view/edit/delete); Depts create OK + empty state; Offices list; Rooms office-scoped + empty state |
| Learning | 9 tabs all render; Program create (validation OK); Cohort enroll drawer ("Learner enrolled" → Withdraw); Completion report renders 4 learners with attendance/assessment/feedback/complete/cert cols; Paths/Assignments/Assessments+QuestionBank/Feedback all load; Groups stub points to Teams (intentional) |
| Booking — leader grid | grid renders (past muted, future bookable, Mine sessions, taken-by-other); weekly-limit enforced (3rd this week → 400 "maximum 2 sessions this week"); happy book → 201 "3 members enrolled" auto-enroll; cancel → 200 "Session cancelled" |
| Booking — member restriction | non-leader → "You are not a Team Leader… contact your Team Leader" (no grid) |
| Learner /me/* | catalog (self-enroll empty state correct), paths, assessments (empty state), feedback **submit loop** (Pending→Submitted, "Update feedback"), sessions (SEATS "3/9" correct, STATUS Enrolled); settings (pw + MFA) |
| Teacher — attendance guard | future session → "Attendance can only be marked after the session begins" (correct) |
| i18n English-only | no Vietnamese UI strings (only match = a TEST asserting VN absent: `ErrorBoundary.test.jsx:54`); 605 `t()` keys, no raw key rendered in walkthrough |
| RBAC nav gating | Teacher nav has no People; Teacher Reports shows only Analytics+Evaluations (perm-filtered) |

## Findings

### FLOW-001 (P1) — Teacher CANNOT add an evaluation (core grading flow dead end)
- **Repro:** login 000002 (Teacher) → Reports → Evaluations → select class EL001 → **+ Add evaluation** → learner search "000004" / "Le" / empty → **"No learners found"** always. Teacher can never create an evaluation.
- **Root cause:** the Add-evaluation learner picker (`features/evaluations/EvaluationPage.jsx:92`) sources candidates from `useUsers({search})` → `GET /api/users?search=` which is **Admin-only** (`routes/userRoutes.js:13` `router.use(protect, roleGuard('Admin'))`) → Teacher gets **403** (confirmed via live fetch). The alternate roster path `useEnrollments` (`EvaluationPage.jsx:284-287`) is gated `enabled: isAdmin && showAll` and `/api/enrollments` is also Admin-only (`routes/enrollmentRoutes.js:27`). So a Teacher has **no** learner source.
- **Why it's a real bug (not intended block):** `POST /api/evaluations` is `roleGuard('Admin','Teacher')` (`routes/evaluationRoutes.js:10`); route-permission-matrix says "Admin/Teacher write"; README §4.3 documents Teacher grading as the primary path; UI shows the button to teachers. The WRITE is allowed but the learner-SELECT dependency 403s → flow is wired backend-up but unusable for the persona it serves (the exact gap class this phase targets).
- **Impact:** the documented teacher end-of-course grading workflow is non-functional. Admin grading works (admin can call /api/users + roster). Read path (view existing evals) works for teachers.
- **Fix sketch:** give the eval modal a teacher-callable, class-scoped learner roster instead of the org-wide Admin-only user search. Options (triage): (a) add `GET /api/evaluations/roster?classId=` (or `/api/classes/:id/learners`) guarded `roleGuard('Admin','Teacher')` returning enrolled learners (empCode/name/level), wire modal to it for BOTH roles (also kills the admin-only "show all"); (b) reuse the teacher-accessible schedule roster (`/api/schedules/attendance-calendar` enrolledUsers). Least-privilege favors (a): teachers pick from the class roster, never the org directory. Ship WITH integration test (teacher upsert path) + frontend test (modal lists roster for teacher).

### BUG-003 (P2) — `.lean({ virtuals: true })` is a silent no-op → wrong enrolled counts / avg score
- **Visible symptom:** Admin Calendar → Schedule Management cells render **"/9"** (blank before slash) and a **0% progress bar** for sessions that actually have 3 enrolled (`features/schedule/SchedulesPage.jsx:194,225` read `s.enrolledCount`).
- **Root cause:** `Schedule.enrolledCount` is a Mongoose **virtual** (`models/Schedule.js:195`). The list query `findSchedulesPage` uses `.lean({ virtuals: true })` (`domains/schedule/repository.js:42`) — but **`mongoose-lean-virtuals` is not a dependency and not registered** (no dep in `server/package.json`, no `mongoose.plugin(...)`, confirmed). So `{ virtuals: true }` is **ignored**; the lean rows carry `enrolledUsers` (array) but no `enrolledCount` → client reads `undefined` → "/9" and `NaN→0%`.
- **Blast radius (6 call sites, same no-op):** `repository.js:42` (schedule list — VISIBLE bug), `:59` `findUpcomingForClasses`, `:68` `findCalendarSchedules` (harmless: attendance-calendar recomputes `enrolledCount` at `queries.js:155`); `learning/completion/repository.js:57` `findEvaluation` → **`completion/use-cases.js:41` reads `evaluation.averageScore`** (Evaluation virtual `models/Evaluation.js:89`) → **undefined in the Completion compliance report whenever evaluations exist** (latent — seed has no evals so not seen live); `learning/session/repository.js:35,46` (harmless: session DTO computes counts directly).
- **Impact:** admin/coordinator see wrong enrolled counts + empty fill bars on the schedule grid; completion report omits evaluation averages — a correctness gap in a compliance artifact.
- **Fix sketch (triage):** (a) systemic — `npm i mongoose-lean-virtuals` + `mongoose.plugin(leanVirtuals)` (or per-schema) → makes all 6 honest calls work as authored (DRY, matches intent); add regression assert that list response carries `enrolledCount`. OR (b) localized — map `enrolledCount: s.enrolledUsers?.length` in `listSchedules` (mirrors existing `queries.js:155`) + compute `averageScore` in completion without the virtual. (a) fixes the whole class; (b) avoids a dep.

### BUG-004 (P2) — Booking page header always "0 students"
- **Symptom:** `/book` (leader) header reads **"Sales Team Alpha · 0 students"** though the team has 3 members (and booking auto-enrolls "3 members enrolled" — backend is correct).
- **Root cause:** `features/schedule/BookClassPage.jsx:190` reads `selectedTeamObj.enrolledCount`, but the Team model has **no `enrolledCount` field/virtual** (no `.virtual()`, no `toJSON:{virtuals}` in `models/Team.js`) and `/api/teams/my-teams` returns `members` (populated array), not a count. So `enrolledCount` is always `undefined` → `?? 0` → "0 students" for every team, always.
- **Impact:** misleading roster size on the core booking page; implies an empty team. Cosmetic-but-visible on the central feature.
- **Fix sketch:** `BookClassPage.jsx:190` → `selectedTeamObj.members?.length ?? selectedTeamObj.enrolledCount ?? 0` (client-only, the array is already present). + render test.

### UX-08 (P2) — Form labels not associated with inputs (Learning + feedback modals)
- **Evidence:** shared `features/learning/LearningField.jsx:11-18` renders `<label>{label}</label>` then `{children}` (the input) with **no `htmlFor`, no `id`, no wrapping** → label is purely visual. Confirmed on Create-Program modal: labels "Code/Name/Description/…" are siblings of unlabeled `<input>`/`<select>` (a11y tree shows no accessible name; DOM shows no `id`/`for`). Same shape in `/me/feedback` rating selects (comboboxes with no accessible name).
- **Impact:** screen-reader users hear "edit text, required" with no field name across all Learning CRUD modals (Program, Cohort, Assessment, etc.) and learner feedback — fails WCAG 1.3.1 / 4.1.2. Internal tool, 1000 employees → accessibility obligation.
- **Fix sketch:** in `LearningField`, `const id = useId()` → `<label htmlFor={id}>` + `cloneElement(children, { id })` (or wrap control inside the label). One shared fix covers all Learning modals; apply same to the feedback selects.

### SEC-018 (P1, incidental — OUT of phase-03 scope, escalated) — MFA replay guard locks out TOTP after the first login
- **Discovered:** while re-testing MFA login repeatedly during the auth walkthrough — admin's 2nd+ TOTP logins returned 401 (`/api/auth/mfa/verify`), not rate-limit (429).
- **Root cause:** `mfaService.verifyTokenWithReplay` (`services/mfaService.js:91-110`) rejects when `result.delta <= lastUsedCounter`, and `auth-login.js:215` persists `mfaLastUsedCounter = delta`. But `speakeasy.totp.verifyDelta({window:1})` returns delta **relative to now** — a legitimately-current code is ALWAYS delta `0`, regardless of wall-clock time (proven empirically: two codes 60 s apart both `delta:0`). So after the first successful login stores `lastUsedCounter=0`, every later current-window code (`delta 0`) hits `0 <= 0` → **falsely rejected as replay**. Only a future-window code (delta 1) passes, then stores 1, ratcheting impossibly. Net: **TOTP works exactly once per user**, then they fall back to 8 single-use backup codes, then are locked out.
- **Why not seen before:** MFA is opt-in (Phase 1.3) and seeded users have it off, so no one hit a 2nd MFA login. If `MFA_REQUIRED_ROLES` is ever set (e.g. `Admin`), every such user is locked out after their 2nd login → P0 in that config.
- **Why not fixed here:** load-bearing security layer + out of the owner-approved phase-03 scope (FLOW-001 + 2 bugs). Needs its own focused PR + multi-window login tests. Escalated to owner.
- **Fix sketch:** store/compare the ABSOLUTE TOTP step counter, not the relative delta: `absCounter = Math.floor(now/1000/step) + result.delta`; reject when `absCounter <= lastUsedCounter`; persist `absCounter`. Tests: 1st login OK; same code replay → 401; *next-window* login (later step) → OK; old/used step → 401.

### UX-09 (P3) — Error boundary flashes behind forced-password modal on first login
- **Evidence:** first admin login (mustChangePassword) → `/home` mounts, dashboard queries (`/api/dashboard/stats`, `/api/org/my-team`, `/api/dashboard/filter-options`) all **403** (mustChangePassword gate, `auth.js:157-170`) → React Query error → home renders **"Something went wrong" + "Try again"** behind the (blocking) password-change modal.
- **Impact:** cosmetic — the modal is blocking so the broken dashboard isn't interactable; resolves after password change. But noisy (error boundary + likely error toasts/Sentry on every first login).
- **Fix sketch:** suppress dashboard fetches while `user.mustChangePassword` (gate `enabled:`), or have the 403-mustChangePassword interceptor route to the change-password flow instead of bubbling to the error boundary.

## Notes (no finding)
- i18n hygiene: 15 `t()` keys absent from `en.json` (`common.save/cancel/delete/keep/confirmDelete`, `learning.cohorts.archived/edit/restore/updated/restored/…`) but ALL pass an inline English default (`t('common.save','Save')`) → render correctly; catalog is just incomplete. P3 hygiene, not a defect.
- Leader home greeting shows "A)" — artifact of seed name "Participant Le (Team Lead A)"; real names lack parentheticals. Not a bug.
- Teacher attendance MARKING happy-path not exercisable on seed (all sessions future); guard verified; marking covered by existing integration tests.
- `/me/sessions` shows correct "3/9" seats (session DTO computes count directly) — proves BUG-003 is isolated to consumers of the schedule-list virtual.

## Triage outcome (owner, 2026-06-11)
- **Scope:** fix FLOW-001 + BUG-003 + BUG-004 this round; UX-08, UX-09 → Backlog.
- **FLOW-001 → FIXED** (scoped roster, owner pick): new `GET /api/evaluations/roster?classId=`
  guarded `roleGuard('Admin','Teacher')` + per-class binding (`evaluationPolicy.canRead`),
  returns Active-enrolment learners (empCode/name/department, deduped). EvalModal picker rewired
  to this roster for BOTH roles (dropped the Admin-only `/api/users` search + `useDebounce`);
  empty query shows the full class roster. Verified live (teacher added an evaluation end-to-end)
  + 7 integration tests (roster RBAC/validation/404/exclusion + e2e upsert).
- **BUG-003 → FIXED** (localized, owner pick): `listSchedules` attaches `enrolledCount` from the
  populated `enrolledUsers` array; completion `averageScore` computed from the 4 score fields;
  the misleading `.lean({ virtuals:true })` on both touched queries demoted to `.lean()` with a
  tombstone comment. 2 integration tests (schedule list enrolledCount; completion averageScore 7.5).
- **BUG-004 → FIXED:** `BookClassPage` header reads `members.length` (the real `/my-teams` shape);
  1 frontend regression test.
- **UX-08, UX-09 → BACKLOG** (plan.md Backlog table).
- **SEC-018 → ESCALATED** (separate security PR — see Unresolved questions). NOT folded into this
  round's flows PR (load-bearing auth layer, out of approved scope).

Gates: server 84 suites / 843 tests, client 53 files / 247 tests, lint 0-err (72 = cap), build ✓.
Spec `evaluations` updated (roster read requirement + teacher-grading scenario, last_updated 2026-06-11).

## Unresolved questions
- **SEC-018 (P1/P0)** — fix the MFA replay-counter lockout now (separate PR) or schedule a dedicated
  security round? Recommend fixing soon: any user who enables MFA is locked out of TOTP after their
  2nd login; P0 if `MFA_REQUIRED_ROLES` is set. (Asked owner via AskUserQuestion.)
