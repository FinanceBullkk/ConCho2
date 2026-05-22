# Phase 0 — Foundation Refactor

> **Goal:** Replace design tokens and the 5 core UI primitives. After this PR ships, every page in TMS v2 will automatically look ~50% more polished — no per-page changes required.
>
> **Scope:** `client/src/index.css` + `client/src/components/ui/{button,badge,card,table,input}.jsx`. No layout, no routing, no page-level changes.
>
> **Why first:** Tokens + primitives are leaf dependencies of everything else. Doing them in isolation gives clean diffs, easy revert, and unblocks Phase 1 (sidebar) and Phase 2 (per-page).

---

## 📦 What's in this folder

```
phase-0/
├── README.md                ← you are here
├── MIGRATION.md             ← consumer-side find/replace map + emoji cleanup
└── files/
    ├── index.css            → replaces  client/src/index.css
    ├── button.jsx           → replaces  client/src/components/ui/button.jsx
    ├── badge.jsx            → replaces  client/src/components/ui/badge.jsx
    ├── card.jsx             → replaces  client/src/components/ui/card.jsx
    ├── table.jsx            → replaces  client/src/components/ui/table.jsx
    └── input.jsx            → replaces  client/src/components/ui/input.jsx
```

Each file is **paste-ready** — copy 1:1 to its target path.

---

## 🎯 Acceptance criteria

After Phase 0 lands:

| Check | Expected |
|---|---|
| `npm run dev` boots cleanly | No CSS errors, no console errors |
| Dashboard page renders | All KPI cards, charts, tables render with new tokens — no broken styles |
| Toggle dark ↔ light | Both modes render correctly; tokens swap without flash |
| All existing buttons render | `default`, `outline`, `secondary`, `ghost`, `destructive`, `link` all work |
| All existing badges render | `default`, `secondary`, `destructive`, `outline`, `ghost`, `link` all work |
| Tables render | Header is uppercase 11px subtle; rows have subtle hover |
| Forms render | Inputs are 30px tall, padding feels balanced |
| `npm run test` passes | All vitest + msw tests still pass (none should test exact pixel values) |
| `npm run lint` passes | No new ESLint warnings |
| Visual regression | Charts use mono+blue palette instead of 8-color rainbow |

---

## 🔧 Step-by-step rollout

### Step 1 — Branch & backup
```bash
git checkout -b phase-0-tokens
# OPTIONAL: snapshot screenshots for visual diff
npm run dev   # take screenshots of /home, /people, /schedules, /attendance
```

### Step 2 — Replace files (atomic — single commit)
```bash
cp phase-0/files/index.css     client/src/index.css
cp phase-0/files/button.jsx    client/src/components/ui/button.jsx
cp phase-0/files/badge.jsx     client/src/components/ui/badge.jsx
cp phase-0/files/card.jsx      client/src/components/ui/card.jsx
cp phase-0/files/table.jsx     client/src/components/ui/table.jsx
cp phase-0/files/input.jsx     client/src/components/ui/input.jsx

git add -A
git commit -m "phase-0: refactor design tokens + 5 base primitives"
```

### Step 3 — Verify locally
```bash
npm run dev
# Visit every top-level route. Verify:
#   /home          → dashboard renders, charts mono+blue
#   /people        → users table, badges intact
#   /programs      → class list
#   /calendar      → schedules grid
#   /reports       → analytics
#   /me/settings   → forms
#   /login         → still works
```

### Step 4 — Run tests
```bash
npm run test:run        # unit
npm run test:e2e        # playwright — should pass
```

### Step 5 — Open PR
PR description template at the bottom of this doc.

---

## 🧬 What changed (by file)

### `index.css` — design tokens
**Color system swap:** HSL → OKLCH for all color values.

| Before | After |
|---|---|
| `hsl(217 91% 60%)` | `oklch(0.68 0.16 250)` |
| `hsl(222 47% 7%)` (dark bg) | `oklch(0.155 0.005 260)` |
| `hsl(217 33% 22% / 0.6)` (border) | `oklch(1 0 0 / 0.06)` |

**Why OKLCH:** Perceptually uniform — `oklch(0.68 ...)` and `oklch(0.72 ...)` actually look like equal-lightness colors to the eye. HSL doesn't ([yellow at 50% L looks much brighter than blue at 50% L](https://oklch.com/)).

**Browser support:** Chrome 111+, Safari 15.4+, Firefox 113+. All within current targets.

**Chart palette compressed:**
| Slot | Old | New |
|---|---|---|
| `--chart-1` | blue | brand blue (unchanged hue) |
| `--chart-2` | violet | neutral light |
| `--chart-3` | cyan | neutral mid |
| `--chart-4` | emerald | neutral dark |
| `--chart-5` | amber | neutral darkest |
| `--chart-6` | red | RESERVED for "at-risk" / danger |
| `--chart-7` | pink | RESERVED for "pending" / warning |
| `--chart-8` | lime | RESERVED for "done" / success |

→ Existing components using `bg-chart-1`, `bg-chart-2`, `bg-chart-3` now render in monochrome+brand-accent. No code changes required.

**New tokens:**
- `--surface-2` — consistent raised surface for chips, segments, hover states
- `--color-primary-soft`, `--color-success-soft`, etc. — aliases of the existing `--*-tint` for new component code (`bg-primary-soft`, `bg-success-soft` etc.)

**Density tightened:**
- `--row-h: 34px` (was 36)
- `--control-h: 30px` (was 32)

**Typography utilities re-tuned:**
- `.text-h1`: 28px → 22px (Linear/Vercel headings are quieter)
- `.text-h2`: 20px → 18px
- `.text-h3`: 16px → 14px
- `.text-body`: 14px → 13px

Headings are smaller because **density of content** is now communicated through tight type, not loud type. The old 28px H1 was shouting.

---

### `button.jsx`
**API surface unchanged** — all existing variants and sizes still work.

**Added:** `variant="inverse"` — solid `bg-foreground text-background`. Use for high-emphasis CTAs (Linear pattern).

```jsx
// Old
<Button>New schedule</Button>

// New, preferred for hero actions
<Button variant="inverse">New schedule</Button>

// Still works (blue) — keep for non-hero primary actions
<Button>Submit</Button>
```

**Default size shrunk:** 36px → 30px height. Existing layouts that wrap buttons with `min-h-` or rely on h-9 may need a +2px tweak. See `MIGRATION.md`.

---

### `badge.jsx`
**API surface preserved** — `default`, `secondary`, `destructive`, `outline`, `ghost`, `link` all still work.

**Added 5 semantic variants:**
- `variant="success"` — green tint, green text, green border
- `variant="warning"` — amber tint, amber text
- `variant="danger"` — red tint, red text
- `variant="info"` — cyan tint, cyan text
- `variant="neutral"` — surface-2, muted text (replaces `text-muted-foreground bg-secondary` patterns)

**Added `dot` prop** — prepends a 6px round indicator:
```jsx
<Badge variant="success" dot>Active</Badge>
<Badge variant="warning" dot>Pending</Badge>
```

**Added `size` prop** — `sm` (18px), `default` (22px), `lg` (26px). Use `sm` inside table cells and session cards.

---

### `card.jsx`
**Visual changes** (no API breaks):
- ❌ Removed `shadow-sm` from Card root
- ❌ Removed forced `gap-6 py-6` from Card root
- ✅ `CardHeader` now has `border-bottom` + tighter padding (16px 20px)
- ✅ `CardContent` padding 20px
- ✅ `CardFooter` has top-border + subtle background

**New `tone` prop:**
```jsx
<Card tone="surface-2">…</Card>   // slightly raised — for stat strips
<Card>…</Card>                     // default (bg-card)
```

---

### `table.jsx`
**Visual changes** (no API breaks):
- Header cells: `text-[11px] font-medium uppercase tracking-wider text-subtle-foreground`
- Row hover: `bg-foreground/[0.015]` (very subtle — was `bg-muted/50`)
- Cell padding: `px-3 py-3` (was `p-2`)
- Default font: `text-[13px] tabular-nums`

---

### `input.jsx`
**Visual changes** (no API breaks):
- Height: 30px (was 36)
- Padding-x: 10px (was 12)
- Font: 13px (was 14/16 responsive)
- Focus ring: 2px primary (was 3px `ring-ring/50`)

**New `size` prop:** `sm` (26px), `default` (30px), `lg` (38px). Use `lg` in modal forms.

---

## ⚠️ Known visual differences (intentional)

These are NOT regressions — they are the redesign:

| Area | Before | After |
|---|---|---|
| Page H1 size | 28px bold | 22px semibold |
| KPI card numbers | 30px+ | unchanged (still large by design) |
| Buttons | 36px tall | 30px tall |
| Form fields | 36px tall | 30px tall |
| Table headers | dark, normal-case | grey, UPPERCASE |
| Row hover | chunky grey stripe | barely-visible tint |
| Charts | 8-color rainbow | mono + blue accent |
| Card shadows | small drop shadow | none — borders only |
| Border opacity | 60% | 6% (hairline) |
| Background (dark) | desaturated navy | true cool near-black |

If the dev or stakeholder reports any of these as "broken", reply with **"intentional — Phase 0 §<line>"**.

---

## ⚠️ What might break (and how to fix)

### 1. Layouts that hardcode `h-9` or `h-10` for buttons
Some pages wrap buttons in containers that assume specific heights. After Phase 0, buttons are 30px instead of 36px. Visual gap may appear.

**Search command:**
```bash
grep -rn "h-9\|h-10" client/src/pages client/src/components
```

**Fix:** Replace explicit heights with `items-center` on the container, or use `[&_button]:h-[30px]`.

### 2. Custom badges using ad-hoc colors
Code like `<Badge variant="outline" className="text-success border-success/30 bg-success/10">` works but is verbose.

**Find:**
```bash
grep -rn "bg-success/\|bg-warning/\|bg-destructive/" client/src --include="*.jsx" | grep -i "badge\|chip"
```

**Replace pattern:** See `MIGRATION.md` §1.

### 3. Charts assuming specific hues
Some chart legends say "Entrance" with `bg-chart-2/70`. The color shifts from violet → neutral-light. Re-verify chart legends still make sense.

**Find:**
```bash
grep -rn "chart-2\|chart-3\|chart-4\|chart-5" client/src --include="*.jsx"
```

### 4. Pages using shadows for depth
If a page relied on Card's `shadow-sm` to separate it from background, removing shadow may make it blend in. Add `border-2` or use `tone="surface-2"`.

---

## 🧪 Verification commands

```bash
# Boot
npm run dev

# Type check (if you have one)
npm run lint

# Unit tests
npm run test:run

# E2E (run last — slowest)
npm run test:e2e

# Visual: open each top-level route and verify
#   - No console errors
#   - Tokens visible in DevTools → :root computed styles → --primary etc.
#   - Dark/light toggle works
```

---

## 🛟 Rollback

Single commit revert:
```bash
git revert <phase-0-commit-sha>
```

No data migrations. No DB changes. No locale changes. Pure CSS+component refactor.

---

## 📋 PR description template

```markdown
## Phase 0 — Design tokens + base primitives

Replaces design tokens (HSL → OKLCH) and refactors 5 base UI primitives
to a tighter, more SaaS-like aesthetic (Linear/Vercel/Stripe reference).

### Visual changes (intentional)
- Headings 28px → 22px (less shout, more density)
- Buttons + inputs 36 → 30px
- Card shadows removed; borders only (`/0.06` alpha)
- Charts now monochrome + brand-blue accent (was 8-color rainbow)
- New `Badge` semantic variants: success/warning/info/danger/neutral + `dot` prop

### API
- All existing button/badge/card/table/input usages still work
- New props: `Button variant="inverse"`, `Badge variant=...` + `dot`,
  `Card tone="surface-2"`, `Input size="sm|default|lg"`

### Files
- [x] client/src/index.css
- [x] client/src/components/ui/button.jsx
- [x] client/src/components/ui/badge.jsx
- [x] client/src/components/ui/card.jsx
- [x] client/src/components/ui/table.jsx
- [x] client/src/components/ui/input.jsx

### Tests
- [x] `npm run test:run` passes
- [x] `npm run test:e2e` passes
- [x] Manually verified: /home, /people, /programs, /calendar, /reports,
      /me/settings, /login, dark mode, light mode

### Not in this PR
- Sidebar layout (Phase 1)
- Per-page refactors (Phase 2)
- Emoji cleanup in page-level files (Phase 2 — tracked in MIGRATION.md)

### Screenshots
[before / after — attach 4 pages × 2 modes = 8 images]
```
