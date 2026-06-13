# Phase 01 — Sidebar shell (Topbar + left Sidebar + mobile drawer)

**Priority:** High · **Status:** 🟢 shipped (2026-06-13) · **Behavior change:** none

## Overview
Swap the app shell from a top horizontal nav to a **left sidebar + slim topbar**.
Routes/pages stay identical; only the chrome changes. This alone delivers the
enterprise "feel" + scanability. Persona switch is Phase 02; tab-flattening is 03.

## Architecture
```
Layout.jsx
 ├─ Topbar         (logo · global search · NotificationBell · theme · AvatarMenu)
 ├─ Sidebar        (md+: sticky left column; role-filtered grouped nav)
 ├─ MobileSidebar  (<md: Radix dialog slide-over, hamburger in Topbar)
 └─ <main><Outlet/></main>   (max-w content, breadcrumbs at top)
```

## Files
- **New `client/src/components/nav/nav-config.js`** — single source of truth:
  `GROUPS = [{ id, labelKey, items: [{ path, labelKey, icon, access|perm, parentRoutes }] }]`.
  Port `NAV_ITEMS` + `NAV_PARENT_ROUTES` from `Navbar.jsx` and add the group layer
  (LEARNING/OPERATIONS/PEOPLE/ENGLISH/REPORTS/SYSTEM per plan target). Keep the
  per-role `access: 'full'|'read'|'none'` map. (Modularization: config out of JSX.)
- **New `client/src/components/nav/Sidebar.jsx`** — desktop sidebar: maps GROUPS →
  group label + items; role-filters via existing `useRole`/access map; active-state
  using `parentRoutes` (reuse current `isActive` logic); disabled items render a
  tooltip span (preserve current "exists but restricted" affordance). Collapsible
  groups (local state; default expanded). `<nav aria-label>` landmark.
- **New `client/src/components/nav/Topbar.jsx`** — extract from `Navbar.jsx`: logo,
  search trigger + `SearchPalette` + Cmd/Ctrl+K & "/" handlers, `NotificationBell`,
  theme toggle, `AvatarMenu`, hamburger (mobile). Keep all existing keyboard logic
  verbatim (the modal-aware Cmd+K guard).
- **New `client/src/components/nav/MobileSidebar.jsx`** — Radix `dialog`-based
  slide-over rendering the same `Sidebar` content; opened by Topbar hamburger;
  closes on route change.
- **Edit `client/src/components/Layout.jsx`** — compose Topbar + Sidebar + main in a
  responsive grid (`md:grid-cols-[260px_1fr]`); keep skip-to-content link.
- **Retire `client/src/components/Navbar.jsx`** — logic split into Topbar+Sidebar.
  Delete after migrating (grep importers: only `Layout.jsx`).
- **Edit `client/src/components/Breadcrumbs.jsx`** (exists) — surface it in `main`
  top if not already (Docebo-style); wire to current route/section.
- **i18n `en.json`** — add `nav.groups.{learning,operations,people,english,reports,system}`.

## Steps
1. Create `nav-config.js` (groups + items, role access, parentRoutes).
2. Build `Sidebar.jsx` consuming the config; verify role-filtering + active-state.
3. Extract `Topbar.jsx` from `Navbar.jsx` (search/notifications/theme/avatar/hamburger).
4. Build `MobileSidebar.jsx` (Radix dialog) reusing Sidebar.
5. Recompose `Layout.jsx`; delete `Navbar.jsx`; fix the single importer.
6. Add `nav.groups.*` to en.json; ensure Breadcrumbs render.
7. Compile + `test:run` + `lint` (≤63) + `build`.

## Tests
- New `components/nav/__tests__/Sidebar.test.jsx` — per-role group/item visibility
  (Admin sees all groups; Teacher sees Operations/English/Reports; Coordinator sees
  Learning/People-org/Reports; disabled items render tooltip span), active-state.
- New `Topbar.test.jsx` — search opens on Cmd+K, avatar menu items present.
- No existing Navbar test to migrate (confirmed). Update any snapshot importing Navbar.

## Risks / mitigation
- **Responsive**: test md breakpoint; sidebar→drawer below md. Keep content
  `max-w-7xl` centered in the remaining column.
- **Active-state regressions**: reuse the exact `parentRoutes` map (don't re-derive).
- **Keyboard/search regressions**: move the Cmd+K/"/" effect verbatim into Topbar.
- **a11y**: keep skip-link; sidebar + topbar each a labelled `<nav>`; focus-visible.

## Success criteria
- Left sidebar with grouped, role-filtered nav; slim topbar; mobile drawer.
- Every current route reachable; search/notifications/theme/avatar intact.
- Tests + lint (≤63) + build green; no behavior/authz change.
