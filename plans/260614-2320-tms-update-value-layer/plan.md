# TMS.update — Phase 1: Front-end Value Layer

**Source:** `design_handoff_tms_update/` (README gap map + Developer Handoff §1–14 + 22 screenshots).
**Goal of Phase 1:** turn already-captured training data into *action + insight* — operational/executive
dashboards with click-through, the 4 detail pages, cohort roster bulk ops, real modals, ⌘K, notification center.
**Constraints:** build on existing feature folders; two-layer authz (capability + resource policy) + audit on every
write; match screenshots with `client/src/index.css` tokens; English-only; keep lint ≤ cap (63); tests green.

---

## Exists-vs-build (verified against code 2026-06-14)

| Prototype surface | Status in ConCho2 | Action |
|---|---|---|
| Shell / sidebar / persona switch | ✅ `components/Layout`, `Topbar`, `PersonaContext` (admin/learner) | extend: add **Manager** persona (My Team) |
| ⌘K command palette | ✅ `components/SearchPalette.jsx` (wired in Topbar) | enrich: entity nav + quick actions |
| Home (alerts, today's sessions, onboarding) | ✅ `features/dashboard/DashboardPage` (+NextActions/QuickActions/AdminAnalytics) | wire alert cards → drill/attendance |
| Reports · Overview (KPIs, by-program, dept table) | ✅ `features/learning/Dashboard*Panel` + `DashboardTopLists` via `/learning/dashboard/operational` | **add click-through** (KPIs/rows → drill) |
| Reports · Executive ROI | ✅ `DashboardExecutivePanel`+`Kirkpatrick`+`CostConfig` via `/learning/dashboard/executive` | verify vs §10 + add "how calculated" tooltips/narrative |
| Drill list (filtered learners) | ⚠️ only embedded top-N | **build** `DrillListPage` route |
| Program detail page | ❌ programs are tabs+modals in `LearningPage` | **build** `/learning/programs/:id` |
| Cohort detail (roster bulk/sort/drawer) | ❌ `CohortsTab` is a list | **build** `/learning/cohorts/:id` |
| Session detail (one-submit attendance) | ❌ (attendance marking lives in English/calendar) | **build** `/learning/sessions/:id` |
| Learner profile 360 (admin) | ❌ only self `/me/*` | **build** `/people/:userId` |
| Notification center + delivery prefs | ⚠️ `NotificationBell` only | **build** `/notifications` page (+prefs backend) |
| Modals: New cohort / Enroll / Assign | ✅ exist in `features/learning` | reuse |
| Modals: Issue cert / Message / Nudge | ❌ | **build** (+ small backend endpoints) |

### Small backend additions Phase 1 needs (not "pure front-end")
- **Manual certificate issue** endpoint — cap `certificate.manage` (exists) + policy + audit. (Certs today only auto-issue via completion engine.)
- **Nudge / message cohort or learner** — reuse `domains/notification/in-app-writer` + mailer; new thin endpoint + audit.
- **Notification delivery preferences** — new per-user prefs store (User subdoc or small model) + GET/PUT; `NotificationLog` has category/channel but no prefs.
- **Admin learner-360 read** — mostly composes existing (`getCompletion?learnerId`, `getCertificates`, transcript); add admin-scoped transcript read if gap.

---

## Vertical slices (each = verify/extend API → UI → test; run `client npm run test:run` + lint + build)

- **S1 — Operational click-through + DrillListPage.** KPI tiles (overdue, expiring) + dept rows navigate to a filtered learner list. Reuses operational/compliance endpoints. *No backend.*
- **S2 — Executive ROI polish.** Map exec endpoint to §10 (coverage, cost/completion, efficiency dividend, Kirkpatrick L1–L2 measured / L3–L4 flagged); add assumption tooltips + narrative banner; admin-only. *Verify backend only.*
- **S3 — Program detail page** (`/learning/programs/:id`): overview (trend+funnel+cohorts+policy) · cohorts · curriculum · analytics · settings. Nav from Programs cards. *Read-only; composes existing.*
- **S4 — Cohort detail page** (`/learning/cohorts/:id`): roster multi-select + bulk Assign/Nudge/Issue-cert + sortable cols + at-risk filter + 360 drawer; tabs overview/sessions/assessment/policy. *Backend: cert-issue + nudge endpoints.* (Largest slice.)
- **S5 — Session detail page** (`/learning/sessions/:id`): one-submit attendance (present/late/absent/excused + all-present + live ring) → submit re-evaluates completion (`completion.recorded`). Reuses attendance + completion engine.
- **S6 — Learner profile 360 (admin)** (`/people/:userId`): header + 6 KPIs; tabs overview (current programs + role readiness + suggested next) · transcript · skills(stub→Phase 5) · certificates · activity.
- **S7 — Notification center** (`/notifications`): feed + category filters + per-category delivery prefs (in-app/email) + daily-digest toggle. *Backend: prefs store + endpoint.*
- **S8 — Modals + ⌘K + Home alerts wiring.** Finish Issue-cert/Message modals, enrich ⌘K (entity nav + quick actions), wire Home alert cards. (Absorbs leftovers from S4/S6.)

**Recommended order:** S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 (leverage-first; dashboards land value fastest, detail pages build on each other, backend-touching slices spaced out).

## Progress
- ✅ **S1 — Operational click-through + DrillListPage** (2026-06-14). `DrillListPage` at `/reports/drill` (Admin-only) over the existing compliance report; `StatTile` optional `to`; Overdue/Expired/Expiring tiles drill through. Tests: new `DrillListPage.test.jsx` (4) + `DashboardTab` router wrapper. Suite 327✓, lint 63 (cap), build clean. No backend changes.
- ✅ **S2 — Executive ROI polish** (2026-06-15). Narrative banner + 4 ROI hero tiles (coverage / completions-12m / cost-per-completion + ATD benchmark / **efficiency dividend**) each with a "how it's calculated" tooltip (§10 formulas visible); deduped coverage + cost-per-completion. Backend: cost-config gains `coordinatorCount` + `automationHoursReclaimedPerWeek`; executive financials computes `efficiencyDividendMinor = hours/wk × coordinators × 52 × hourlyCost` (null until configured — never fabricated). Tests: +1 server integration (efficiency calc), +2 client exec-panel; client 329✓, server dashboard 14✓, lint 63, build clean.
- ✅ **S3 — Program detail page** (2026-06-15). `/learning/programs/:id` (Admin/Coordinator/Teacher); Programs table rows now navigate here. Header + 5 real KPIs (enrolled/cohorts/completion/completed/certificates from completion rollup) + tabs Overview (learner funnel + completion policy) · Cohorts (link → cohort detail) · Curriculum · Analytics · Settings (full config + Edit-in-builder modal). New `useLearningProgram(id)` hook. Composes existing endpoints — no backend. Tests: +3 client; suite 332✓, lint 63, build clean.
- ✅ **S6 — Learner 360° (admin)** (2026-06-15). `/people/:userId` (Admin — `usersAPI.getById` is Admin-gated); makes the cohort-roster drawer's "View full profile" links live. Header + 6 KPIs (completed / in-progress / certificates / completion; skills + learning-hrs honestly "—" until Phase 5) + tabs Overview (current programs → cohort detail + Phase-5 role-readiness note) · Transcript · Skills (Phase-5 stub) · Certificates · Activity (timeline from certs + enrollments). Composes `useUser` + learner-scoped `getEnrollments({learnerId})` + `getCertificates({learnerId})` — no backend. Tests: +3 client. Suite 340✓, lint 63, build clean.
- ✅ **S5 — Session detail (one-submit attendance)** (2026-06-15). `/learning/sessions/:id` (Admin/Teacher); reached from the cohort detail's new **Sessions** tab. Full 4-state marking (Present/Late/Absent/Excused) per learner + "All present" + live present-ring + per-state counts + "N still unmarked"; submit → `bulkMark` (re-evaluates completion policy server-side). Reuses `schedulesAPI.getById` + `attendanceAPI.getBySchedule` + `useBulkMarkAttendance` — no backend; not a duplicate of the calendar-drawer marker (full-page, 4-state). Tests: +2 client (load+all-present, individual 4-state). Suite 337✓, lint 63, build clean.
- ✅ **S4 — Cohort detail + roster bulk ops** (2026-06-15). `/learning/cohorts/:id`; Cohorts table code links here. Header + 5 KPIs (enrolled/completion/avg-attendance/assessment-pass/certificates from the cohort completion report). **Roster centerpiece** (`CohortRosterTab`): multi-select, sortable columns (learner/attendance/status), at-risk filter + department chips, bulk **Issue cert** (loops existing `POST /learning/certificates`) + **Nudge**, 360 learner drawer (→ profile S6). Backend: **nudge endpoint** `POST /learning/cohorts/:id/nudge` (`enrollment.manage`, audited, idempotent per learner/day via `coordinator_nudge` NotificationLog type). Cert-issue endpoint already existed — reused. New hooks `useLearningCohort`/`useIssueCertificate`/`useNudgeCohort` + api bindings. Tests: +4 server (nudge: 201/idempotent/403/404), +3 client roster; client 335✓, server learning+notif green, lint 63, build clean.

## Definition of Done (per slice + phase)
Code per conventions · capability + resource-policy + audit on writes · `client npm run test:run` + lint(≤63) + `vite build` green · backend slices ship integration tests · update `docs/development-roadmap.md` + capability spec(s) when behavior changes · commit (conventional, no AI refs); confirm before push.

## Open questions
1. Learner-360 route: `/people/:userId` vs `/users/:id` (PeoplePage is a composition shell)? — proposing `/people/:userId`.
2. Notification prefs storage: subdoc on `User` vs small `NotificationPreference` model? — proposing User subdoc (KISS).
3. Manual cert issue: confirm it should be admin-triggerable (vs completion-only) — prototype shows a bulk "Issue cert" action, implying yes.
