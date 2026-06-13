# Sidebar + Persona IA — enterprise-standard navigation

**Created:** 2026-06-13 · **Status:** 🟢 shipped — all 3 phases complete (2026-06-13)
**Type:** Frontend IA / app-shell rework · no backend/behavior change
**Research:** [`plans/reports/research-260613-2304-lms-ia-navigation-patterns.md`](../reports/research-260613-2304-lms-ia-navigation-patterns.md)
**Builds on:** branch `feat/ia-dedupe-and-regroup-nav` (dedupe + consolidated Reports +
Home landing + contextual tiles) — that work is page-level and survives this rework.

## Goal
Replace the top horizontal bar (7 items hiding ~27 in-page tabs) with the
enterprise pattern proven by Docebo / TalentLMS / SAP SuccessFactors:
**a role-filtered left sidebar of labelled groups + a persona switch
(Admin Console ↔ My Learning ↔ My Team) + a slim topbar (logo · search ·
notifications · theme · avatar)**. English-class becomes its own labelled sidebar
group (disambiguates the duplicate Schedules/Attendance names without merging).

## Locked constraints (do NOT violate)
- English-class separation stays (owner decision) — it's a sidebar GROUP, not merged.
- Capability/role authz unchanged — sidebar only *shows/hides*; server still enforces.
- English-only UI via `en.json` (`t()`); no Vietnamese.
- Routes/pages mostly unchanged — this is a SHELL rework, not a route refactor.
- Mobile: sidebar collapses to a drawer (Radix `dialog` based).
- ESLint ratchet ≤ cap 63; all CI gates green.

## Target IA
```
ADMIN CONSOLE  (Admin/Coordinator/Teacher — each group role-filtered)
  Home
  LEARNING    Programs · Cohorts · Learning paths
  OPERATIONS  Calendar/Sessions · Attendance · Assignments · Assessments · Feedback
  PEOPLE      Users · Teams · Departments · Offices · Rooms
  ENGLISH     Classes · Teams · Schedules · Attendance · Evaluations · Booking
  REPORTS     Overview · L&D Dashboard · Completion · Attendance · HR Export
  SYSTEM      Settings · Sync · Reconciliation · Audit · Database
MY LEARNING  (Participant always; staff via switch)
  Home · My programs · Catalog · My sessions · Paths · Assessments · Feedback · Transcript
MY TEAM      (managers) — direct-report progress / overdue / certificates
```

## Phases (each independently shippable, verified green)
- [phase-01-sidebar-shell.md](phase-01-sidebar-shell.md) — left Sidebar + slim Topbar + mobile drawer; same routes; **biggest visual change, zero behavior change**.
- [phase-02-persona-modes.md](phase-02-persona-modes.md) — persona context + switch; sidebar renders group-set by persona; Participant locked to learner.
- [phase-03-flatten-tabs.md](phase-03-flatten-tabs.md) — move umbrella-page tab strips into sidebar sub-items (deep-linkable), retire redundant in-page `Tabs`.

## Decisions (defaults — chosen, not blocking)
- Persona switch lives in the **avatar dropdown (top-right)** — extends existing `AvatarMenu` (industry-common; consistent with current account/system/logout).
- **Fixed curated nav** (NOT Docebo-style admin-configurable Pages) — YAGNI for ~1000 internal users.
- Nav defined once in `components/nav/nav-config.js` (single source; replaces `NAV_ITEMS`).

## Definition of Done (per phase)
- ☑ Sidebar/topbar render correct per role; active-state + breadcrumbs correct
- ☑ Mobile drawer works; Cmd/Ctrl+K search + notifications + theme intact
- ☑ a11y: `<nav>` landmarks, focus-visible, keyboard, skip-link preserved
- ☑ i18n en updated; tests + lint (≤63) + build green
- ☑ Tracker + current-system-map updated; no spec change (UI location only)

## Open questions
1. Push the current dedupe branch as PR #1 first, then sidebar as stacked PR #2 — or one combined IA PR? (Recommend: separate PRs for reviewability.)
2. Should staff (Admin/Teacher) keep a working "My Learning" mode even if they have no enrollments (empty states), or hide the switch when they have none? (Recommend: always show — staff self-enroll too.)
