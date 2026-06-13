# Phase 03 — Flatten tab strips into sidebar sub-items

**Priority:** Medium · **Status:** 🔴 not started · **Depends on:** Phase 01 (02 optional)
**Behavior change:** none

## Overview
With the sidebar in place, the in-page horizontal `Tabs` strips become a redundant
second navigation level. Promote each umbrella page's tabs to **sidebar sub-items**
(deep-linkable `?tab=`), and retire the in-page strip where the sidebar fully covers
it. Do it **section by section** (each independently shippable) to keep risk low.

## Approach (per section)
For a section page that today renders `<Tabs>` over `?tab=`:
1. In `nav-config.js`, expand that group's item into sub-items, one per tab, each a
   deep link (`/people?tab=offices`, etc.) with the tab's `perm`.
2. The page keeps reading `?tab=` (no logic change) but **drops the `TabsList`**
   (the sidebar now provides it); render the active tab's body directly. Keep a
   minimal fallback if `?tab=` missing (first allowed).
3. Sidebar highlights the active sub-item from `?tab=`.

## Sections & order (lowest-risk first)
| Order | Section | Tabs → sub-items | Notes |
|---|---|---|---|
| 1 | **System** | Settings · Database · Sync · Reconciliation · Audit | Admin-only; self-contained; easy first |
| 2 | **People** | Users · Departments · Offices · Rooms | per-tab perms already exist |
| 3 | **Reports** | Overview · L&D Dashboard · Completion · Attendance · HR Export | from this session's consolidation |
| 4 | **Learning** | Programs · Cohorts · Paths · Assignments · Assessments · Feedback | keep Catalog/Delivery as sub-group headers in sidebar |
| 5 | **English** | Classes · Teams · Schedules · Attendance · Evaluations · Booking | role-gated tabs → role-gated sub-items |
| 6 | **Calendar** | Schedules · Attendance | small; may keep inline if 1–2 tabs |

## Files (per section)
- `components/nav/nav-config.js` — sub-items for the section.
- The section page (`pages/*Page.jsx` or `features/*/...Page.jsx`) — drop `TabsList`,
  keep `?tab=` body switch.
- Tests for that page — assert sub-item nav drives the body; update tab-strip asserts.

## Risks / mitigation
- **Deep-link/bookmark stability** — `?tab=` values unchanged, so existing links keep
  working; only the chrome moves.
- **Section sprawl in sidebar** — use collapsible sub-groups; collapse non-active
  sections by default so the sidebar stays scannable.
- **Do NOT** retire a tab strip until its sub-items are wired + tested (no orphan).

## Success criteria
- No section shows a redundant horizontal tab strip duplicated by the sidebar.
- All `?tab=` deep links + bookmarks still resolve.
- Each section migrated with tests + lint (≤63) + build green; no behavior change.

## Note
Phase 03 is incremental and optional-to-complete-all-at-once — shipping Phases 01+02
already delivers the enterprise IA; 03 is the polish that removes the last
double-level. Stop after any section if priorities shift.
