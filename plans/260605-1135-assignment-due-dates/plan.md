# Wave D4 — Assignment + Due Dates v1

**Status:** complete
**Date:** 2026-06-05
**Goal:** let HR/L&D assign required training and track learner due status.

## Scope

In:

- Admin creates/archives assignments for a Program or Learning Path.
- Targets are explicit users and/or departments.
- Each assignment has a due date.
- Status is derived per learner: `not_started`, `in_progress`, `complete`,
  `overdue`.
- Learning workspace gets an Assignments tab.
- Tests cover happy path, permission denial, and derived status edge cases.

Out:

- Email reminders, manager escalation, saved report exports.
- Cohort-specific assignment.
- Auto-enrollment side effects.
- Certificate expiry/recertification.

## Architecture

- New `Assignment` model with soft-delete + indexes.
- New `server/domains/learning/assignment/` module.
- Mount routes under `/api/learning/assignments`.
- Capabilities:
  - `assignment.manage`: Admin only.
  - `assignment.read`: Admin + Teacher.
- Status derivation reuses existing completion/path/enrollment signals.
- UI follows existing Learning tab + React Query hook patterns.

## Implementation Steps

1. Backend model/domain/routes/schemas/dto.
2. Status resolver:
   - Program complete: shared prerequisite/completion signal.
   - Program in-progress: active enrollment in a cohort whose `programId`
     matches.
   - Path complete: all path programs complete.
   - Path in-progress: at least one path program in-progress/completed.
   - Overdue: not complete and `dueDate` has passed.
3. Admin UI:
   - list assignments and summary counts.
   - create assignment modal.
   - archive assignment action.
4. Docs/roadmap update.
5. Focused tests + syntax/static checks.

## Success Criteria

- Admin can create an assignment from the Learning page.
- Participant role cannot create/list assignment admin views.
- Department targets expand to active users.
- Soft-deleted users do not appear in assignment status.
- A completed learner counts complete even if due date passed.
- An incomplete learner past due counts overdue.
- `docs/development-roadmap.md` marks D4 v1 progress.

## Implementation Notes

- Added `Assignment` model and `server/domains/learning/assignment/`.
- Mounted `/api/learning/assignments` with `assignment.read` and
  `assignment.manage`.
- Added Learning → Assignments tab + create modal.
- Added user search passthrough to `server/schemas/user.js` so Admin can find
  explicit assignment users.
- Due dates are date-level: incomplete learners become overdue after the due
  date has fully passed, not at the start of that day.
- Updated `docs/development-roadmap.md`, `docs/lms-roadmap.md`, and
  `docs/ltms-gap-analysis.md`.

## Verification

- `cd server && npm test -- --runTestsByPath tests/integration/learningAssignmentRoutes.test.js tests/unit/capabilities.test.js --runInBand --forceExit`
- `cd client && npm run test:run -- AssignmentsTab AssignmentFormModal useRole`
- `cd client && npx eslint src/pages/learning/AssignmentsTab.jsx src/pages/learning/AssignmentFormModal.jsx src/pages/learning/__tests__/AssignmentsTab.test.jsx src/pages/learning/__tests__/AssignmentFormModal.test.jsx src/hooks/useLearning.js src/hooks/useRole.js src/pages/LearningPage.jsx --max-warnings 0`
- `cd client && npm run lint`
- `cd client && npm run build`

## Unresolved Questions

- None for v1.
