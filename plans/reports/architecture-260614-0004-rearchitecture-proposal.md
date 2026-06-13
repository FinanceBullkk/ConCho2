# Re-architecture Proposal — TMS v2 → Internal LTMS

**Date:** 2026-06-14 · **For:** owner ask "everything still messy — analyse, study
best architectures, re-architect functions + arrangement + UX/UI for max
effectiveness." · **Scope:** whole-system (domain model, bounded contexts, UX/IA,
authz) — strategy + phased path, not a blind rewrite.

## TL;DR — the ONE decision that drives everything
The deep messiness is **not navigation** (the sidebar/persona work fixed that). It is
that the product runs **two parallel worlds for the same domain (training delivery)**:

| | English-class world | Generic L&D world |
|---|---|---|
| container | `Class` (+ `Team`) | `Class` exposed as **Cohort** (DTO) |
| sessions | `Schedule` (mode=team, leader-booked) | `Schedule` as **Session** (mode=cohort, admin-scheduled) |
| enroll | team-based (`Team` membership) | cohort-based (`Enrollment`) |
| assess | `Evaluation` | `Assessment` (+Attempt/Question) |
| attend | `Attendance` (mode=team) | `Attendance` (mode=cohort) |

Same Mongo models, **two semantics behind a `mode` flag**, two UIs, two enroll paths,
two assessment systems. Best-in-class LMS (Docebo, Cornerstone, SAP SF) run **ONE**
generic model where "English-class" is merely a *delivery profile* (instructor-led +
group + leader-scheduled), not a separate world. **So the central choice is: converge
the two worlds into one model, keep them separate (the 2026-06-12 owner decision), or
a hybrid (converge UX now, storage later).** Everything below hangs on this.

---

## 1. Current architecture (code-accurate)
- **Backend:** modular monolith, 9 `domains/` (`learning, schedule, attendance,
  groups, assessment, org, room, english-class, notification`) **+ 17 legacy
  `routes/` still mounted** (auth, class, enrollment, evaluation, sync, export,
  dashboard, admin-db, …). Two layering styles coexist: `routes→controller→
  use-cases→repository` (domains) vs `routes→controller→services` (legacy).
- **27 models** with heavy overlap/half-migration:
  `Class`↔`LearningProgram`/Cohort, `Schedule`=Session, `Team`(kept; LearningGroup
  dropped), `Enrollment`(dual team+cohort), `Evaluation`↔`Assessment`(+Attempt+
  Question), plus `Certificate, Assignment, Feedback, Room, RoomBooking,
  WaitlistEntry, Department, Office, User, AuditLog, NotificationLog, Setting,
  CronRun, ReconcileReport, Counter, TokenBlocklist`.
- **Authz: two layers, migration half-done** — legacy `roleGuard(role…)` on legacy
  routes; `requireCapability` + `policy/capabilities.js` (capabilities *derived from
  role*, no per-user grants) on domain routers. Plus `policy/*` resource checks.
- **Frontend:** 18 `features/` + 4 composition shells; now a left **sidebar +
  persona** shell (Admin Console / My Learning), section-groups, `?tab=` deep links
  (IA Phases 01–03 this session).
- **Booking model (counter-intuitive):** admins don't pre-create sessions; **team
  leaders self-create** sessions on a grid → auto-enroll the team. Baked deep into
  `scheduleService`; doesn't generalise cleanly to the cohort modes.

## 2. Diagnosis — root causes of "messy", ranked
1. **Dual worlds / one model, two semantics** (the `mode` flag). #1 source of
   cognitive + code load: every delivery concept exists twice.
2. **Half-finished vocabulary migration** — Class/Cohort, Schedule/Session,
   Evaluation/Assessment all live simultaneously; readers must hold two mental models.
3. **Dual enrollment + dual assessment** kept "by design" → real duplication in
   use-cases, UI, reporting, completion.
4. **Legacy routes/controllers coexist with domains/** — two architectures, unclear
   which is canonical for a given action.
5. **Authz split** (roleGuard vs capability) not finished → ambiguity about the real
   boundary.
6. **Booking special-case** (`scheduleService` is the transaction chokepoint for a
   non-generic workflow) — large, hard to extend.

## 3. Reference architectures (what "best" looks like)
- **Modular monolith + DDD bounded contexts** [1][2]: logical modules with ONE
  ubiquitous language each, communicating via **explicit interfaces + domain events**
  (not direct cross-module calls) — reduces coupling without microservice cost;
  "monolith-first", extract later only if needed (matches the locked Mongo→PG gate).
- **Canonical LMS domain** [3][4]: a single spine — `Program/Course → Offering/Session
  → Enrollment → Completion → Certificate`, with **delivery mode** (ILT / virtual /
  self-paced) and **scheduling mode** as *configuration on the Program*, plus
  Assignment/Compliance + recertification as a cross-cutting concern. One model, many
  configurations — never parallel worlds.
- **UX/IA**: persona-separated workspaces + journey-based nav (done at the shell
  level; deepen to journeys). Industry: Admin console, Instructor, Learner, Manager.

## 4. Target architecture (proposed)

### 4a. Bounded contexts (sharpen the module map)
Collapse the 9 ad-hoc domains + legacy routes into ~10 **clear bounded contexts**, each
`routes→controller→use-cases→repository(+policy)`, talking via **domain events**:

| Context | Owns | Replaces today |
|---|---|---|
| **Identity & Access** | User, auth, MFA, sessions, capabilities | auth routes, `policy/capabilities` |
| **Org** | Department, Office, manager hierarchy | `domains/org` |
| **Catalog** | Program (+type/policies), Path, prerequisites | `domains/learning` (program/path) |
| **Scheduling** | Session (was Schedule), Room, Waitlist, booking modes | `domains/schedule` + `scheduleService` |
| **Enrollment** | one enrollment model (see 4b), roster | `Enrollment` + team-membership path |
| **Delivery** | Attendance, instructor assignment | `domains/attendance` |
| **Assessment** | one assessment model (see 4b) | `domains/assessment` + `Evaluation` |
| **Completion & Certification** | completion engine, Certificate, recert | `domains/learning/completion` |
| **Compliance** | Assignment, due dates, escalation, reporting | `Assignment` + reminders |
| **Notification + Audit (platform)** | NotificationLog, AuditLog, cron | `domains/notification`, audit |

Introduce a thin **domain-event bus** (in-process) so audit, notifications, and
completion rollups stop being hand-wired into every mutation (today's pattern) —
publishers emit `SessionBooked`, `AttendanceMarked`, `EnrollmentCreated`,
`CompletionAchieved`; platform contexts subscribe. This is the single highest-leverage
backend cleanup and is microservice-ready without being microservices.

### 4b. Data-model convergence (the core decision — see Options)
The clean target = **one spine**: `Program → Session → Enrollment → Completion →
Certificate`, with English-class as a **Program with `deliveryProfile =
{ instructorLed, groupBased, leaderScheduled }`** rather than its own world. Concretely:
- **Sessions:** retire the `mode` fork; behaviour comes from the Program's
  scheduling/delivery config (already partly modelled by `schedulingMode`).
- **Enrollment:** converge team-based onto cohort-based; a "team booking" becomes
  "group enrollment into a cohort" — one `Enrollment` model.
- **Assessment:** converge `Evaluation` onto `Assessment` (the deferred item).
- **Vocabulary:** finish Class→Cohort, Schedule→Session at the API/DTO layer (physical
  rename stays out-of-scope per ADR; converge via abstractions).

### 4c. UX/IA (build on the sidebar/persona shell)
- **Four persona workspaces**, journey-organised (not entity-organised):
  - **Admin/Coordinator** — *Set up* (Catalog) → *Schedule* → *Enroll/Assign* →
    *Run* (attendance/assess) → *Certify* → *Report*. (Today's sidebar groups become
    these journey steps.)
  - **Instructor** — "my sessions to run / mark / assess" only.
  - **Learner** — My Learning (done).
  - **Manager** — My Team (done).
- If worlds converge, the confusing English↔Operations split disappears (one
  "Scheduling/Sessions" surface, filtered by program type).
- Keep the dashboard "what needs action" + contextual tiles direction.

### 4d. Authz — finish the migration
Move all legacy `roleGuard` routes onto `requireCapability` + `policy/*`; capabilities
stay role-derived for now (per-user grants = YAGNI). One boundary, documented in the
route-permission matrix.

## 5. Options (pick the direction)

| Option | Essence | Effort | Risk | Payoff |
|---|---|---|---|---|
| **A — Converge worlds** (recommended) | One generic model; English-class = a Program delivery profile. Retire dual enroll/assess/session forks. Domain-event bus. | **Large** (multi-month, phased) | Medium-high (touches core booking/enroll/assess; data backfill) | **Highest** — removes the #1 messiness; matches best LMS; halves delivery-side duplication |
| **B — Keep separate, clean each** (honours 2026-06-12) | Don't merge; instead make the two bounded contexts STOP sharing ambiguous models — give English-class its own thin models/labels so each world is internally clean. | Medium | Low | Moderate — clarity without convergence; duplication remains by design |
| **C — Hybrid** (pragmatic) | Converge the **UX + read/journey layer now** (one user-facing flow, persona journeys), keep dual storage short-term, converge storage opportunistically (assessment, then enrollment) behind events. | Medium, incremental | Low-medium | High over time — users see one clean product immediately; backend converges without big-bang |

> **A and C revisit the locked "English-class separation" (2026-06-12).** That was an
> owner decision; this proposal surfaces that converging is the industry-clean path,
> but the call is the owner's. B fully honours it.

## 6. Phased roadmap (if A or C)
0. **Foundations (no behaviour change):** introduce the in-process domain-event bus;
   route audit + notifications + completion rollups through it. Finish authz →
   capability on the remaining legacy routes. *(Safe, high-leverage, independent.)*
1. **Converge Assessment** (Evaluation→Assessment) — smallest dual system; spec exists.
2. **Converge Enrollment** (team→cohort group-enrollment) — unifies booking semantics.
3. **Generalise Scheduling** — retire the `mode` fork; Program delivery-profile drives it.
4. **UX journeys** — re-cut the sidebar groups into journey steps per persona; collapse
   English↔Operations once storage is unified.
5. **Retire legacy `routes/`/`controllers/`** into the bounded contexts.
6. (existing) Mongo→PostgreSQL gate — unchanged.

Each phase: tests + lint + spec update; shippable independently (no big-bang).

## 7. Open questions (owner decisions)
1. **Direction: A (converge) / B (keep separate) / C (hybrid)?** — gates everything.
2. If A/C: is **converging Evaluation→Assessment and team→cohort enrollment** approved
   (both currently "kept/deferred by design")?
3. Is the **counter-intuitive leader-booking** workflow a permanent product
   requirement, or may it become one scheduling mode among several (admin/self/
   nomination)? (Affects how far Scheduling generalises.)
4. Appetite for the **domain-event bus** refactor in Phase 0 (safe but non-trivial)?
5. Timebox: is this a multi-month track, or should we cap at the highest-ROI slice
   (e.g. Phase 0 + assessment convergence) first?

## Sources
- [1] [kgrzybek — Modular Monolith with DDD](https://github.com/kgrzybek/modular-monolith-with-ddd) · [GitLab — bounded contexts ADR](https://handbook.gitlab.com/handbook/engineering/architecture/design-documents/modular_monolith/decisions/002_bounded_contexts_definition)
- [2] [Building Modular Monoliths — hexagonal + internal messaging](https://www.softwareseni.com/building-modular-monoliths-with-logical-boundaries-hexagonal-architecture-and-internal-messaging/)
- [3] [LMS database design — entities & relationships](https://www.red-gate.com/blog/database-design-management-system/)
- [4] [eLeaP — What is an LMS (2026): completion, certification, compliance](https://www.eleapsoftware.com/lms-system/) · [360Learning — compliance training](https://360learning.com/use-cases/compliance-training/)
