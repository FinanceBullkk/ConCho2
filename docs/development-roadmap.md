# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **Canonical progress tracker.** Status board first, then milestone tables,
> then the recent changelog. Full history → [`changelog-archive/`](changelog-archive/).
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot (archived)* → [`archive/handoff-2026-06-01.md`](archive/handoff-2026-06-01.md)
>
> **Last updated:** 2026-06-13

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
> inline: **2026-06-12 → 2026-06-13**.

- **2026-06-13** — **IA rework Phase 02: persona modes (Admin Console ↔ My
  Learning).** New `context/PersonaContext.jsx` (localStorage-backed) swaps which
  sidebar group-set renders; avatar-menu switch toggles it. Participants are
  **locked** to the learner persona; staff default to admin and may switch. The
  learner group-set surfaces the `/me/*` pages (My programs · Catalog · My
  sessions · Paths · Assessments · Feedback · Transcript) + English Class
  (access-gated). The `/me/*` routes were **opened to all authenticated users**
  (drop the Participant-only `ProtectedRoute` — reads are self-scoped server-side,
  so staff can review their own learning; persona is UI-only, never the authz
  boundary). New `LEARNER_GROUPS` in `nav-config.js`; `PersonaProvider` wraps the
  app. Tests: +7 (PersonaContext defaults/lock/persist; Sidebar learner-mode
  group-set + English access) — client **311**, lint at cap 63, build clean.
  Phase 03 (flatten tab strips) next.
- **2026-06-13** — **IA rework Phase 01: left sidebar app shell (enterprise nav).**
  After owner found the top-tabs model unsatisfactory, researched how
  Docebo/TalentLMS/SAP SuccessFactors/360Learning organise IA (report:
  `plans/reports/research-260613-2304-lms-ia-navigation-patterns.md`) → owner chose
  the **left sidebar + persona** pattern. Phase 01 (shell only, **zero behavior
  change**): replaced the top horizontal `Navbar` with a **slim Topbar** (logo ·
  search · notifications · theme · avatar) + a **role-filtered left Sidebar** of
  grouped nav (Training · Insights · Manage + Home + manager My Team) + a **mobile
  drawer** (`< md`). Nav defined once in `components/nav/nav-config.js`; inaccessible
  items are now HIDDEN (not disabled) per the enterprise "see only what you can act
  on" pattern; System moved from the avatar dropdown into the sidebar. Routes/pages
  unchanged; in-page tab strips remain (flattened in Phase 03); persona switch
  (Admin Console ↔ My Learning) is Phase 02. New `components/nav/{nav-config.js,
  Sidebar.jsx,Topbar.jsx,MobileSidebar.jsx}`; `Navbar.jsx` retired; `Layout.jsx`
  recomposed. Tests: +11 (Sidebar role-filter/active-state, Topbar search/menu/
  hamburger) — client **304**, lint at cap 63, build clean. Plan
  `plans/260613-2304-sidebar-persona-ia/` (phases 02–03 pending).
- **2026-06-13** — **IA cleanup: dedupe surfaces + regroup nav (frontend-only,
  no behavior change).** Addressed owner feedback that the admin UI was
  "all-in-one, hard to use". Four moves: **(A)** removed the duplicate **Sheets
  Sync** tab from Reports — it was a second mount of the same `SyncPage`;
  `sync:sheets` is Admin-only so it stays in **System▸Sync** (next to
  Reconciliation), zero access loss. **(B)** **Consolidated ALL reporting into
  `/reports`** — moved Learning's *Dashboard* + *Reports* tabs out, so Reports is
  now **Overview · L&D Dashboard · Completion · Attendance · HR Export** and
  Learning drops **8 → 6 tabs**. **(C)** **Grouped Learning's 6 tabs** into
  **Catalog** (Programs·Cohorts·Paths) ‖ **Delivery**
  (Assignments·Assessments·Feedback). **(D)** **Home is now a lightweight
  landing** — greeting + AlertBand + TodayHero + **contextual QuickActions tiles**
  (live operational signals — overdue learners, expiring certificates, sessions
  next 7 days, completion rate — each linking where you act; one shared fail-soft
  `useOperationalDashboard` query, NOT nav shortcuts) + a "View analytics" CTA;
  the heavy admin training analytics was extracted into
  **`features/dashboard/AdminAnalyticsPanel.jsx`** (now Reports▸Overview). New
  `read:dashboard` perm (Admin-only); Coordinator gains the Reports nav (holds
  `read:reports`). New `features/dashboard/{AdminAnalyticsPanel,QuickActions}.jsx`;
  `DashboardPage` slimmed; stale `/learning?tab=dashboard|reports` bookmarks fall
  back gracefully to Programs. **No backend/spec change** (UI location only).
  Tests: client **293** (DashboardPage rewritten for landing branches;
  +AdminAnalyticsPanel UX-09 query gate; +QuickActions contextual-tile suite;
  ReportsPage tab set updated), lint at cap 63, build clean. Plan
  `plans/260613-2055-ia-dedupe-and-regroup-nav/`.
- **2026-06-13** — **Phase 3/4/5 push closed + re-baselined (docs-only).** After
  the 7-PR run (#80–#86) the genuine non-deferred migration debt for phases 3/4/5
  is shipped, so they are re-baselined **🟢 near done** (3 ~85%, 4 ~82%, 5 ~80%)
  with the remainder declared **deferred-by-design, not debt** (nomination
  workflow · Evaluation→Assessment convergence · report presets · already-expired/
  path-based recert; `deliveryMode` metadata-only). Status board consolidated;
  `system-overview` scorecard synced (was a stale 78/78/72). No code change —
  next is owner's call (Phase 6 PostgreSQL readiness, owner-ops, or overriding a
  deferral).
- **2026-06-13** — **Recertification auto-assignment — recert loop CLOSED
  (phase 5 → ~80%).** The certificate-expiry signal now becomes an **action**:
  for a program that opts in (new **`LearningProgram.recertifyPolicy.autoAssign`**,
  default off — settable in the program form), the daily cert-lifecycle job
  auto-creates a recert **`Assignment`** (program target, the single learner,
  `dueDate = validUntil`) for each Issued cert expiring within 30 days. The new
  Assignment rides the existing machinery (learner `/home` feed, reminder
  cadence, manager overdue digest) — no new surface. **Idempotent**: at most one
  recert assignment EVER per cert via new **`Assignment.sourceCertificateId`** +
  a partial unique index + an existence check (incl. archived → an Admin who
  archives it is respected). New `domains/learning/completion/recert-assignment-
  service.js`; the `certificate-expiry-reminders` cron now composes reminders +
  recert in one monitored run. v1 acts in the pre-expiry window only. Tests: +5
  server integration (`recertAssignment`: creates / idempotent / archived-not-
  recreated / opt-out untouched / outside-window) + 1 client (`ProgramFormModal`
  carries `recertifyPolicy`) — server 961/97, client 285/64, lint 63, build
  clean. Specs `compliance-and-recertification` (new requirement, deferral
  cleared) + `learning-catalog` updated. Plan
  `plans/260613-1845-recertification-auto-assignment/`.
- **2026-06-13** — **Manager digest of expiring certificates (phase 5 → ~77%).**
  The daily certificate-expiry cron now also sends each **manager a weekly
  digest** of their direct reports' soon-to-expire certificates
  (`manager_certificate_expiry_digest`, email + `/my-team` bell item, idempotent
  per manager per ISO-week via `manager_cert_expiry_<isoWeek>` — mirrors the
  assignment overdue digest). Built into the same scan (`expiry-reminder-service`
  now populates `userId.managerId` and groups by manager); new
  `sendCertificateExpiryManagerDigest` email template + bell presenter. Reuses
  the assignment manager-digest ISO-week cadence helper. Tests: +3 server
  integration (digest sent + learnerCount, weekly-idempotent, no-manager → none)
  — server 956/96. Specs `compliance-and-recertification` (deferral cleared) +
  `assignments-and-reminders` (presenter) updated.
- **2026-06-13** — **`facilitatorPolicy.visibility` enforced — phase-3 policy
  debt fully closed (phase 3 → ~85%).** For a program flagged
  **`visibility: assigned_only`**, a Teacher now reaches its sessions — list,
  detail, AND attendance mark/read — ONLY when named on that session's
  `sessionInstructorIds`; the standing cohort-teacher binding no longer grants
  access (Admin unaffected). New `domains/schedule/facilitator-visibility-
  policy.js` (`isCohortAssignedOnly` / `assignedOnlyCohortIdSet`) centralises the
  program-policy lookup; `policy/sessionInstructors.canMarkSession` gained an
  `assignedOnly` option (default false → the existing cohort-binding UNION is
  unchanged, so program-less / `all_facilitators` programs behave exactly as
  before — zero regression). Wired at all three teacher-visibility points
  (session `buildFilter`, `getSession`, attendance controller authz). The policy
  is settable via the program form (#82). **`deliveryMode` reclassified as
  metadata-only by design** (no behavioural contract → nothing to enforce), so
  NO program-policy field remains as unintended debt. Tests: +3 unit
  (`sessionInstructorsPolicy` assigned_only branch) + 5 integration
  (`facilitatorVisibility`: list hides unnamed, detail/attendance 403 vs named,
  admin unaffected, default unchanged) — server 953/96. Specs `learning-catalog`
  + `attendance` + domain-model rule updated.
- **2026-06-13** — **Certificate expiry reminders — recertification signal
  (phase 5 → ~75%; closes the D6 "remaining later" item).** A daily
  `CRON_TOKEN`-protected, `CronRun`-monitored job
  (`POST /api/cron/certificate-expiry-reminders`) warns a learner before an
  Issued certificate lapses. New `domains/learning/completion/expiry-reminder-
  service.js` scans `Issued`, non-deleted certs with `validUntil` within 30 days
  (and not past) and emails the learner, idempotent per cert per bucket via a
  `NotificationLog` `cadenceKey` `<certNumber>:expiry_30|7` (8–30 days /
  0–7 days). Reuses the assignment-reminder infra wholesale — the
  `certificate_expiring` email row **doubles as the in-app bell item** (a
  no-email learner still gets a `skipped` bell row), links to `/me/transcript`.
  New `sendCertificateExpiring` email template + `CRON_JOBS.certificateExpiry`
  (01:30 UTC) + cron-pinger runbook ping + cron-health label. Recertification is
  signal-only (no auto-assignment yet). Tests: +6 server integration (cadence
  buckets / idempotency / no-email skip-but-bell / revoked-deleted-expired no-op
  / cron-route auth+heartbeat); cron-health job-count test bumped 3→4. server
  945/95, client lint 63, build clean. Specs `compliance-and-recertification`
  (new requirement, deferral cleared) + `assignments-and-reminders` (in-app
  presenter) updated. Plan `plans/260613-1715-certificate-expiry-reminders/`.
- **2026-06-13** — **Program Policies editor UI (phase 4 → ~82%).** Closes the
  "enforced but only API-settable" gap: the program form (`ProgramFormModal`)
  now has a **Policies** section so Admins can configure all enforced program
  policies that previously had NO UI — `completionPolicy` (attendance threshold
  %, requires-assessment, requires-feedback), `certificateValidityDays` (blank =
  never expires), `capacityPolicy` (max per cohort / per session, blank = no
  limit), and `facilitatorPolicy` (assignment-required toggle + visibility).
  Nested form state with null↔blank normalisation; the program API + DTO already
  round-tripped these fields, so backend was unchanged. This makes the
  just-shipped `facilitatorPolicy.assignmentRequired` enforcement (and the older
  completion/capacity enforcement) reachable without hand-crafting API calls.
  Tests: +2 client component (`ProgramFormModal` — create payload carries the
  policy objects; edit mode prefills them) — client 285/64, lint at cap 63,
  build clean. Spec `learning-catalog` updated.
- **2026-06-13** — **`facilitatorPolicy.assignmentRequired` enforced (phase 3
  policy-debt closed → ~82%).** A `LearningProgram` that requires a facilitator
  can no longer have its sessions *run* (attendance marked) until a trainer is
  assigned — new `domains/schedule/facilitator-assignment-policy.js`
  (`assertFacilitatorAssigned`) gated at the attendance-marking chokepoint
  (`domains/attendance/marking.bulkMark`). A session "has a facilitator" when it
  has a per-session internal trainer (`sessionInstructorIds`), an
  `externalTrainer`, or a cohort-bound teacher (`Class.teacherIds`); otherwise
  marking → **422** (applies to every actor incl. Admin; the remedy — assign a
  trainer — is reachable from the cohort sessions panel). No-op for program-less
  classes / programs that don't require a facilitator (default), so existing
  data is unaffected unless an Admin opts in (policy set via the program API,
  same as `completionPolicy`/`capacityPolicy` — none have a form editor yet).
  Tests: +4 attendance integration (missing→422, instructor→OK, cohort
  teacher→OK, policy-off→OK) — server 939/94. Specs `learning-catalog` +
  `attendance` updated; domain-model rule's enforcement-truth line corrected.
  Still persisted-not-enforced: `deliveryMode`, `facilitatorPolicy.visibility`.
- **2026-06-13** — **Bulk cohort enrollment (phase 3 + 4 → ~80%).** Closes the
  M2 "bulk enrollment" deferral: an Admin can now enroll many learners into a
  cohort in one action. New **`POST /api/learning/enrollments/bulk`**
  (`enrollment.manage` only — no self path; zod `{cohortId, userIds[1..500]}`)
  is **partial-success** — each learner attempted independently, per-learner
  skip reason returned (`already_enrolled` / `cohort_full`) instead of failing
  the batch; the cohort + `capacityPolicy.maxParticipants` are read once and the
  cap holds across the batch; each admitted learner gets the same
  `cohort_enrolled` bell row as single enroll (DRY); one batch audit entry.
  Frontend: **`EnrollLearnersModal`** swapped its single-select for a filterable
  multi-select (checkbox list + select-all + "Enroll N"), reporting
  enrolled/skipped counts via toast (`useBulkEnrollLearners` +
  `learningAPI.bulkEnroll`). Tests: +5 server integration (bulk happy /
  duplicate-skip / capacity-skip / non-admin 403 / empty-400) + 2 client
  component (new `EnrollLearnersModal` suite) — server 935/94, client 283/63,
  lint at cap 63, build clean. Spec `enrollment` requirement + AC added.
- **2026-06-13** — **Notification bell: roster `session_enrolled` — coverage
  deferral fully CLOSED.** New in-app-only type **`session_enrolled`** notifies
  everyone auto-added to a session roster *by someone else's action*: the rest
  of the team on a leader booking (the booker is excluded — they already get
  `booking_confirmed`) and the cohort enrollees on an admin/coordinator-scheduled
  cohort session. One shared `scheduleService` helper **`notifyRosterEnrolled`**
  fires from all three create chokepoints (`bookSlot` / `bookCohortSlot` /
  `adminCreate`), via the same fail-soft + idempotent `recordInApp`
  (`<scheduleId>:<userId>` key, link `/me/sessions`). ZERO client change (server
  `dto` maps the new type). Tests: +1 booking integration (members get
  `session_enrolled`, booker does not) + cohort-session test extended to assert
  enrollee rows — server 930/94, client lint 63, build clean. Spec
  `assignments-and-reminders` updated; the post-Cohesion notification-coverage
  backlog is now empty.
- **2026-06-13** — **Notification bell coverage broadened: `cohort_enrolled` +
  `booking_confirmed`** (closes the post-Cohesion backlog deferral). Two more
  in-app-only events now reach the bell, both written through a new shared
  fail-soft + idempotent writer **`domains/notification/in-app-writer.js`**
  (`recordInApp` — the existing `certificate_issued` write was refactored onto
  it, DRY): **`cohort_enrolled`** fires when an Admin direct-enrolls a learner
  into a cohort (NOT on self-enroll — the UI already confirms that), keyed by
  the enrollment id, recipient = the learner, link `/me/programs`;
  **`booking_confirmed`** fires when a leader books a team slot (mirrors the
  existing booking-confirm email), keyed by `<scheduleId>:<userId>`, recipient =
  the booker, link `/me/sessions`. Each is `channel:'in_app'` (no email) and
  best-effort — a logging hiccup never blocks the enrollment/booking. ZERO
  client change (server `dto` maps the new types). Tests: +2 enrollment
  integration (admin-enroll writes / self-enroll does not) + 1 booking
  integration — server 929/94, client lint 63, build clean. Spec
  `assignments-and-reminders` (In-app feed requirement) updated; remaining bell
  deferral: notify auto-enrolled team members + cohort-session direct
  enrollment.
- **2026-06-13** — **Post-Cohesion review + notification coverage follow-up.**
  An integration review of the woven learner experience (`/me/*` + bell +
  transcript) verified no broken links and correct self-scoping/authz. Closed
  the top finding (P5 bell only surfaced 4 logged types): certificate issuance
  now writes a fail-soft, idempotent **`certificate_issued`** `NotificationLog`
  (new `channel:'in_app'` — no email; keyed by `certificateNumber`) so earned
  certificates appear in the bell → `/me/transcript`. Also tuned the bell poll
  60s → 180s (still refetches on tab focus) to cut idle load. server 926/94
  (completion suite asserts the in-app write + cleans `NotificationLog`),
  client 281/62, lint 63, build clean. Deferred (backlog): logging
  booking-confirm / direct-enrollment events for fuller bell coverage.
- **2026-06-13** — **Cohesion P6: learner transcript — Cohesion Wave COMPLETE
  (6/6)** (plan `plans/260612-2058-cohesion-wave/` P6). New Participant route
  **`/me/transcript`** (`MyTranscriptPage`): one print-friendly record of the
  learner's training history — **programs & certificates** (enrollments joined
  with the open-cohort catalog + the mine-scoped certificate list: number,
  state, validity), an **attendance summary** (`/attendance/my-stats`:
  rate/present/late/excused/absent), and **passed assessments** (own attempts
  filtered to `passed`, titles joined from the assessment list). **ZERO new
  backend** — pure client composition over existing self-scoped reads;
  "export" = browser **Print / Save-as-PDF** (`window.print` + a scoped
  `@media print` rule that drops the app chrome). Entries: a "View transcript"
  link on `/me/programs` + a dashboard CTA. +3 component tests (compose / empty
  / print). client 281/62, lint at cap 63, build clean. **Closes the Cohesion
  Wave** (P1–P6); next is an integration/wiring review, not net-new.
- **2026-06-13** — **Cohesion P5: in-app notification bell** (plan
  `plans/260612-2058-cohesion-wave/` P5). A **read-feed over the existing
  email `NotificationLog`** surfaces notifications in-app — no new write path,
  email channel unchanged. New thin domain `server/domains/notification/`
  (`/api/notifications`): self-scoped **`GET /mine`** (items + `unreadCount`,
  excludes transient `pending` rows), **`POST /:id/read`**, **`POST /read-all`**
  — all gated by a new role-wide **`notification.read`** capability and scoped
  to the caller via `recipientUserId` (another user's id can never match →
  marking it 404s). `NotificationLog` gained a nullable **`readAt`** (in-app
  read state, independent of email `status`) + a `{recipientUserId,createdAt}`
  index; mark-read is the caller's own UI state so it is intentionally NOT
  audited. Client: **`NotificationBell`** in the navbar (Radix dropdown, unread
  badge, 60s React-Query poll, click→mark-read+navigate, mark-all-read) +
  `useNotifications` + `notificationsAPI` + `qk.notifications`; a `dto.js`
  presenter maps each `type` to a title/body/link (assignment due-soon/overdue
  → `/home`, manager digest → `/my-team`, waitlist-promoted → `/me/sessions`).
  Tests: +6 server integration (`notifications-mine`: self-scope, pending
  exclusion, unread accounting, cross-user 404) + 3 client component
  (`NotificationBell`). server 926/94, client 278/61, lint at cap 63, build
  clean. Next: P6 (learner transcript) closes the wave.
- **2026-06-13** — **Cohesion P3: assignment → one-click enroll** (same
  branch; plan P3; owner-rec CTA-enroll, not silent auto). New self-scoped
  read **`GET /api/learning/assignments/mine`** (new `assignment.self`
  capability — ALL roles; always caller-scoped): active assignments
  targeting me (direct or via `departmentId`) with MY derived status (new
  single-user `resolveStatusForUser` — no department fan-out) + an
  **enroll suggestion** when the actionable program (assignment's program /
  first incomplete path step) is `self_enroll` with an Ongoing cohort.
  `middleware/auth` user select gains `departmentId` (was pre-D3 list).
  Feed (P2) now lists **Required/Overdue assignments first** with a
  one-click **Enroll** CTA into the suggested cohort — capacity +
  prerequisites stay enforced at the existing enrollment chokepoint;
  learner reminder emails deep-link to the home (`CLIENT_ORIGIN/home`,
  graceful when unset). Tests: +7 server integration
  (`assignments-mine`), +2 feed component — server 920/93, client 275/61,
  lint at cap 63, build clean. Spec `assignments-and-reminders` ADDED
  requirement folded. **CI note:** GitHub Actions billing-blocked (quota)
  — gates deferred, local suites are the verification until re-run.
- **2026-06-13** — **Cohesion P2 (v1): Unified learner home — next-actions
  feed + program cards** (same branch as P1; plan
  `plans/260612-2058-cohesion-wave/` P2). The Participant home becomes the
  hub: new **`NextActionsFeed`** answers "what's waiting on me?" — quizzes
  for my cohorts without a passing attempt (Take quiz →
  `/me/assessments`), enrollments without submitted feedback (Give
  feedback → `/me/feedback`), and my waitlist positions (→
  `/me/sessions`), capped at 5, with a caught-up state. A **My programs**
  band shows the top-2 enrollment cards (shared `ProgramEnrollmentCard`,
  extracted from `/me/programs`) + view-all. All client-side composition
  over existing self-scoped queries — zero new backend. Old `/me/*` pages
  retained (parity-first per plan risk note; nav-entry removal last);
  assignment feed items arrive with P3 (needs a self-scoped assignments
  read). Tests: +2 NextActionsFeed component cases — client 273/60, lint
  at cap 63, build clean. Next: P3 (assignment → one-click enroll).
- **2026-06-13** — **Cohesion P1: Learner Program Home**
  (`feat/cohesion-p1-learner-program-home`; plan
  `plans/260612-2058-cohesion-wave/` P1). Learners get a per-enrollment hub:
  **`/me/programs`** lists active cohort enrollments (cards w/ program name,
  status, session progress) and **`/me/programs/:cohortId`** renders the
  **completion checklist** (attendance x/y vs threshold, assessment,
  feedback — each met/unmet with Take-quiz / Give-feedback CTAs), the
  certificate state (issued/expiring/expired number + validity, or
  pending-issue/earn-it copy), and that cohort's next 5 upcoming sessions.
  **ZERO new backend** — pure composition over existing self-scoped reads
  (`GET /api/learning/completion|certificates|sessions`; Participant scope
  already enforced server-side). Entry points: catalog enrolled card →
  "Enrolled · view progress", Participant-dashboard "My programs & progress"
  CTA. New `useCompletion`/`useCertificates` hooks + api/query keys. Tests:
  +7 component (MyProgramPage 5, MyProgramsPage 2), catalog test updated —
  client 271/59, lint at cap 63, build clean. `/me/*` literal-English
  convention. Next: P2 (unified My Learning home).
**Older entries (2026-06-12 and earlier)** →
[`changelog-archive/2026-q2.md`](changelog-archive/2026-q2.md) (98 entries,
2026-06-01 → 2026-06-12).

---

## How to keep this current

After each milestone or significant change: update the phase/wave %, move the
status emoji, refresh the **Status board** (Now / Next), and add one dated line
at the top of *Recent progress*. Strategy detail stays in `lms-roadmap.md`.

**Rolling archive (keeps this file lean):** keep ~the last 2 weeks (~15 entries,
file ≤ ~400 lines) inline; in the SAME commit, cut older entries verbatim
(newest-first — they are an audit trail, do not reword) into
`changelog-archive/<year>-q<quarter>.md` and update its coverage header.
