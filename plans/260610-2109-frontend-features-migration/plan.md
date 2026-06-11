# Plan — Frontend `features/<domain>/` migration (remaining clusters)

**Status:** 6 leaf domains already migrated (rooms, org, reconcile, settings, sync,
evaluations). This plan covers the **remaining clusters**, done block-by-block so
each step is small, verifiable, and behavior-preserving.

**Branch:** `refactor/domains-attendance` · **Created:** 2026-06-10

---

## Guiding principles (the proven recipe — do not deviate)

1. **Behavior-preserving only.** No logic changes. `git mv` the files (keeps
   history), then fix import paths. UI/API/auth unchanged.
2. **Never fragment the shared layer.** `client/src/api/api.js` (central axios
   client) and `client/src/hooks/queryKeys.js` stay where they are. Feature hooks
   import `xxxAPI` / `qk` from there.
3. **Move a hook into a feature ONLY if it is used solely by that feature.**
   Widely-shared hooks STAY in `hooks/` (this is the org-page precedent). See the
   classification table below — it is the crux of keeping ripple small.
4. **Move feature-local components + helper files** with their page (e.g. a tab's
   modals, `*-utils.js`, `*-meta.js`).
5. **Composition shells stay app-level.** Pages that only assemble tabs from
   several domains (`PeoplePage`, `SystemPage`, `ReportsPage`, `CalendarPage`)
   are routing glue, not a domain — keep them in `pages/` (or `pages/shells/`).
   They just get their child imports repointed.
6. **Path-depth rule:** `pages/X.jsx` and `hooks/X.js` are both 2 levels under
   `src/`; `features/<d>/X.jsx` is also 2; `features/<d>/__tests__/X.test.jsx` is 3.
   So a file moving from `pages/` → `features/<d>/` keeps `../../` imports the same
   and only its same-folder (`./`) and one-level (`../hooks`, `../components`)
   imports shift. **A file already in `pages/learning/` moving to
   `features/learning/` needs NO internal path change (same depth).**
7. **Every `vi.mock('<path>')` must resolve to the same module the code imports.**
   Update mock paths in lockstep with the import they shadow.
8. **Gates after every block (all must pass, never weaken):**
   `npm run build` · `npm run test:run` (currently 226/48) · `npm run lint`
   (must stay ≤ cap **81**, 0 errors). One commit per block. Stop on red, fix, re-run.
9. **Incremental coexistence is intended** — `pages/` and `features/` live side by
   side until the migration finishes. A half-migrated tree is the documented state.

---

## Hook classification (decides what moves vs stays)

Importer counts gathered 2026-06-10 (files outside the hook's own file).

| Hook | Importers | Decision | Reason |
|---|---:|---|---|
| `useLearning` | 30 | **STAY shared** | used by learning cluster **and** the 4 `/me/*` pages + `useLearningDashboard` |
| `useAssessment` | 10 | **STAY shared** | learning cluster + `MyAssessmentsPage` |
| `useSchedules` | 15 | **STAY shared** | scheduling + learning + dashboards + ClassDetail |
| `useSchedulingConfig` | 9 | **STAY shared** | booking + schedules + learning |
| `useUsers` | 9 | **STAY shared** | people + many forms |
| `useTeams` | 8 | **STAY shared** | people + booking + dashboards |
| `useClasses` | 7 | **STAY shared** | classes + scheduling + evaluations(moved) |
| `useAttendance` | 5 | **STAY shared** | attendance + ClassDetail + ParticipantDashboard + TodayHero |
| `useLearningDashboard` | 5 | move w/ learning **only if** all importers are in the learning block (verify) |
| `useEnrollments` | 4 | STAY shared | EvaluationPage(moved) + others |
| `useDashboard` | 2 | move w/ dashboard if confined | |
| `useExport` | 2 | move w/ export page if confined | (re-exports from `features/sync/useSync`) |
| `useNextClass` | 1 | move w/ its page | |
| `useAuditLog` | 1 | move w/ its page | |
| `useSearch` | 1 | move w/ its consumer | |

**Net:** for the big clusters we mostly move **pages + components**, leaving the
cross-cutting hooks shared. This is what makes each block low-risk.

---

## Phases (ordered low → high risk)

> For each block: (a) `git mv` files into `features/<domain>/`; (b) fix the moving
> files' `./` and `../` imports per the depth rule; (c) repoint external importers
> + `vi.mock` paths (find with `grep -rln`); (d) run the 3 gates; (e) commit.

### Phase F1 — scheduling cluster  *(medium)* — split to mirror backend (Q1 ✓)
**Targets:** `features/schedule/` + `features/attendance/` (mirrors `domains/schedule`
+ `domains/attendance`; booking is a schedule action → lives in `features/schedule/`).
- **`features/schedule/`** ← `SchedulesPage.jsx`, `BookClassPage.jsx` (+ tests
  `BookClassPage.test`, `SchedulesPage.test`).
- **`features/attendance/`** ← `AttendancePage.jsx`, `AttendanceDashboardPage.jsx`
  (+ `AttendancePage.test`).
- **`CalendarPage.jsx` STAYS a shell in `pages/`** (composes Schedules + Attendance +
  Book across two domains) — only repoint its child imports to the new feature paths.
- **Hooks:** all STAY shared (`useSchedules`, `useAttendance`, `useSchedulingConfig`,
  `useNextClass`) — block is page-only.
- **Touchpoints:** App.jsx lazy routes (`BookClassPage`, `CalendarPage`); `CalendarPage`
  child imports; `ReportsPage`/`SystemPage` if they embed `AttendanceDashboardPage`;
  `ParticipantDashboard`/`ClassDetailPage` links.
- **Order:** move schedule + attendance pages first, repoint `CalendarPage` last.

### Phase F2 — people + dashboards  *(medium)*
**Target:** `features/people/` (+ optionally `features/dashboard/`).
- **Move:** `UsersPage.jsx`, `TeamsPage.jsx`, `DepartmentsPage.jsx`, `MyTeamPage.jsx`,
  `DashboardPage.jsx`, `ParticipantDashboard.jsx`. Keep **`PeoplePage.jsx` as a shell**
  in `pages/` (it tabs Users/Teams/Offices(moved)/Rooms(moved)/Departments) — just repoint.
- **Hooks:** `useUsers`, `useTeams`, `useDashboard` STAY shared.
- **Touchpoints:** `PeoplePage` tab imports; App.jsx routes for Dashboard/ParticipantDashboard;
  `components/home/TodayHero` (uses useAttendance — unaffected); tests `MyTeamPage.test`.
- **Risk:** Dashboards pull many hooks but all stay shared → only page paths change.

### Phase F3 — classes / cohorts  *(medium)*
**Target:** `features/cohorts/` (backend vocab) or `features/classes/`.
- **Move:** `ClassesPage.jsx`, `ClassDetailPage.jsx` only.
- **DO NOT migrate `ProgramsPage.jsx` + `CourseManager.jsx` — they are DEAD CODE**
  (Q3 ✓: `ProgramsPage` has no importers and no route; `CourseManager` is used only
  by `ProgramsPage`; `/programs` was replaced by `/learning`). Handle as a **separate
  delete commit** (`git rm`, confirm with owner) — not part of this migration.
- **Hooks:** `useClasses`, `useEnrollments` STAY shared.
- **Touchpoints:** App.jsx route (`ClassDetailPage` lazy); breadcrumb links;
  `SchedulesPage`/learning links to ClassDetail. Verify where `ClassesPage` is routed
  (tab vs route) at execution.

### Phase F4 — learning cluster  *(HIGH — biggest, do slowly)*
**Target:** `features/learning/`.
- **Move as a unit:** the entire `pages/learning/` folder (37 files incl.
  `assessment-form-utils.js`, `report-download.js`, `__tests__/`) **plus**
  `pages/LearningPage.jsx`.
- **Path advantage:** files already in `pages/learning/` keep ALL their `../../*`
  imports unchanged (same depth in `features/learning/`); internal `./` imports
  unchanged. Only **`LearningPage.jsx`** changes (its `./learning/XxxTab` →
  `./XxxTab`, and `../hooks`→`../../hooks`, `../components`→`../../components`).
- **Hooks:** `useLearning`, `useAssessment`, `useLearningDashboard` **STAY shared**
  (used by `/me/*` pages too — confirmed). So learning files keep importing them via
  `../../hooks/...` (unchanged).
- **Touchpoints:** `App.jsx` (lazy `LearningPage`); any external import of a learning
  tab/modal (e.g. already-moved `CreateSessionModal` is imported by… verify); the many
  `learning/__tests__/*` mocks — most are internal `../Foo` / `../../../hooks/...` and
  stay valid because the folder moves wholesale (re-verify a sample).
- **Risk:** volume. Do in two commits: (1) move `pages/learning/` folder + fix LearningPage;
  (2) fix any stragglers surfaced by build. Run gates between.

### Phase F5 — learner `/me/` + auth + leftover shells  *(low–medium)*
- **`features/learner/`** (or `me/`): `MyAssessmentsPage`, `MyFeedbackPage`,
  `MyLearningCatalogPage`, `MyLearningPathsPage` (+ their tests). They import shared
  `useLearning`/`useAssessment` (unchanged via `../../hooks`).
- **`features/auth/`** (or `account/`): `LoginPage`, `ForgotPasswordPage`,
  `ResetPasswordPage`, `UserSettingsPage`.
- **`features/admin/`**: `HRExportPage` (+ `useExport`, confined → move), `DatabaseExplorer`.
- **Shells stay in `pages/` (or `pages/shells/`):** `PeoplePage`, `SystemPage`,
  `ReportsPage`, `CalendarPage` — repoint child imports only.

---

## Per-block checklist (copy for each phase)

- [ ] `grep -rln` every importer + `vi.mock` of each moving file (record list)
- [ ] `git mv` files into `features/<domain>/` (+ `__tests__/`)
- [ ] Fix moving files' `./` and `../` imports (depth rule)
- [ ] Repoint external importers + `vi.mock` paths
- [ ] `grep` for dangling old paths → none
- [ ] `npm run build` clean
- [ ] `npm run test:run` 226/48 (or higher) green
- [ ] `npm run lint` ≤ cap 81, 0 errors
- [ ] Commit: `refactor(client): migrate <domain> into features/`
- [ ] Update tracker rows (handoff `features/` row; roadmap changelog)

## Global verification & rollback
- Same 3 gates after every block; never weaken tests or raise the lint cap.
- Each block is one commit → `git revert <sha>` cleanly undoes a bad block.
- E2E (Playwright) optional smoke after F4 (learning) since routes shift most there.

## Estimated order & size
F1 (5 pages) → F2 (6) → F3 (4) → **F4 (38, careful)** → F5 (~10 + shells repoint).
Total ~63 files relocated across ~10 commits. Each block independently shippable.

## Resolved decisions (locked 2026-06-10)
1. **Scheduling = split**, mirroring backend: `features/schedule/` (SchedulesPage +
   BookClassPage) + `features/attendance/` (AttendancePage + AttendanceDashboardPage).
   `CalendarPage` stays a shell in `pages/`.
2. **Composition shells stay in `pages/`** (no `pages/shells/`) — minimal churn.
   Shells: `PeoplePage`, `SystemPage`, `ReportsPage`, `CalendarPage`.
3. **`ProgramsPage` + `CourseManager` are DEAD** (no route, no live importer) → NOT
   migrated; queue a separate `git rm` cleanup commit (owner confirm) outside this plan.
4. **No barrel `index.js`** per feature — keep direct imports (YAGNI), matches the
   6 already-migrated features.

## Newly surfaced (verify at execution)
- Where is `ClassesPage` routed? (tab vs lazy route — wasn't in App.jsx lazy list).
- `LoginPage` appears imported directly (not lazy) — confirm before F5 auth move.
