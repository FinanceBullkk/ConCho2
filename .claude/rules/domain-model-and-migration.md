# Domain Model & Migration

The app is **TMS v2** (English-class booking) being re-architected into a generic **L&D Training Platform**. Most code is still TMS-shaped; the `domains/` modules are the target direction. **Don't undo migration work** by adding new logic to legacy controllers when a domain module exists.

## The booking model (core, counter-intuitive — get this right)
Admins do **NOT** pre-create schedules for groups to book into. The inverse:
- Admin creates a **Class** and a **Team** (group) assigned to that class, with a **leader**.
- The **team leader** self-creates sessions by clicking an empty cell on the `/book` time grid → the system creates the `Schedule` and auto-enrolls the whole team.
- Constraints: sessions book into the configurable **`ALLOWED_TIME_SLOTS`** windows (Setting, VN wall-clock, any duration — Wave E1; default = five 1-hour slots 10–11, 11–12, 13–14, 14–15, 15–16), max **2/week/team**. Empty/malformed slot config is fail-closed.
- Leaders can see other teams' taken slots (so they pick free ones); they can't book taken slots. Admin can edit/delete any schedule.

## Vocabulary migration (legacy → target)

> **Direction update (2026-06-14):** owner approved **full convergence to one training
> model** — ADR `docs/decisions/converge-to-one-training-model.md`, plan
> `plans/260614-0004-converge-to-one-model/`. The "DROPPED / DEFERRED / BOTH KEPT"
> notes below (Evaluation↔Assessment, team↔cohort Enrollment, English-class
> separation) are now **convergence targets**, phased — not permanent. Guardrails
> unchanged (no physical renames; converge via DTO/abstraction; Mongo→Postgres at the
> Phase-6 gate). `leader_booking` becomes one scheduling mode, not the centre.

| Legacy model | Target concept | Status |
|---|---|---|
| `Class` | **Cohort** (one delivery of a program) | exposed via `/api/learning/cohorts` (DTO over `Class`) |
| `courseName` (enum) | **Program** (`LearningProgram` model) | done — `Class.programId` links them |
| `Schedule` | **Session** | `/api/learning/sessions` (adapter over `scheduleService`) |
| `Team` | **LearningGroup** | **DROPPED** (owner 2026-06-12, audit round 7) — permanent vocabulary exception: `domains/groups` module exists, but the `Team` model name + `/api/teams` URL stay; a rename is pure churn with zero behavior value |
| `Evaluation` | **Assessment** | **CONVERGED (Phase 1, 2026-06-14)** — ONE assessment concept, two *modes*: instructor-scored rubric (`Evaluation`) + learner-attempted quiz (`domains/assessment`). Unified read `GET /api/assessment/results/mine` (both modes, one shape; learner transcript consumes it). `Evaluation` model/write-path retained (English rubric); grading-UI folds into the unified assessment UX in Phase 4. No destructive model merge. |
| `Enrollment` (team-based) | cohort-based enrollment | **READ + CREATE-WRITE CONVERGED (Phase 2)** — ONE Enrollment concept, two *modes* on one model (team-based `teamId` set = `mode:'group'`; cohort-based `teamId:null` = `mode:'direct'`). Unified self read `GET /api/learning/enrollments/mine` returns both in one shape (read converged 2026-06-14). **Create write converged 2026-06-15**: both modes create their Active row through ONE spine (`domains/learning/enrollment/writes.createActiveEnrollment` → `repository.insertActiveEnrollment`) and publish `ENROLLMENT_CREATED` so notification/automation subscribe uniformly (team events fire post-commit, cohort-scoped). No model merge / data move. Follow-up: fold the team **transfer/drop** close-paths onto the same spine (still team-specific email side-effects). |

## Domain module convention (for new/extracted backend code)
```
server/domains/<domain>/
├── routes.js        # own Express router (mounted at /api/<domain>/...)
├── controller.js    # thin HTTP handlers (envelope + audit only)
├── use-cases.js     # business rules (the real logic)
├── repository.js    # all Mongoose calls live here
├── policy.js        # resource authz (optional)
├── schemas.js       # zod request validation
└── dto.js           # response shaping (legacy model → target vocabulary)
```
- `learning/` = full reference implementation (has own routes). `learning/session/` is a sub-domain.
- `schedule/` = has its **own routes** since 2026-06-10 (mounted at `/api/schedules`; the legacy `scheduleController` was retired). `scheduleService` remains the transaction-heavy booking-mutation chokepoint the domain delegates into.
- **13 domains today** (7 core + `evaluation` + `settings` + 4 kept capability; all mounted in `server.js`; `_shared` is helpers, not a mounted domain). This is the canonical inventory — other docs point here. **9 speculative capability domains were deleted 2026-07-09** (scope trim — ADR `docs/decisions/trim-speculative-capability-domains.md`).

  **7 core training domains:**
  - `learning` — programs/cohorts/sessions/enrollment/completion engine (`/api/learning`); full reference implementation.
  - `schedule` — session booking + room/waitlist/capacity + scheduling-mode enforcement (`/api/schedules`; own routes since 2026-06-10, legacy `scheduleController` retired).
  - `attendance` — attendance marking + facilitator-assignment gate (`/api/attendance`).
  - `groups` — Team/group management (`/api/teams`; `Team` model name kept).
  - `assessment` — assessment engine + question bank + grading (`/api/assessment`).
  - `org` — departments, offices, manager hierarchy (`/api/org`).
  - `room` — office-scoped physical rooms (`/api/rooms`).
  - *(`english-class` retired 2026-06-20 — convergence Phase 3 slice 5: the `/api/english` READ delegation + the server-side `mode=team|cohort` split were removed; the unified reads return both worlds tagged `deliveryType`, faceted client-side. The `/english` learner booking grid stays, served by `/api/schedules`.)*

  **4 capability domains** (the other 9 were deleted 2026-07-09 — scope trim, ADR `docs/decisions/trim-speculative-capability-domains.md`):
  - `branding` — branding & templates: singleton `TenantConfig` feeding the cert/email pipeline (`/api/branding`).
  - `compliance` — compliance matrix + required-training rules, A3 (`/api/compliance`).
  - `custom-field` — custom field definitions, Studio (`/api/custom-fields`).
  - `notification` — in-app notification bell over the email `NotificationLog`, P5 (`/api/notifications`).

  **Deleted 2026-07-09 (scope trim — over-built Horizon 1/2 speculative features, 0 real users, git-recoverable):** `access`, `automation`, `finance`, `mobile`, `planning`, `session-type`, `skill`, `trainer`, `vendor`.

## Program policy enforcement truth (audit round 8)
`LearningProgram` carries `schedulingMode` (`leader_booking` | `admin_scheduled` | `self_enroll` | `nomination`) plus `deliveryMode`, `completionPolicy`, `capacityPolicy`, `facilitatorPolicy`. **`schedulingMode` is now ENFORCED** on every server session-create path via `domains/schedule/scheduling-mode-policy.js` (team modes `leader_booking`/`admin_scheduled` book against a group; cohort modes `self_enroll`/`nomination` book against a cohort) — gated at the shared `scheduleService.bookSlot` chokepoint (covers the legacy `/api/schedules/book-slot` leader route AND the `learning/session` adapter), `scheduleService.adminCreate`, and `domains/schedule/use-cases.updateSchedule` reassign. Effects: leader self-booking an `admin_scheduled` program → 403; team-booking a cohort program → 400; unknown mode → 501; a program-less class still books (fallback `leader_booking`). **`capacityPolicy` is ENFORCED** (`domains/schedule/session-booking-policy.js` maxParticipantsPerSession on booking; `domains/learning/enrollment/use-cases.js` maxParticipants per cohort — Wave E2). **`completionPolicy` is ENFORCED** (drives the completion engine + rollups, `domains/learning/completion/`). **`facilitatorPolicy` is FULLY ENFORCED**: `assignmentRequired` (`domains/schedule/facilitator-assignment-policy.js`, gated at `domains/attendance/marking.bulkMark`: a required-facilitator session can't be marked until a per-session instructor, external trainer, or cohort teacher is assigned → 422) AND `visibility: assigned_only` (`domains/schedule/facilitator-visibility-policy.js`: a Teacher reaches an assigned_only program's sessions — list/detail/attendance — only when named on `sessionInstructorIds`; the standing cohort-teacher binding no longer grants access; Admin unaffected). **`deliveryMode` is metadata-only by design** (online/offline/hybrid = display + reporting context, no behavioural contract → nothing to enforce). So no program-policy field remains as unintended debt.

## Architectural decisions (locked — `docs/decisions/`)
- Modular monolith (not microservices).
- **MongoDB now, PostgreSQL later** (Phase 6 gate; not started).
- React/Vite stays (no Next.js).
- Physical collection renames are out-of-scope for the first 6 months — migrate via DTOs/abstractions, not destructive renames.

## Status & next steps
Living tracker: **`docs/development-roadmap.md`** (start here). `docs/archive/handoff-2026-06-01.md` is an archived dated snapshot (2026-06-09) — useful history, not the live task list. Supporting maps: `docs/current-system-map.md`, `docs/route-permission-matrix.md`.
