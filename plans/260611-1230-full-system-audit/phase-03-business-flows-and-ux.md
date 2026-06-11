# Phase 03 — Business Flows & UX Wiring

**Area prefixes:** UX- (continue past UX-03) · FLOW- (new series) · BUG- for plain bugs.
**Source of truth:** `docs/specs/README.md` capability registry — the checklist IS
the spec list. Goal: every shipped capability completes END-TO-END for the persona
it serves (no "backend works, button missing" gaps — e.g. the trainer-only teacher
visibility hole found 2026-06-11).

## A. Persona × flow walkthroughs (seeded dev env)
Personas: Admin · Coordinator · Teacher (class-bound) · Teacher (trainer-only) ·
Participant-leader · Participant-member · Participant (cohort enrollee).
For EVERY spec in the registry, walk the happy path + the documented error path
as the right persona. Record: completes? right feedback? right data after?
- [ ] Auth: login, MFA setup/verify/backup-code, forced password change, lockout,
      forgot/reset, force-logout.
- [ ] org/People: users CRUD+import, offices, rooms, departments, org assignment.
- [ ] Learning: programs, cohorts (+archive/restore), sessions (create cohort-mode,
      trainers, waitlist staff view), groups, enrollments (team + cohort),
      assignments, paths, prerequisites.
- [ ] Booking: leader grid book/cancel (slots, 2/week, collision), admin
      create/edit/reassign/cancel, schedulingMode gates (4 modes), room lock,
      capacity + waitlist join/leave/promotion, /me/sessions.
- [ ] Attendance: teacher mark (incl. trainer-only teacher), calendar, self stats.
- [ ] Assessments/evaluations, certificates, completion + compliance reports,
      HR Excel export, Google Sheets sync, dashboards (operational + executive).
- [ ] Learner self-service: /me/* pages complete loops (enroll, sessions,
      waitlist, progress, certificates).

## B. UI states sweep (per page)
- [ ] Loading skeletons, empty states, error states (not blank/crash).
- [ ] Dead buttons / orphan links / unreachable pages (router audit).
- [ ] Toasts: success AND failure paths; messages human (no raw server text).
- [ ] Permission-hidden vs permission-disabled consistency (`useRole` gating).
- [ ] Dark/light mode: theme tokens only — sweep for hardcoded colors.
- [ ] Responsive sanity on the operational pages (tables on narrow screens).

## C. i18n integrity (English-only)
- [ ] Script-sweep: every `t('key')` exists in `en.json`; no raw keys rendered.
- [ ] No Vietnamese strings anywhere (grep diacritics).
- [ ] `/me/*` English-literal convention still consistent.

## D. Cross-flow consistency
- [ ] Same concept = same word everywhere (Cohort/Program/Session vocabulary vs
      leftover Class/Course/Schedule in UI strings).
- [ ] Date/time/timezone display consistent (Asia/Saigon vs UTC storage).
- [ ] Counts agree across views (dashboard vs list vs report for same filter).

## Method
Manual walkthroughs against `npm run seed` data + targeted Playwright additions
for any P1 flow found broken (test-first, then fix). Keep a per-flow PASS/FAIL
table in the report.

## Output
`plans/reports/audit-flows-{yymmdd-hhmm}-findings.md` + fix PRs.
