# Phase 0 — Migration map (consumer-side)

> Lists every existing usage pattern that should be **updated** to take advantage of new Phase 0 primitives. None of these are *required* — Phase 0 is backwards-compatible — but they're high-leverage cleanups while you're already in the diff.

---

## §1. Replace ad-hoc semantic badges with new variants

**Find:**
```bash
grep -rn 'variant="outline".*\(text-success\|text-warning\|text-destructive\|text-info\)' \
  client/src --include="*.jsx"
```

**Replace pattern:**

| Old (verbose) | New (semantic) |
|---|---|
| `<Badge variant="outline" className="text-success border-success/30 bg-success/10">Active</Badge>` | `<Badge variant="success" dot>Active</Badge>` |
| `<Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">Pending</Badge>` | `<Badge variant="warning" dot>Pending</Badge>` |
| `<Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10">Inactive</Badge>` | `<Badge variant="danger" dot>Inactive</Badge>` |
| `<Badge variant="outline" className="text-info border-info/30 bg-info/10">Waiting</Badge>` | `<Badge variant="info" dot>Waiting</Badge>` |
| `<Badge variant="secondary" className="text-muted-foreground">Draft</Badge>` | `<Badge variant="neutral">Draft</Badge>` |

**Likely targets** (based on grep of current codebase):
- `pages/AttendanceDashboardPage.jsx`
- `pages/ClassesPage.jsx`
- `pages/ParticipantDashboard.jsx`
- `components/StatusBadge.jsx` ← *especially* — this whole file may collapse to 10 lines using the new API
- `components/StatusChips.jsx`
- `components/KPICard.jsx`

---

## §2. Strip emoji from product UI

Emoji-as-icons are forbidden in Phase 0 design language. Replace with `lucide-react` icons (already a dep — `^1.14.0`).

| File | Line | Current | Replace with |
|---|---|---|---|
| `pages/CourseManager.jsx` | ~136 | `📊 Course Settings` | `<BarChart3 className="size-4" /> Course Settings` |
| `pages/CourseManager.jsx` | ~197 | `📅 Sessions (...)` | `<CalendarDays className="size-4" /> Sessions ({n})` |
| `pages/CourseManager.jsx` | ~356 | `🟢 Ongoing` | `<Badge variant="success" dot>Ongoing</Badge>` |
| `pages/CourseManager.jsx` | ~360 | `✅ Completed` | `<Badge variant="success" dot>Completed</Badge>` |
| `pages/ClassesPage.jsx` | ~143 | `🟢 Đang học` (in `<option>`) | Plain text `Đang học` — use chip outside the select |
| `pages/AttendanceDashboardPage.jsx` | ~65 | toast `✅ Đã tải ...` | `toast.success('Đã tải ${filename}')` — sonner renders its own icon |
| `pages/AttendanceDashboardPage.jsx` | ~143 | inline conditional on `startsWith('✅')` | Track success/error via separate state, not string sniffing |
| `pages/BookClassPage.jsx` | ~126 | `'Session created ✅'` | `'Session created'` — toast handles icon |
| `components/Progress/StudentProgressModal.jsx` | 6 | `STATUS_ICONS = { P: '✅', A: '❌', L: '⚠️', EL: 'ℹ️' }` | Lucide map (see code snippet below) |
| `components/Progress/TeamProgressModal.jsx` | 7-10, 121 | `'✅'`, `'❌'`, `'⚠️'`, `'✅ Present'` | same |

**Lucide replacement snippet for Progress modals:**

```jsx
import { Check, X, AlertTriangle, Info } from 'lucide-react';

const STATUS_ICONS = {
  P:  <Check className="size-3.5 text-success" />,
  A:  <X className="size-3.5 text-destructive" />,
  L:  <AlertTriangle className="size-3.5 text-warning" />,
  EL: <Info className="size-3.5 text-info" />,
};

// Renders inline. Don't forget aria-label on the parent for screen-reader users.
```

---

## §3. Remove `shadow-*` decorations on Cards

Search:
```bash
grep -rn "shadow-sm\|shadow-md\|shadow-lg" client/src/pages client/src/components --include="*.jsx"
```

For each usage:
- If on a `<Card>` — **remove** (Card no longer ships with shadow; if you re-add via className you're back to the old aesthetic).
- If on a button or floating element (dropdown, popover) — **keep** (those legitimately need elevation).
- If on a landing-page hero — **review** (probably wants `border` instead of `shadow`).

---

## §4. Tighten KPICard

The custom `components/KPICard.jsx` likely has its own shadow / gradient orb in the corner (matching the screenshot you provided). After Phase 0 tokens land, the KPI card should look:

- Background: `bg-card` (no gradient orb)
- Border: `border border-border` (hairline)
- Padding: `p-5`
- Number: `text-[28px] font-semibold tnum tracking-tight`
- Label: uppercase `.text-overline` (utility now in index.css)
- Delta indicator: `<Badge variant="success" size="sm">+4</Badge>` (instead of inline-styled span)

**Tracked as a Phase 2 task** — don't refactor KPICard in Phase 0.

---

## §5. Audit Navbar pill-active style

`Navbar.jsx` line ~273 has:
```jsx
active ? 'bg-primary/15 text-primary' : ...
```

This works fine in Phase 0 (`primary/15` → `bg-primary-soft` would be cleaner but not required). Mark as deferred — will be replaced entirely by Sidebar in Phase 1.

---

## §6. Container width audit

`Layout.jsx`:
```jsx
<main ... className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
```

This is fine for Phase 0. **In Phase 1**, when Sidebar lands, `Layout.jsx` becomes a flex container and the `max-w-7xl` constraint moves to inner page wrappers — at which point dense tools (Schedules grid, Users table) should remove it entirely so they can fill the viewport.

---

## §7. Test snapshots

If any vitest snapshot tests live in `__tests__` folders, they may fail because:
- Class strings on components changed
- Inline styles changed

**To accept the new snapshots:**
```bash
npm run test:run -- -u
```

Review each diff manually before committing the snapshot updates. Don't just blanket-accept.

---

## §8. Visual diff checklist

Before merging Phase 0, take screenshots of these 8 states and compare against pre-PR:

1. `/home` — dashboard (admin) — DARK
2. `/home` — dashboard (admin) — LIGHT
3. `/people` — users table — DARK
4. `/people` — users table — LIGHT
5. `/calendar` — schedules grid — DARK
6. `/attendance` (or wherever the marking page lives) — DARK
7. `/me/settings` — settings form — DARK
8. `/login` — login screen — DARK

Expected:
- Same content, same layout, same interactivity
- Tighter type, calmer colors, less shadow, less rainbow
- Nothing should feel BROKEN — only feel CALMER

If any state looks broken (overlap, unreadable contrast, layout shift > 10px), that's a real bug. Open an issue and fix before merge.
