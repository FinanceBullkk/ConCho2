# Phase 01 — Dedupe Surfaces + Regroup Nav

**Priority:** High · **Status:** 🔴 not started
**Depends on:** owner confirm of target IA (plan.md open question 1)

## Overview

Bounded frontend IA cleanup. No backend changes, no behavior change — only WHERE
each existing surface is reached. Three moves, smallest→largest blast radius.

## Move A — Sync dedupe (smallest, do first)

`SyncPage` is mounted twice. `sync:sheets` is **Admin-only** (`useRole.js:135`) and
System is Admin-only, so Reports never needed it.

**Files:**
- `client/src/pages/ReportsPage.jsx` — remove the `sheets-sync` tab entry + its
  `<TabsContent>` + the `SyncPage` import. Reports = Analytics + HR Export.
- `client/src/App.jsx` — add legacy redirect `{ from: '/reports', to: ... }` is not
  right (Reports stays); instead handle `?tab=sheets-sync` by leaving ReportsPage to
  fall back to first allowed tab (already does). Optionally add a note. No new route
  needed — ReportsPage already substitutes the first allowed tab when `tab=` is unknown.
- Verify `ReportsPage` test (if any under `features/admin/__tests__` or `pages`) still passes.

**Acceptance:** Admin reaches Sync only via `System▸Sync`; `/reports?tab=sheets-sync`
silently lands on Analytics (no crash, no 404).

## Move B — Consolidate reporting into `/reports`

Pull the two reporting tabs out of Learning into the top-level Reports section.

**Files:**
- `client/src/pages/ReportsPage.jsx` — add two tabs at the FRONT:
  - `overview` → renders `<DashboardTab/>` (from `features/learning/DashboardTab`), perm `read:reports`
  - `completion` → renders `<ReportsTab/>` (from `features/learning/ReportsTab`), perm `read:reports`
  - keep `analytics` (read:attendance), `hr-export` (export:data).
  - Final order: Overview · Completion · Attendance Analytics · HR Export.
- `client/src/features/learning/LearningPage.jsx` — remove `dashboard` + `reports`
  tabs (and the `DashboardTab`/`ReportsTab` imports + `<TabsContent>`). Learning TABS
  becomes: programs · cohorts · paths · assignments · assessments · feedback.
  Default tab stays `programs`.
- `client/src/components/Navbar.jsx` — `NAV_ITEMS` Reports entry: set
  `Coordinator: 'full'` (they hold `read:reports`; previously could see these tabs
  inside Learning). Leave Teacher `full`, Participant `none`.
- `client/src/i18n/locales/en.json` — add `reports.tabs.overview` / `.completion`
  (+ `Desc` if PageHeader uses per-tab descriptions; ReportsPage uses inline
  `description` strings today — mirror that pattern, English literals OK there).
- Tests: update `LearningPage` test (tab count/labels) + any ReportsPage test.
  `DashboardTab`/`ReportsTab` are self-contained — they render the same regardless of
  parent, so their own tests are unaffected by the move.

**Acceptance:** All reporting reachable under `/reports`; Learning shows 6 tabs, no
horizontal scroll on desktop; Coordinator sees the Reports nav item; Teacher sees
Overview+Completion+Analytics (no HR Export); Participant unaffected.

## Move D — Home → landing; move home analytics into Reports (owner: full scope)

Today `DashboardPage` (Home) for Admin is a heavy analytics page (KPIs + course/BU/
level/class-progress/laggard) plus actionable bands (AlertBand, TodayHero). Split it:

**Extract:** new `client/src/features/dashboard/AdminAnalyticsPanel.jsx` — move the
filter state + `useDashboardStats`/`useDashboardFilterOptions` + every chart row
(KPI → laggard) into it verbatim. Admin-only data (hooks already `enabled: isAdmin`).

**Home becomes a landing** (`DashboardPage.jsx`): keep the `mustChange` gate (return
null) and the participant branch (`ParticipantDashboard`). For staff: greeting header
(no refresh button) + `AlertBand` + `TodayHero` + a new **`QuickActions`** grid + a
"View analytics →" CTA to `/reports`. No `useDashboardStats` call remains in Home.

**QuickActions:** new `client/src/features/dashboard/QuickActions.jsx`. v1 was
role-aware nav-shortcut cards, but owner found them irrelevant (they duplicated the
navbar). REVISED to **contextual tiles** driven by one shared, fail-soft
`useOperationalDashboard({window:'30'})` query (same cache key as Reports▸L&D
Dashboard, gated to `read:reports`): **Overdue learners** → `/learning?tab=assignments`,
**Certificates expiring** (+ "N expired" alert) → `/reports?tab=completion`, **Sessions
next 7 days** → `/calendar`, **Completion rate** → `/reports?tab=learning`. Each tile
shows a live number + alert tone and links where you act — NOT a nav shortcut. Skips
any tile whose metric block is null (fail-soft). Complements AlertBand (do-now ops).

**Reports gains the home analytics** as the first tab. Final `/reports` tab set:
| id | label | renders | perm |
|---|---|---|---|
| `overview` | Overview | `AdminAnalyticsPanel` (from Home) | `read:dashboard` (NEW, Admin-only) |
| `learning` | L&D Dashboard | `DashboardTab` (from Learning) | `read:reports` |
| `completion` | Completion | `ReportsTab` (from Learning) | `read:reports` |
| `analytics` | Attendance | `AttendanceDashboardPage` | `read:attendance` |
| `hr-export` | HR Export | `HRExportPage` | `export:data` |

- `useRole.js` — add `'read:dashboard': ['Admin']` (Home analytics is Admin-only today).
- `en.json` — add `dashboard.quickActions.*` + `dashboard.viewAnalytics` (Home is in the
  `t()` world). Reports tab labels stay inline English literals (existing pattern).
- Tests: rewrite `DashboardPage.test.jsx` (admin no longer fires stats from Home — assert
  landing renders QuickActions; participant + mustChange branches unchanged). The
  extracted `AdminAnalyticsPanel` keeps the mustChange-disabled-query behavior; add a
  focused test there if needed. Update `ReportsPage.test.jsx` for the new tab set.

## Move C — Group Learning's 6 tabs (visual, optional polish)

In `LearningPage.jsx` add a non-interactive separator/label between the Catalog
cluster (programs·cohorts·paths) and the Delivery cluster (assignments·assessments·
feedback) inside `TabsList`. Pure presentational — `Tabs` value logic unchanged.
Skip if it complicates the Radix `TabsList` a11y; the 8→6 reduction already removes
the scroll. Decide during implementation.

## Verify (all moves)

```
cd client && npm run test:run
cd client && npm run lint        # must stay ≤ cap 63
cd client && npm run build
```

## Risk / mitigation

- **Bookmarks to `/learning?tab=reports|dashboard`** break → add them to
  `LEGACY_REDIRECTS` in `App.jsx` pointing at `/reports?tab=completion|overview`.
- **Lost Coordinator access** to learning dashboard → mitigated by Reports nav flip.
- Keep blast radius in `pages/` + `LearningPage` + `Navbar` + `en.json` + their tests;
  do NOT touch `DashboardTab`/`ReportsTab`/`SyncPage` internals (just remount).

## Todo

- [ ] Move A: drop Sync from Reports
- [ ] Move B: relocate Dashboard+Reports tabs → /reports; trim Learning to 6; flip Coordinator nav; en.json; legacy redirects
- [ ] Move C (optional): cluster Learning tabs visually
- [ ] Tests + lint + build green
- [ ] Update `docs/development-roadmap.md` + `docs/current-system-map.md` (UI location moves)
- [ ] Commit (conventional, no AI refs)

## Success criteria

- One Sync surface, one reporting home, Learning ≤ 6 tabs.
- Zero broken bookmarks (redirects cover moved URLs).
- No backend/spec change; no behavior change; tests + lint + build green.
