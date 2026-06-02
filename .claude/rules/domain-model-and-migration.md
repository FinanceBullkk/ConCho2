# Domain Model & Migration

The app is **TMS v2** (English-class booking) being re-architected into a generic **L&D Training Platform**. Most code is still TMS-shaped; the `domains/` modules are the target direction. **Don't undo migration work** by adding new logic to legacy controllers when a domain module exists.

## The booking model (core, counter-intuitive — get this right)
Admins do **NOT** pre-create schedules for groups to book into. The inverse:
- Admin creates a **Class** and a **Team** (group) assigned to that class, with a **leader**.
- The **team leader** self-creates sessions by clicking an empty cell on the `/book` time grid → the system creates the `Schedule` and auto-enrolls the whole team.
- Constraints: sessions are exactly **1 hour**, only in **5 fixed slots** (10–11, 11–12, 13–14, 14–15, 15–16), max **2/week/team**.
- Leaders can see other teams' taken slots (so they pick free ones); they can't book taken slots. Admin can edit/delete any schedule.

## Vocabulary migration (legacy → target)
| Legacy model | Target concept | Status |
|---|---|---|
| `Class` | **Cohort** (one delivery of a program) | exposed via `/api/learning/cohorts` (DTO over `Class`) |
| `courseName` (enum) | **Program** (`LearningProgram` model) | done — `Class.programId` links them |
| `Schedule` | **Session** | `/api/learning/sessions` (adapter over `scheduleService`) |
| `Team` | **LearningGroup** | not migrated |
| `Evaluation` | **Assessment** | not migrated |
| `Enrollment` (team-based) | cohort-based enrollment | not migrated |

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
- `schedule/` = **adapter** pattern: no own routes, the legacy `scheduleController` delegates `update`/`delete` into it. Use this pattern when extracting from a big legacy controller incrementally.

## Policies stored but NOT yet enforced
`LearningProgram` carries `schedulingMode` (`leader_booking` | `admin_scheduled` | `self_enroll` | `nomination`), `deliveryMode`, `completionPolicy`, `capacityPolicy`, `facilitatorPolicy`. Today only `leader_booking` actually works; the others are persisted but not checked. Enforcing `schedulingMode` is the top open task.

## Architectural decisions (locked — `docs/decisions/`)
- Modular monolith (not microservices).
- **MongoDB now, PostgreSQL later** (Phase 6 gate; not started).
- React/Vite stays (no Next.js).
- Physical collection renames are out-of-scope for the first 6 months — migrate via DTOs/abstractions, not destructive renames.

## Status & next steps
Live handoff with phase-by-phase progress and the prioritized task list: **`docs/handoff-2026-06-01.md`**. Read it before large changes. Supporting maps: `docs/current-system-map.md`, `docs/route-permission-matrix.md`.
