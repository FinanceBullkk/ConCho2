# Phase 02 — Persona modes + switch

**Priority:** High · **Status:** 🟢 shipped (2026-06-13) · **Depends on:** Phase 01
**Behavior change:** `/me/*` routes opened to all authenticated users (UI access only;
reads already self-scoped server-side). Persona itself is a client UI mode.

## Overview
Separate the experience into **personas** (industry standard: admin↔learner switch).
The sidebar renders a different group-set per persona; an avatar-menu toggle switches.
Persona is a lightweight client mode (context + localStorage) — **no new routes**,
no route refactor. Existing `/me/*` pages become the "My Learning" mode's items.

## Personas
| Persona | Who | Sidebar shows | Default for |
|---|---|---|---|
| **Admin Console** | Admin/Coordinator/Teacher | the admin groups (Phase 01) | staff |
| **My Learning** | anyone | Home · My programs · Catalog · My sessions · Paths · Assessments · Feedback · Transcript (`/me/*`) | Participant (locked) |
| **My Team** | managers (has direct reports) | reuse `/my-team` as an entry (not a full mode) | — |

- Participant is **locked** to My Learning (no admin routes exist for them anyway).
- Staff default to Admin Console, can switch to My Learning (they self-enroll too →
  show empty states rather than hiding; see plan open-Q2).

## Files
- **New `client/src/context/PersonaContext.jsx`** (or `hooks/usePersona.js`) —
  `{ persona, setPersona }`, init from role (Participant→learner else admin) +
  `localStorage` override; expose `canSwitch` (false for Participant).
- **Edit `components/nav/nav-config.js`** — add `LEARNER_ITEMS` group-set; tag groups
  with the persona(s) they belong to.
- **Edit `components/nav/Sidebar.jsx`** — pick group-set by `persona`.
- **Edit `components/nav/Topbar.jsx` (AvatarMenu)** — add "Switch to My Learning" /
  "Switch to Admin console" item (hidden when `!canSwitch`); on switch, `setPersona`
  + navigate to that mode's home (`/home` admin, `/me/programs` or a `/me` landing
  for learner). Keep My Team link when manager.
- **Edit `App.jsx`** — wrap protected shell in `PersonaProvider` (inside `AuthProvider`).
- **i18n `en.json`** — `nav.switchToLearner`, `nav.switchToAdmin`, `nav.persona.*`.

## Steps
1. PersonaContext (role default + localStorage + canSwitch).
2. nav-config: learner group-set + persona tags.
3. Sidebar: render by persona.
4. AvatarMenu: switch control + navigate to mode home.
5. Provider wiring in App.jsx.
6. en.json; compile + test + lint + build.

## Tests
- `PersonaContext.test.jsx` — default by role; Participant locked; localStorage round-trip.
- Sidebar test extended — learner persona shows `/me/*` items, hides admin groups.
- AvatarMenu test — switch visible for staff, hidden for Participant; click changes persona + navigates.

## Risks / mitigation
- **Persona vs route mismatch** (e.g., learner persona but URL is `/people`): on mode
  switch we navigate to the mode home; deep-linking an admin URL while in learner
  persona still works (route guard is the real boundary) — sidebar just highlights
  nothing. Acceptable; optionally auto-correct persona from route on load.
- **localStorage stale after role change** — re-derive default if stored persona is
  invalid for the role (Participant can never be admin).

## Success criteria
- Avatar menu switches Admin Console ↔ My Learning; sidebar swaps group-set.
- Participant locked to learner; managers see My Team entry.
- Server authz unchanged; tests + lint (≤63) + build green.
