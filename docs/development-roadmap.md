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

**~64% through the TMS → L&D migration.** The generic learning core works end
to end; recent work is *cohesion* (weaving shipped features into one product),
not net-new capability.

- **Done (waves):** A Foundation · B Assessment & Certification · C Catalog/
  Paths/Self-service (core) · D1/D3/D4/D5/D6 platform slices · **E Generic
  scheduling** (rooms, capacity, waitlists, trainers, durable cancellation) —
  closed 2026-06-12. Full-system audit (8/8 rounds) complete; Express 4→5 done;
  light dependency majors done.
- **Now:** **Cohesion Wave COMPLETE** (`plans/260612-2058-cohesion-wave/`, 6/6)
  — P1 Learner Program Home, P2 unified learner home, P3 assignment→one-click
  enroll, P4 English-class separation, P5 in-app notification bell, **P6 learner
  transcript** all shipped 2026-06-12/13. The learner surfaces now read as one
  woven product. Migration phases 3/4/5 sit ~72–78%.
- **Now (post-wave review done):** integration review of the woven learner
  experience found no broken links / authz leaks; the notification bell now
  surfaces the full set of in-app events via a shared fail-soft writer —
  **`certificate_issued`**, **`cohort_enrolled`** (Admin direct-enroll),
  **`booking_confirmed`** (booker), and **`session_enrolled`** (everyone
  auto-added to a session roster — team members on a leader booking, cohort
  enrollees on an admin-scheduled session). Bell coverage deferral CLOSED.
- **Next (active goal):** push migration phases 3/4/5 (~72–82%) toward done by
  closing concrete incomplete loops. Shipped: **bulk cohort enrollment** (M2
  deferral; phase 3+4 → ~80%) and **`facilitatorPolicy.assignmentRequired`
  enforcement** (phase-3 policy-debt; → ~82%). Remaining 3/4/5 gap is now
  largely deferred-by-design (nomination workflow, Evaluation→Assessment
  convergence, report presets) + the other persisted-not-enforced policies
  (`deliveryMode`, `facilitatorPolicy.visibility`).
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
| 3 | Multi-program enrollment + session scheduling | ~82% | 🟡 in progress |
| 4 | Frontend L&D workspace (CRUD UI) | ~80% | 🟡 in progress |
| 5 | Reporting, completion, feedback | ~72% | 🟡 in progress |
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
- **2026-06-12** — **English-class separation: bounded `/english` section**
  (`feat/cohesion-p4-team-booking-separation`; plan
  `plans/260612-2151-english-class-separation/`; owner decisions: dedicated
  nav item, schedules+attendance split too, team classes hidden from
  Learning, additive backend). Everything English-class-shaped now lives in
  ONE nav section `/english` (tabs by role — Admin: Classes·Teams·Schedules·
  Attendance·Evaluations; Teacher: Attendance·Evaluations; Participant/
  Leader: Team booking, membership-gated): Teams left `/people`, Evaluations
  left `/reports`, the booking grid left `/calendar`, the `groups` compat
  tab left `/learning`. **Worlds split by scheduling mode** — team =
  `leader_booking`/`admin_scheduled` + program-less legacy (fallback
  parity); cohort = `self_enroll`/`nomination`. Backend (additive, ADR-safe,
  no renames): optional `mode=team|cohort` filter on `GET /api/schedules`,
  `/api/schedules/attendance-calendar`, `/api/learning/cohorts`
  (`findCohortModeClassIds`/`findCohortModeProgramIds`), plus a new thin
  read-only domain `server/domains/english-class/` at
  `/api/english/{classes,schedules,attendance-calendar}` forcing
  `mode=team` (Participant enrolled-only scope preserved; mutations stay on
  existing mode-gated URLs). `/calendar` is now the cohort-world staff
  calendar (Participant → redirect `/english`); `/book` redirect
  retargeted to `/english?tab=book`; SearchPalette teams deep-link,
  Participant-dashboard links, seed (+1 cohort-world program/cohort so
  generic surfaces are non-empty) and e2e
  (booking/navigation/permissions/attendance-export) updated. Tests: +11
  server integration (`english-class-routes`), new EnglishPage component
  suite, CalendarPage/ReportsPage suites rewritten — server 913/92, client
  264/57, lint at cap 63, build clean. Supersedes the P4 membership-gating
  entry point below.
- **2026-06-12** — **Cohesion Wave P4: team-booking mode separation**
  (`feat/cohesion-p4-team-booking-separation`; plan
  `plans/260612-2058-cohesion-wave/`, executed first per owner). The legacy
  English-class team-booking flow stops being the platform's face: the
  Calendar "Team booking" tab (renamed from "Book") is now
  **membership-gated** via `useMyTeams` — a Participant with no Team gets a
  pointer panel to `/me/sessions` + `/me/catalog` instead of the booking
  grid; `BookClassPage`'s "Not in any group" dead-end and the Participant
  dashboard's empty-state got the same membership-aware treatment.
  UI/composition only — no server change, `/book` redirect kept (e2e
  unaffected), Team vocabulary unchanged (ADR). +4 component tests
  (`CalendarPage.test.jsx`). Spec `scheduling-and-booking` UC-1 UI note.
- **2026-06-12** — **Express 4 → 5 migration** (`chore/express-5`). Three
  code-level deltas, every security layer preserved: (1) **NoSQL sanitize** —
  the stock express-mongo-sanitize middleware throws on express 5 (`req.query`
  is getter-only); new `middleware/mongo-sanitize-in-place.js` reuses the
  lib's `sanitize()` (strips the same $/dot keys in place) and PINS the
  sanitized query object via `defineProperty` so the per-access re-parsing
  getter can't resurrect stripped keys. (2) **SPA fallback** — production
  `app.get('*')` → `'/{*splat}'` (path-to-regexp 8; bare `*` would crash prod
  boot at mount — a branch CI never executes, so a dedicated pattern test
  guards it). (3) **`req.body` default shim** — express 5 leaves body
  `undefined` when no parser matched; dozens of handlers destructure
  optionally-bodied requests (DELETE-with-reason, logout), restored the
  express-4 `{}` app-wide (caught live by the certificate-revoke test: revoke
  500'd → cert stayed verify-valid). `validate` middleware was already
  getter-safe. +8 compat tests (`expressFiveCompat.test.js`). **Ride-along
  flake root-caused:** dotenv 17 prints a rotating tip per `config()` — one
  says "secrets for agents", randomly tripping verify-backup's
  `not.toContain('secret')` spawn assertion → script's dotenv calls quieted +
  complete-line guard in the spawn harness. Docs: tech-stack, system-overview
  stack line, security-platform spec (sanitize NFR).
- **2026-06-12** — **Dependency majors round 1 (light) + CODE-017**
  (`chore/deps-light-majors`). **bcryptjs 2→3** and **dotenv 16→17** (config
  tip-log quieted in server.js so pino stays the only stdout); **`uuid`
  dependency DROPPED** — its single consumer (`middleware/requestId.js`) now
  uses Node's built-in `crypto.randomUUID()` (uuid ≥13 is ESM-only, the
  server is CommonJS; removing beats major-bumping). **CODE-017 closed:** all
  17 per-handler lazy requires in `controllers/auth/*` hoisted to module top
  — the require cycle they dodged died with the legacy authController split
  (verified: no service/middleware requires back into controllers). Server
  897/897 (one passwordReset-timing flake on first run — known QA-010 class —
  clean on rerun); `npm ci --dry-run` lockfile-sync OK. **Deferred:
  eslint 10** — `eslint-plugin-jsx-a11y` peer-supports only eslint ≤9; bump
  when the plugin updates (no `--legacy-peer-deps` workarounds). Remaining
  majors: express 5 (next, pre-scouted), mongoose 9 (per owner: after the
  PostgreSQL gate decision), googleapis (needs live calendar retest).
- **2026-06-12** — **Post-audit backlog sweep round 2: 4 ops/data findings
  fixed** (`fix/backlog-sweep-ops-data-round`). **OPS-011** `CORS_ORIGINS` +
  `CLIENT_ORIGIN` are now boot-required in production (missing CORS allowlist
  used to boot fine then 500 every browser write; missing CLIENT_ORIGIN sent
  localhost reset links) — README §6.4 notes the fail-fast; **OPS-010** all 3
  `CRON_JOBS` entries carry their crontab `schedule` so pinger-driven runs
  upsert the Sentry monitor config and missed-run alerts can actually arm
  (schedule-less monitors never fire them); **OPS-012** cron `?token=` is
  redacted (`token=[REDACTED]`) from the pino-http request log and all
  cronAuth log/audit lines via new `lib/redact-url-token.js` (query channel
  kept, redact-only per owner); **DATA-016** reconcile gains read-only check
  #12 `stale_waitlist_entry` — flags `waiting` queue rows whose session is
  past/cancelled/deleted (promotion skips past sessions by design, so these
  rotted forever) — model enum + summary + Reconcile-page meta/i18n (also
  adds the missing `orphan_room_booking` label). Specs updated:
  `reconcile-job` (12-check truth + stale-waitlist scenario + OPS-010 NFR),
  `security-platform` (boot-safety + log secret-hygiene NFRs). Tests: +12
  unit/integration. Remaining audit backlog: CODE-017, DEPS majors,
  DOCS-006b, QA-017/019/020/022 (all deliberate deferrals or ride-along
  policies).
- **2026-06-12** — **Wave E closure verified — tracker reconciled.** The two
  "residual polish" items (staff waitlist panel, trainer-only teacher
  session-list/calendar visibility) had already shipped 2026-06-11 (see that
  day's "Wave E polish" entry) but the Current-status paragraph and Wave E
  table row still listed them as open — written by phase-04 slice B hours
  before the polish landed and never reconciled. Verified wired on main
  (`SessionWaitlistModal` behind `read:waitlist` on the cohort Sessions
  panel; Teacher UNION scope in session list, single-session read, and
  attendance calendar), then fixed the stale tracker text. No code change.
**Older entries (2026-06-12 and earlier)** →
[`changelog-archive/2026-q2.md`](changelog-archive/2026-q2.md) (92 entries,
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
