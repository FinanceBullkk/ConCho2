# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **Canonical progress tracker.** Status board first, then milestone tables,
> then the recent changelog. Full history → [`changelog-archive/`](changelog-archive/).
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot (archived)* → [`archive/handoff-2026-06-01.md`](archive/handoff-2026-06-01.md)
>
> **Last updated:** 2026-06-15

---

## Status board — Now / Next

**~70% through the TMS → L&D migration.** The generic learning core AND the L&D
compliance loop (assignment → completion → certificate → expiry → recertification)
work end to end. **The genuine non-deferred migration debt is closed** — the
remainder is documented deferred-by-design scope (below), not active debt.

- **Done (waves):** A Foundation · B Assessment & Certification · C Catalog/
  Paths/Self-service (core) · D1/D3/D4/D5/D6 platform slices · **E Generic
  scheduling** — closed 2026-06-12. Full-system audit (8/8 rounds) complete;
  Express 4→5 + light dependency majors done. **Cohesion Wave** (6/6) + in-app
  notification bell (full event coverage) shipped 2026-06-13.
- **Now: Phase 3/4/5 push COMPLETE** (2026-06-13, 7 PRs #80–#86, re-baselined).
  Shipped: bulk cohort enrollment (BE+UI); program-policy enforcement
  (`facilitatorPolicy.assignmentRequired` + `visibility`) + a program-policies
  **editor UI** (completion/capacity/facilitator/cert-validity/recertify); and
  the full **certificate lifecycle** — expiry reminders (learner + weekly
  manager digest) → **recertification auto-assignment**. Phase 3 → ~85%,
  4 → ~82%, 5 → ~80%; all genuine non-deferred work is shipped.
- **Deferred-by-design (NOT debt — owner decision to build):** nomination
  workflow (overlaps Assignment/D4); Evaluation→Assessment convergence (project
  rule: converge-when-touched, no big-bang); compliance report presets (no
  confirmed HR need); recert for already-expired certs + path-based recert.
  `deliveryMode` is metadata-only by design (no enforcement contract).
- **Next:** owner's call — start **Phase 6 PostgreSQL** readiness (Phase 0), the
  gated owner-ops below, or override one of the deferred-by-design items above.
  (TMS.update north-star: **all 7 gaps shipped** (#1–#7); #7 PWA offline
  attendance closed 2026-06-15. Remaining = optional pixel-fidelity QA pass.)
- **Gated / owner-ops:** **D2 Google OIDC + Directory sync** (blocked on owner's
  Google OAuth app + Workspace domain); **paid always-on hosting** + Sentry
  cron-monitor dashboard; **Phase 6 PostgreSQL gate** (plan drafted,
  `plans/260612-2042-postgresql-migration/`; Phase 0 readiness can start now).

---

## Migration phases (backend re-architecture)

| Phase | Theme | Progress | Status |
|------|-------|---------:|--------|
| 0 | Architecture baseline + safety net | ~93% | 🟢 near done |
| 1 | Backend modular-monolith refactor | ~98% | 🟢 near done (2026-06-10: domains/attendance+groups+schedule routes extracted; repository ADR; schedule use-case tests; frontend `features/` migration complete) |
| 2 | Learning catalog + generic cohort model | ~95% | 🟢 near done |
| 3 | Multi-program enrollment + session scheduling | ~85% | 🟢 near done (genuine work shipped; only nomination workflow deferred-by-design) |
| 4 | Frontend L&D workspace (CRUD UI) | ~82% | 🟢 near done (CRUD + policy editor complete) |
| 5 | Reporting, completion, feedback | ~80% | 🟢 near done (cert lifecycle + recert closed; Evaluation→Assessment convergence deferred-by-design) |
| 6 | PostgreSQL decision gate | 0% | ⚪ gated |

## LTMS waves (forward — see [`lms-roadmap.md`](lms-roadmap.md))

| Wave | Goal | Status | Depends on |
|------|------|--------|-----------|
| A — Foundation | Generic learning core works E2E (scheduling modes, cohort enrollment, CRUD UI, capability authz) | 🟢 done (M1–M4) | — |
| B — Assessment & Certification | Generic assessment engine, completion enforcement, certificates | 🟡 in progress (completion + certificates + feedback + assessment engine v1 + completion reporting + rollups + assessment UI + feedback UI + assessment edit + question-bank backend/UI + manual grading v1 done) | A |
| C — Catalog, Paths & Self-service | Learner catalog, self-enroll, learning paths/prerequisites | 🟢 core done (learner catalog + self-enroll UI + prerequisite gating v1 + prereq selector UI + sequenced learning paths v1 + admin paths UI + learner path-progress view) | A |
| D — Platform & Scale | Production readiness → Google OIDC + Directory sync → manager hierarchy (org model) → mandatory assignment + due dates → notifications/escalation → compliance reporting + recertification. Order locked 2026-06-04 (after C closes). | 🟡 in progress (D1 cron self-monitoring done; **D3 v1 org model done**; **D4 assignment+due-dates v1 done**; **D5 assignment reminders + manager escalation v1 done**; **D6 v1.1 compliance report/export + certificate expiry signal + frontend UI verified/closed**; paid hosting + Sentry-account setup + D2 Google OAuth app = owner ops/inputs) | B, C |
| E — Generic scheduling | Generalize booking beyond fixed English slots (session types, rooms, capacity, waitlists, instructors); keep leader-booking as one mode. Committed parallel track; large, own plan. | 🟢 functionally complete (**E1 done** — backend `ALLOWED_TIME_SLOTS` authoritative + exact-slot grid client (2026-06-09); **E2 capacity done**; **rooms done** via re-center Phase 3; **trainer-assignment UI done** (2026-06-10); **durable cancellation done** (2026-06-11, phase-04 A); **waitlists + FIFO auto-promotion + `/me/sessions` learner UI done** (2026-06-11, phase-04 B); **polish done** (2026-06-11) — staff waitlist panel + trainer-only teacher session-list/calendar visibility. Wave closed, verified 2026-06-12) | A |

> **Direction locked 2026-06-04** — full rationale + gap analysis in
> [`ltms-gap-analysis.md`](ltms-gap-analysis.md). Six-month order:
> `C1 → D1 → D2 → D3(manager) → D4(assignment) → D5(notifications) → D6(compliance)` + Wave E parallel.

## Quality gate — done means wired

No feature factory. After each milestone, review wiring before starting new
capability:

- backend route/use-case works with real authz/capability rules;
- frontend entrypoint exists when user value depends on UI;
- i18n en updated for user-facing strings;
- audit log and soft-delete behavior correct for mutations;
- reports/completion/certificates/notifications consume the new data when relevant;
- tests cover happy path, permission denial, and one core edge case;
- broken links/routes/buttons and stale docs/roadmap checked.

Bug fixing and integration review rank above net-new feature rollout.

---

## Milestones — Wave A (foundation, all shipped)

| ID | Milestone | Acceptance | Status |
|----|-----------|-----------|--------|
| M1 | Enforce all 4 scheduling modes | leader/admin/self-enroll/nomination each have a real flow + tests; no 501 stubs | 🟢 done 4/4 (leader/admin team-booking; self_enroll/nomination Admin-schedule cohort sessions over M2 enrollments) |
| M2 | Cohort-based enrollment | `/api/learning/enrollments` (cohort-based, multi-program) + self-enroll path | 🟢 done (enroll/self-enroll/withdraw/list; bulk + session-roster wiring deferred) |
| M3 | Learning CRUD UI | Create/edit Program, create Cohort, enroll learners (not read-only) | 🟢 done (Programs create/edit/archive; Cohort create; per-cohort enroll/withdraw; Admin-gated; i18n en+vi) |
| M4 | Capability-based authz scaffold | `program.manage`/`session.book` style checks behind `policy/` | 🟢 done (`policy/capabilities.js` + `requireCapability`; learning routes wired; Admin superuser, behavior-preserving) |

> Wave A→E and the per-phase kickoffs that followed (B/C/D sub-milestones,
> 2-tier dashboard, re-center phases) are recorded in the changelog below
> (recent) and [`changelog-archive/2026-q2.md`](changelog-archive/2026-q2.md)
> (full history, verbatim).

---

## Recent progress (changelog)

> **Rolling window:** ~last 2 weeks / ~15 entries kept inline (file ≤ ~400
> lines); older entries roll verbatim, newest-first, to
> [`changelog-archive/2026-q2.md`](changelog-archive/2026-q2.md). Currently
> inline: **2026-06-14 → 2026-06-15**.

- **2026-06-15** — **TMS.update fidelity push — full 30-screen audit + Tier 1&2
  to pixel-faithful (13 commits, branch `feat/tms-update-automation-engine`).**
  Audited every prototype screen ([report](plans/reports/fidelity-audit-260615-1016-tms-update-screens.md));
  closed all real deltas honestly (real data only — no fabricated metrics/inert
  UI). **Tier 1 (presentational):** roles Compare + sensitive-cap shield icons ·
  command palette (people/programs/depts) · catalog + audit entity-chips ·
  Programs card-grid w/ real completion health · reconciliation 3-KPI header ·
  session roster Find. **Tier 2 (real backend):** Home onboarding checklist +
  at-a-glance (`GET /dashboard/setup`, 6 real config signals + week counts) ·
  Department-performance table + cards + time-range (new per-dept aggregation:
  headcount/completion/coverage/overdue — serves Overview **and** Departments) ·
  Program completion-trend sparkline (`/programs/:id/completion-trend`,
  certs/month) · **custom fields across all 4 entities** (Program/User/Cohort/
  Session — each value round-trips on its real form, no inert tabs) · **session
  details** (`Schedule.topic/agenda/materials/customFields` metadata + admin
  edit + Agenda/Materials display). Declined as untruthful: audit "hash-chained"
  claim, tri-state roles (binary model), any mock sparkline. Specs folded:
  reporting-and-rollups (setup + dept-perf + completion-trend), attendance
  (PWA offline), scheduling-and-booking (session details), assessments, search.
  Gates per commit: server suites green, client **389 ✓**, lint **63 (cap)**,
  build clean.
- **2026-06-15** — **TMS.update gap #7 — PWA offline attendance (LAST gap; all 7
  now shipped).** Installable PWA for marking attendance with weak/no signal.
  **Client-only** — the server `bulkMark` already upserts per `{scheduleId,
  userId}` (last-write-wins) + audits, so no backend change. New
  `features/attendance/`: `MobileAttendancePage` (today's sessions → big-tap
  present/absent roster + "Mark rest present"), an IndexedDB queue
  (`attendance-offline-db` keyed by (schedule,user) → last-write-wins locally),
  a hand-rolled service worker (`public/sw.js`: app-shell + roster GET caching,
  network-only for other `/api`, **Background Sync** `flush-attendance`) +
  `manifest.webmanifest`, and `useOfflineAttendance` (online/offline tracking,
  queue flush via the CSRF-safe axios client on reconnect / SW message /
  `online` event). SW registered prod-only (main.jsx). New Admin/Teacher route
  `/mobile-attendance` + Operations nav "Mobile (PWA)". Spec: attendance
  (offline-marking requirement). Gates: client **381 ✓** (+8: offline-utils +
  page), lint 63 (cap), build clean (sw.js + manifest emitted).
- **2026-06-15** — **TMS.update fidelity batch (4 vertical slices) — close the
  visible deltas vs the design screenshots (branch
  `feat/tms-update-automation-engine`).** **C · Roles Compare/diff** (screenshot
  14): `RolesAccessPage` gains a Matrix/Compare toggle + a read-only
  `RoleCompareView` (Role A→B selectors, "N differences" badge, →/= per
  capability) over the existing grants — FE-only, no authz change. **E · Command
  palette** (people/programs/departments): `searchService` now also returns
  `LearningProgram` + `Department` matches **for Admin/Teacher** (staff-only;
  Participants unchanged); `SearchPalette` renders the two new groups (programs
  deep-link to `/learning/programs/:id`, departments to People▸Departments).
  **B · Assessment exam-settings** (screenshots 21–22): `Assessment` gains
  `timeLimitMinutes`/`shuffleQuestions`/`showAnswersAfter`; the builder exposes an
  Exam-settings panel + **Preview as learner**; the runner enforces a countdown
  (auto-submit at 0), per-attempt shuffle (display-only — grading stays by
  `itemId`), and post-submit right/wrong reveal (never the answer key).
  **D · Cost/ROI Settings page** (screenshot 27): new Admin `/cost-roi` Configure
  page reusing the existing cost-config form + a server-computed "Computed
  outputs" card (no client math; §10 values). Gates: **server 1035 ✓** (+3 search,
  +2 assessment), **client 373 ✓** (+11), lint 63 (cap), build clean. Specs
  folded: assessments (exam settings) + search (programs/departments). Remaining
  TMS.update gap: **#7 PWA offline attendance**.
- **2026-06-15** — **TMS.update Phase 5 — skills/competency framework (gap #4)
  + branding/template designer (gap #5).** **Skills:** new `Skill` model
  (`programIds[]` program→skill mapping + `targetByRole` + `maxLevel`/
  `coverageTarget`) + `domains/skill/` (CRUD over `/api/skills`, audited +
  soft-delete) gated by `skill.read` (all roles; learner read is self-scoped in
  the controller) / Admin-only `skill.manage`. Proficiency is **DERIVED** from
  issued certificates (level = # of completed contributing programs, capped at
  `maxLevel`) — nothing stored, always re-computable. Endpoints: list + workforce
  holders, `/role-profiles` (per-role required skills + coverage %),
  `/learner/:userId` (proficiency + role gap). The **Learner-360 Skills tab +
  role-readiness card + Skills KPI become real** (were Phase-5 stubs); new Studio
  **Skills page** (`/skills`, Admin, Configure). **Branding:** new singleton
  `TenantConfig` (org name, accent, logo, cert title, email sign-off) +
  `domains/branding/` (`/api/branding`, Admin `branding.manage`, audited) + a
  cached `lib/branding` accessor feeding the **email pipeline** (subjects +
  sign-off now branded; default 'TMS' → byte-identical for an unconfigured
  tenant) and the **certificate verification** response (carries org/title/
  accent/logo). New Studio **Branding page** (`/branding`, Admin) with a live
  certificate preview. *Deferred (v1):* proficiency counts only certified
  completions (uncertified-completion signal) + job-role (vs system-role)
  profiles. Gates: server **1030 ✓** (+10 skill, +5 branding), client **362 ✓**
  (+SkillsPage/BrandingPage/LearnerProfile skills), lint 63 (cap), build clean.
  capability-authz spec + route-matrix updated. Branch
  `feat/tms-update-automation-engine`.
- **2026-06-15** — **TMS.update Phase 4 — automation engine (gap #3).** No-code
  when→if→then rules on the event bus. New `AutomationRule` model + `automation.manage`
  capability + `domains/automation/` (CRUD over `/api/automation/rules`, audited) + a
  **runner** subscribed to the catalogued events: enabled matching rules run their actions
  (`notify` via a new `automation_notice` in-app type / `log`), `runCount++`. **Opt-in**
  (rules default disabled) + fail-soft → zero behaviour change until enabled, no double-firing
  with the existing hardcoded paths. §9 flows seeded **disabled** (the cron-driven ones
  documented, inert until their events publish). Studio **Automation page** (`/automation`,
  Admin, in Configure). Gates: server automation 10 ✓ + full suite green; client 354 ✓; lint
  63; build clean. *Deferred:* publishing the cron-flow events + richer action types.
  Branch `feat/tms-update-automation-engine`.
- **2026-06-15** — **TMS.update Phase 3 — editable roles + custom roles (gap #2).**
  The coarse-authz matrix moves from a static role→capability map to **DB-backed,
  editable grants** without losing the sync `roleHasCapability` (it now reads a live
  in-memory store seeded from the static map + loaded from a new `Role` collection at
  boot — behaviour-preserving until edited). **Admin is lockout-proof** (grants
  immutable). New `role.manage` capability + `domains/access/` (CRUD over
  `/access/roles`, audited, refreshes the live store on every write; legacy read-only
  `routes/accessRoutes.js` retired). `RolesAccessPage` is now **editable** (toggle +
  Save) with **custom roles** (create/delete; Admin column locked). Two-layer authz
  intact. *Deferred:* assigning a user to a custom role (User.role enum). Gates: server
  access suites 32 ✓ + full suite green; client 349 ✓; lint 63; build clean.
  capability-authz spec folded. Branch `feat/tms-update-editable-roles`.
- **2026-06-15** — **TMS.update Phase 2 — custom-field type coverage (gap #6).**
  `CustomFieldDefinition` types `text/select` → **text · number · select · multiselect ·
  date · toggle · user** + a `showIn[]` surface list (form/filter/export). Shared
  `custom-field-input` renderer covers all 7, so the Program builder + cohort forms
  gain them automatically (DRY). Manager UI: 7-type dropdown + showIn toggles. (Program
  Builder UI — gap #1 — already existed as the 5-step `ProgramFormModal`, so Phase 2 =
  gap #6.) Gates: client 347 ✓ · server 995 ✓ · lint 63 · build clean. PR #102 (stacked
  on #101). Branch `feat/tms-update-custom-field-types`.
- **2026-06-15** — **TMS.update value layer — Phase 1 (8 vertical slices).**
  Implemented the north-star redesign's "turn captured data into action + insight"
  layer onto the existing models (branch `feat/tms-update-value-layer`). **S1** drill
  list (`/reports/drill`, Admin) behind the operational KPIs (overdue/expiring/expired
  → filtered learners via the existing compliance report); `StatTile` click-through.
  **S2** executive ROI polish — narrative banner + 4 §10 hero tiles with
  "how it's calculated" tooltips + the **efficiency dividend** (new cost-config
  `coordinatorCount`/`automationHoursReclaimedPerWeek` → `efficiencyDividendMinor =
  hours/wk × coordinators × 52 × hourlyCost`, null until configured). **S3** Program
  detail (`/learning/programs/:id`), **S4** Cohort detail + **roster bulk ops**
  (multi-select · sort · at-risk filter · Issue-cert + **Nudge** + 360 drawer) with a
  new `POST /learning/cohorts/:id/nudge` (`enrollment.manage`, audited, idempotent
  in-app `coordinator_nudge`), **S5** Session detail (one-submit 4-state attendance →
  re-evaluates completion), **S6** admin Learner 360° (`/people/:userId`). **S7**
  Notification center (`/notifications`) + per-category **delivery preferences**
  (`User.notificationPreferences` + `GET/PUT /notifications/preferences`,
  self-scoped, audited). **S8** wired Home alerts → drill + fixed `AlertBand`'s stale
  legacy routes. Composes existing endpoints except the 2 small new write paths
  above (cert-issue already existed → reused). Gates: client 344 ✓, server
  learning/notification suites ✓ (incl. +4 nudge, +3 prefs, +1 efficiency), lint 63
  (cap), build clean. Spec: reporting-and-rollups folded (efficiency dividend +
  cost-config inputs); the nudge + notification-preference write paths are new
  and tracked here (no dedicated notifications capability spec exists yet — same
  as the in-app bell precedent).
- **2026-06-14** — **Studio ▸ Custom fields (Program, complete loop).** The
  design's #1 customization differentiator — admins define extra fields **without
  code**. New `CustomFieldDefinition` model + `domains/custom-field/` CRUD
  (`/api/custom-fields`, Admin-only `settings.manage`, soft-delete, audited;
  text/select types, select-needs-options enforced). **Closes the loop for
  Program:** `LearningProgram.customFields` stores values; the **Program builder**
  renders the org's defined fields (Basics step) and persists them; a defined
  field flows define → builder → save → read. New **Configure ▸ Custom fields**
  page (manage + live preview). Reusable `CustomFieldInput` (no cross-feature
  cycle). Tests: BE (def CRUD · select-400 · teacher-403 · Program value
  round-trip) + FE (page render/loading/error). Route-matrix updated. Gates:
  server learning+custom-field suites 131 ✓, full client 319 ✓, build clean,
  lint ≤ cap. Phase 1 = Program + text/select; more entities/types are the
  extension points.
- **2026-06-14** — **Studio ▸ Roles & access (capability matrix viewer).** First
  enterprise "Configure" surface from the Claude Design hand-off, wired to the
  REAL authz: new **read-only** `GET /api/access/capability-matrix` (Admin-only,
  `settings.manage`) serialises the live `policy/capabilities.js` matrix
  (`roles` · `capabilities` · `grants`). New **Configure** sidebar group +
  `/access` page renders it (roles × capabilities grouped by resource, ✓/— per
  role, Admin = superuser). **Reflects enforcement, does not change it** —
  capabilities stay role-derived (no per-user grants), so it's read-only by
  design (no fake editability). Backend test (admin matrix · teacher 403 · 401);
  page test (matrix render · loading · error). Spec + route-matrix updated. Gates:
  server access suite ✓, full client 316 ✓, build clean, lint ≤ cap.
- **2026-06-14** — **North-star Home, phase 3 (Today's sessions card).** Rebuilt
  the Home `TodayHero` from a compact status band into the prototype's **"Today's
  sessions" list card** — per-session time · class · room · attendance-status
  badge + accent bar, capped at 6 rows with a "+N more", and an "Open calendar"
  link. Real data (attendance calendar, filtered to today); returns null when the
  day is empty. Also restyled the dashboard **Overdue / Expiring** drill lists
  (`DashboardTopLists`) into avatar rows with **"Nd late" / "Nd left"** badges
  (days derived from real due/expiry dates; tone escalates). Presentational;
  `TodayHero` is stubbed in `DashboardPage` tests so none change. Gates: full
  client 313 ✓, build clean, lint 63 ≤ cap.
- **2026-06-14** — **North-star dashboards, phase 2 (Reports ▸ L&D).** Restyled the
  operational + executive dashboards to the prototype's KPI vocabulary by
  upgrading the two **shared** primitives in `DashboardWidgets`: `StatTile` now
  carries a tone-coloured **icon chip** + large tabular value; `MetricBars` fills
  are **threshold-coloured** (success/primary/warning/danger by real %). Wired
  icons/tones through `DashboardOperationalPanel` + `DashboardExecutivePanel`
  (both consume the shared tiles, so both upgrade DRY). Also added the prototype's
  **Overall-completion donut** to the operational dashboard (reuses the existing
  `DonutStat`; segments = real Completed / In-progress / Overdue, zero slices
  dropped). Presentational only — same real-data bundle, props backward-compatible
  (`alert` still reddens). `DashboardTab` test updated (the completion % now shows
  in both the tile and the donut centre). Gates: full client 313 ✓, build clean,
  lint 63 ≤ cap. Next: Home "Today's sessions" card + at-a-glance (phase 3).
- **2026-06-14** — **North-star shell redesign, phase 1 (Claude Design hand-off).**
  Reworked the app shell to the design's topology: **fixed full-height left
  sidebar** (gradient brand mark · **persona-switch card** · role-filtered grouped
  nav with active left-accent bar · signed-in footer) + a **slim sticky topbar**
  that now leads with a **workspace › page breadcrumb** (search · notifications ·
  theme · avatar on the right). Persona switching moved from the avatar dropdown
  into the sidebar card; brand/logo moved topbar → sidebar. **Chrome-only** — nav
  data (`nav-config`), routes, authz and persona semantics unchanged (persona is
  not an authz boundary), so no spec delta. New: `SidebarBrand`/`PersonaSwitch`/
  `SidebarFooter` + `activeItemLabelKey` breadcrumb helper; `Layout`/`Topbar`/
  `Sidebar`/`MobileSidebar` restyled. Topbar test updated (logo → breadcrumb).
  Added a recessed `--background-2` surface token (dark + light) so the sidebar
  reads **darker than content** (the prototype's signature) + a subtle lift on
  Home quick-action tiles. Gates: full client 313 ✓, build clean, lint 63 ≤ cap.
  Next: Home cards + dashboards to north-star fidelity (phase 2/3).
- **2026-06-14** — **Program / Delivery Builder (Claude Design north-star → real
  UI).** Reworked the program create/edit modal (`ProgramFormModal`) into the
  design hand-off's guided **5-step builder** (Basics → Delivery → Completion →
  Certificate → Review) + sticky **live preview**; `schedulingMode` now a
  friendly delivery-profile picker. **Pure UX upgrade** — identical API payload +
  mutations, no model/behavior change (every field already enforced server-side),
  so no spec delta. Modularized under `features/learning/program-builder/`
  (`program-form-config` + `ProgramBuilderControls`/`Steps`/`ProgramLivePreview`).
  Builder test rewritten to drive the wizard (same payload assertions). Gates:
  learning suite 82 ✓, full client 313 ✓, build clean, lint 63 ≤ cap.
- **2026-06-14** — **Converge Phase 2: Enrollment convergence (read layer) — one
  Enrollment, two modes.** Both enrollment shapes already share ONE `Enrollment`
  model (team-based = `teamId` set; cohort-based = `teamId:null`); Phase 2
  converges them at the **read layer** WITHOUT a model merge or data move. New
  unified self read **`GET /api/learning/enrollments/mine`** (`enrollment.self`/
  `enrollment.read`, self-scoped) returns the caller's enrollments across BOTH
  modes in one shape, each tagged `mode: 'group'` (joined via a team) or
  `mode: 'direct'` (enrolled straight in) — `domains/learning/enrollment` gained
  `listEnrollmentsForLearner` + `getMyEnrollments` + `myEnrollmentDto` + the
  controller/route. The learner **"My programs"** list (`MyProgramsPage`) now
  consumes it (was cohort-only), so a **team-booked learner finally sees their
  cohort there** (card falls back to the enrollment's `cohortName` when the cohort
  isn't in the open catalog). Additive — existing flows unchanged. Tests: +6 server
  integration (`myEnrollments`: empty / group / direct / both / self-scope / auth)
  + MyProgramsPage test updated to assert both modes — **server 978/100, client
  313**, lint 63, build clean. Spec `enrollment` + domain-model rule updated. The
  two **write** paths (team membership sync vs cohort enroll) + routing team
  enrollment through the event bus stay a follow-up. ADR
  `converge-to-one-training-model`. Next: Phase 3 — generalise Scheduling.
- **2026-06-14** — **Converge Phase 1: Assessment convergence (Evaluation →
  Assessment) — one concept, two modes.** Cleared the "dual assessment systems"
  deferral WITHOUT a destructive model merge: Assessment is now the single concept
  with two *modes* — learner-attempted **quiz** + instructor-scored **evaluation**
  (the English 4-skill rubric). New unified read **`GET
  /api/assessment/results/mine`** (`assessment.read`, self-scoped) returns the
  caller's results across BOTH modes in one shape (`{source, title, scorePercent,
  passed, date}`, newest-first) — `domains/assessment` gained
  `listEvaluationsForLearner` + `getMyResults` + `attemptResultDto`/
  `evaluationResultDto` + the route. The **learner transcript** (`MyTranscriptPage`)
  now consumes it, so an instructor evaluation appears alongside quiz results
  (tagged "Instructor"). Completion was already unified (`evaluation OR
  passingAttempt`). Additive — existing flows unchanged. Tests: +5 server integration
  (`assessmentResultsMine`: empty / evaluation / quiz / both / self-scope) + transcript
  test updated — **server 972/99, client 313**, lint 63, build clean. Specs
  `assessments` + `evaluations` + domain-model rule updated (deferral cleared). The
  English rubric-grading UI folds into the unified assessment UX in Phase 4. ADR
  `converge-to-one-training-model`. Next: Phase 2 — converge Enrollment.
- **2026-06-14** — **Converge Phase 0 COMPLETE: event bus (2 flows) + authz
  finished (no behaviour change).** Part A extended: `certificate_issued` bell row
  now also rides the event bus (`CERTIFICATE_ISSUED`, published by the completion
  engine) alongside `cohort_enrolled` — both off inline `recordInApp`. Part B
  (authz): the **9 Admin-only platform routers** (`users`, `settings`, `import`,
  `export`, `sync`, `dashboard`, `admin/audit`, `admin-db`, `admin/reconcile`)
  migrated from `roleGuard('Admin')` to `requireCapability` with 6 new Admin-only
  capabilities (`user.manage` · `settings.manage` · `data.transfer` ·
  `analytics.read` · `audit.read` · `system.ops`) — so the app uses ONE coarse-authz
  mechanism. **Parity guaranteed** (all Admin-only; Admin is superuser; new caps
  added to no other role) — server **967/98** green, no regression. Intentionally
  still on `roleGuard` (documented): `/api/auth` + `/api/admin/cron` (security/cron)
  and the converging-legacy trio (`classes`/`enrollments`/`evaluations`, retired in
  their convergence phase); scheduleService booking/roster notifications migrate in
  Phase 3. Specs: `capability-authz` + route-permission-matrix updated (mechanism
  note; outcomes unchanged). Next: Phase 1 — converge Assessment.
- **2026-06-14** — **Converge Phase 0 (Part A): in-process domain-event bus +
  first flow migrated (no behaviour change).** New `lib/event-bus.js`
  (publish/subscribe; subscribers run awaited after the mutation persists, a
  throwing subscriber is logged + isolated) + `domains/_shared/events.js`
  (event catalogue) + `domains/notification/subscribers.js` (registered once at
  boot in `server.js`). First cross-cutting concern moved off inline wiring: the
  `cohort_enrolled` bell row now reacts to **`ENROLLMENT_CREATED`** (published by
  `domains/learning/enrollment` single + bulk) instead of an inline `recordInApp`
  call — the use-case no longer imports the notification layer. **Byte-parity**
  held: the existing enrollment integration tests (admin-enroll writes / self-enroll
  doesn't / bulk) pass unchanged. Tests: +6 event-bus unit — **server 967/98**, no
  regression. Pure refactor → no spec change. Next: migrate more concerns
  (audit/completion) + Part B (finish authz roleGuard→capability).
- **2026-06-14** — **Re-architecture decision: converge to ONE training model
  (Option A).** Owner judged the system still "messy" post-IA and asked for a
  whole-system re-architecture vs best-in-class references. Analysis
  (`plans/reports/architecture-260614-0004-rearchitecture-proposal.md`) found the
  root cause is **two parallel worlds for the same domain** (English-class vs generic
  L&D — same Mongo models behind a `mode` flag, dual enroll/assess/session). Owner
  chose **full convergence** to one spine `Program → Session → Enrollment →
  Completion → Certificate` (English-class = a delivery profile). Recorded ADR
  `docs/decisions/converge-to-one-training-model.md` (supersedes the 2026-06-12
  separation; completes the 2026-06-09 coordinator-scheduled re-center;
  `leader_booking` → one scheduling mode). Phased plan
  `plans/260614-0004-converge-to-one-model/` (Phase 0 foundations: domain-event bus +
  finish authz → Assessment → Enrollment → Scheduling → UX journeys → retire legacy
  routes). Guardrails kept (modular monolith, no physical renames, Mongo→PG gate,
  security layers). Docs/decision only this entry — implementation starts next.
**Older entries (2026-06-13 and earlier)** →
[`changelog-archive/2026-q2.md`](changelog-archive/2026-q2.md) (118 entries,
2026-06-01 → 2026-06-13).

---

## How to keep this current

After each milestone or significant change: update the phase/wave %, move the
status emoji, refresh the **Status board** (Now / Next), and add one dated line
at the top of *Recent progress*. Strategy detail stays in `lms-roadmap.md`.

**Rolling archive (keeps this file lean):** keep ~the last 2 weeks (~15 entries,
file ≤ ~400 lines) inline; in the SAME commit, cut older entries verbatim
(newest-first — they are an audit trail, do not reword) into
`changelog-archive/<year>-q<quarter>.md` and update its coverage header.
