# Phase 02 — Frontend: `/english` section + navbar + world split

## Overview
Priority: high · Status: 🔴 not started
New top-level section "English Class" at `/english` (composition shell,
same pattern as CalendarPage). Shared pages get a `mode` prop instead of
being duplicated; hooks route to `/api/english/*` when `mode='team'`.

## Tabs by role (shell-level role map, like CalendarPage)
- Admin: `classes · teams · schedules · attendance · evaluations`
- Teacher: `attendance · evaluations` (their English marking/grading)
- Participant/Leader: `booking` (membership-gated; no team → pointer
  panel to `/me/sessions` + `/me/catalog`, reuse P4 panel)
- Coordinator: none (nav disabled — Coordinator is cohort-world)

## Related code files
Create:
- `client/src/features/english/EnglishPage.jsx` — shell (Outlet of tabs)
- `client/src/features/english/__tests__/EnglishPage.test.jsx`
Modify:
- `client/src/api/api.js` — `englishAPI` (getClasses/getSchedules/
  getAttendanceCalendar)
- `client/src/hooks/queryKeys.js` — attendanceCalendar(params); mode in
  keys (params already serialize for schedules.list)
- `client/src/hooks/useSchedules.js` — `useSchedules(params)` routes to
  englishAPI when `params.mode==='team'`; `useAttendanceCalendar(params)`
  same + key param
- `client/src/hooks/useLearning.js` — `useLearningCohorts(params)` routes
  to englishAPI when mode==='team'
- `client/src/features/schedule/SchedulesPage.jsx` — `mode` prop →
  param pass-through (+ class options filtered by mode)
- `client/src/features/attendance/AttendancePage.jsx` — `mode` prop
- `client/src/features/learning/CohortsTab.jsx` — `mode`+`titleKey` props;
  team mode hides cohort-enroll action (team enrollment lives in Teams)
- `client/src/App.jsx` — route `/english`, redirect `/book` →
  `/english`
- `client/src/components/Navbar.jsx` — NAV_ITEMS English Class
  (Admin/Teacher/Participant full, Coordinator none);
  NAV_PARENT_ROUTES: `/english` ⊃ `/book`,`/classes`,`/teams`; remove
  those from calendar/people/learning parents
- `client/src/i18n/locales/en.json` — `nav.english`, `english.*` keys
- `client/src/features/dashboard/ParticipantDashboard.jsx` — P4 links
  `/calendar?tab=book` → `/english`

## Implementation steps
1. `englishAPI` + hook param routing (no conditional hook calls — branch
   inside queryFn; mode included in queryKey).
2. Parameterize SchedulesPage/AttendancePage/CohortsTab (default props =
   current behavior).
3. Build EnglishPage shell: role map, membership gate (useMyTeams) for
   participant booking tab, BookClassPage embed (existing component).
4. Wire route + navbar + i18n + dashboard links.
5. Component tests: role→tabs matrix, no-team pointer panel, team links.

## Success criteria
- `/english` renders correct tabs per role; booking grid reachable ONLY
  via `/english` for team members.
- English tabs fetch from `/api/english/*` (team world); no English rows
  in `/calendar`/`/learning` surfaces.
- `cd client && npm run test:run` + build + lint (≤ cap 63) green.

## Risk
- rules-of-hooks: route inside queryFn, never conditional hooks.
- Query-key collisions between worlds → mode in key params.
