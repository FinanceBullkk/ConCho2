# Plan: M3 — Learning CRUD UI (Programs / Cohorts / Enroll learners)

**Status:** ✅ DONE (2026-06-03) — client lint 0err/81warn, 100 tests, build clean; tracker synced · **Milestone:** M3 (Wave A) · **Type:** frontend-only (backend CRUD endpoints already exist)

## Context
`LearningPage.jsx` is **read-only** today (two tables + two compatibility tabs). Backend already exposes: programs `GET/POST/PUT/DELETE`, cohorts `GET/POST`, cohort enrollments `GET/POST/DELETE` (`/api/learning/*`). M3 = make the page actually create/edit Programs, create Cohorts, and enroll learners (Admin write; Teacher read).

## Approach (KISS, match existing patterns)
Mirror `ClassesPage` conventions: plain controlled `useState` forms inside Radix `Dialog`, `useRole().can(...)` gating, React Query mutation hooks with `toast` + invalidation. **No react-hook-form** (avoids the `react-hooks/incompatible-library` warning — lint cap is at 81 with zero headroom). i18n: add a `learning` namespace to `en.json` + `vi.json` (golden rule) and convert the page to `t()`.

## Changes
1. **api/api.js** — add to `learningAPI`: `getEnrollments`, `createEnrollment`, `withdrawEnrollment` (`/learning/enrollments`).
2. **hooks/queryKeys.js** — `learning.enrollments(params)`.
3. **hooks/useLearning.js** — `useCreateProgram`, `useUpdateProgram`, `useArchiveProgram`, `useCreateCohort`, `useLearningEnrollments`, `useEnrollLearner`, `useWithdrawEnrollment` (toast + invalidate learning scopes).
4. **hooks/useRole.js** — add `create:program`/`update:program`/`archive:program`/`create:cohort`/`enroll:learner` (all `['Admin']`, anchored to `domains/learning/routes.js`).
5. **i18n** `en.json` + `vi.json` — `learning` section (tabs, tables, forms, toasts).
6. **pages/learning/** (new, keep each <200 lines):
   - `ProgramFormModal.jsx` — create + edit; fields: code, name, description, category, schedulingMode, deliveryMode, defaultSessionCount, status; edit mode adds **Archive** (soft delete via DELETE).
   - `CohortFormModal.jsx` — create; select program, optional cohortCode/classCode, totalSessions, status.
   - `EnrollLearnersModal.jsx` — list current cohort enrollments (withdraw), add-learner select (Participants).
   - `ProgramsTab.jsx`, `CohortsTab.jsx` — extracted from `LearningPage`, add action buttons.
7. **pages/LearningPage.jsx** — compose extracted tabs; keep groups/assessments compatibility tabs.

## Out of scope
Program policy editors (completion/capacity/facilitator nested configs), cohort edit/delete (cohort edit stays in ClassesPage), bulk enroll, learner-facing catalog (Wave C).

## Verify
`cd client && npm run lint` (≤81), `cd client && npm run test:run`, `cd server && npm test` (unaffected — sanity).

## DoD
CRUD works · lint ≤81 + client tests green · tracker updated (M3 status/%/changelog; handoff sync) · committed.
