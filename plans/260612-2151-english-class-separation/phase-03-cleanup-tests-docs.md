# Phase 03 — Cleanup: old tabs, redirects, e2e, docs, specs

## Overview
Priority: high · Status: 🔴 not started
Remove the English-world tabs from the generic shells, repoint legacy
routes, update e2e specs and documentation. Definition-of-Done items.

## Related code files
Modify:
- `client/src/pages/CalendarPage.jsx` — drop Participant/Leader branch,
  membership gate + NoTeamBookingPanel (participant → `<Navigate
  to="/english" replace/>`); Admin/Teacher tabs pass `mode='cohort'`;
  update `client/src/pages/__tests__/CalendarPage.test.jsx` (P4 cases
  move to EnglishPage test or assert redirect)
- `client/src/pages/PeoplePage.jsx` — remove Teams tab
- `client/src/pages/ReportsPage.jsx` — remove Evaluations tab
- `client/src/features/learning/LearningPage.jsx` — remove `groups`
  compat tab; CohortsTab `mode='cohort'`
- `client/src/App.jsx` — LEGACY_REDIRECTS: `/book` → `/english`
- Navbar access: Calendar Participant → 'none'
- e2e: `booking.spec.js` (goto /book → still works via redirect; assert
  final URL /english), `waitlist.spec.js` (check booking entry),
  `navigation.spec.js` (`/people?tab=teams` → English section case,
  headings), `permissions.spec.js` (teams URL)
Docs:
- `docs/development-roadmap.md` — changelog + cohesion P4 row note
  ("superseded by full English-class separation")
- `plans/260612-2058-cohesion-wave/plan.md` — P4 status note
- `docs/specs/scheduling-and-booking/spec.md` — MODIFIED: mode filter
  param + `/api/english/*` read endpoints + IA note; bump last_updated
- `docs/route-permission-matrix.md` — 3 new `/api/english` rows + mode
  param note on existing rows
- `docs/current-system-map.md` — english-class domain + features/english
- `docs/system-overview.md` — scorecard only if % changed materially

## Implementation steps
1. Strip tabs/branches from the 4 shells; verify tab-fallback logic
   still picks a sane default when URL points at a removed tab.
2. Redirect sweep: grep `tab=book|tab=teams|tab=evaluations` across
   client + e2e; repoint to `/english?tab=…`.
3. Update e2e specs (cannot run full e2e locally without seeded backend
   — rely on CI gate; keep assertions consistent with new IA).
4. Docs + tracker + spec deltas (fold immediately — this plan is the
   proposal; spec gets the truth).

## Success criteria
- No surface outside `/english` renders team-world rows or entry points
  (grep-verified + tests).
- Old URLs (`/book`, `?tab=teams`, `?tab=evaluations`) land somewhere
  sensible (redirect or tab fallback) — no 404/blank.
- Server + client tests + lint green; tracker/spec updated.

## Risk
- e2e drift (runs only in CI): review specs carefully line-by-line.
- Users' muscle memory: release note advising new nav location.
