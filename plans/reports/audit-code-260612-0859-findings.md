# Audit Phase 07 — Code Architecture & Debt — Findings

**Date:** 2026-06-12 · **Round:** 7/8 (`plans/260611-1230-full-system-audit/`)
**Method:** read-and-measure inline — line counts, 3-month git churn, dep-usage greps,
`npm outdated`, `npm ci --dry-run`. No subagents.

## Verdict

The modular-monolith migration has essentially landed: every legacy controller/service that
mattered is now a thin facade (10–35 lines), `pages/` holds exactly the 4 sanctioned composition
shells, deep-import count is 0, server has **zero unused deps**. The debt that remains is small and
specific: an **obsolete CI workaround** (`npm install` vs `npm ci` — the documented reason no longer
reproduces), **10 dead client deps**, two **oversized schedule files** drifting past their sanction,
and 20 documented-pattern lazy requires. No P0/P1. Recommended ships this round: 2 cheap fixes
(CI `npm ci` flip + dead-dep removal) — both validated by the PR's own gates.

## A. Migration debt map

**Facade status (legacy layer):** attendanceService 10 · classController 11 · dashboardController 11
· userController 23 · exportService 28 · authController 31 · authService 33 · enrollmentController 35
— all thin facades ✓. Substantive legacy remainders (by lines): syncController 276 (sanctioned),
evaluationController 237, importService 262, calendarService 172, mfaService/reminderService 154.
**Churn×size top (3 months):** scheduleService (40 commits × 583 lines) — but the churn IS the
migration+Wave E work; the read/query layer was already extracted. No legacy file is silently
growing new business logic — the "don't fight the migration" rule is holding.

**`schedule/` adapter:** `domains/schedule/routes.js` exists (extracted 2026-06-10) — the phase
checklist's "schedule domain routes remain" is already stale ✓ done.

**Vocabulary migration — recommended verdicts (owner confirm):**

| Legacy → target | Status | Verdict |
|---|---|---|
| Class → Cohort | done via DTO | ✓ closed |
| courseName → Program | done | ✓ closed |
| Schedule → Session | adapter + `/api/learning/sessions` | ✓ close (good enough; no physical rename per ADR) |
| Team → LearningGroup | not done (`Team` model + `/api/teams` unchanged; `domains/groups` module exists) | **DROP** — pure rename churn (model+URL+client+tests), zero behavior value; document as permanent vocabulary exception |
| Evaluation → Assessment | dual systems; completion accepts either | **DEFER** — converge legacy evaluation flows onto the assessment engine when next touched; no big-bang migration |
| Enrollment team-based → cohort-based | cohort enrollment live; team Enrollment still drives team-booking | **KEEP BOTH** — they are two real scheduling modes, not debt |

## B. File size & module hygiene

### CODE-014 · P3 · CI server `npm install` workaround is obsolete — **fix this round**
- **Evidence:** `server/package-lock.json` clean in git; **`npm ci --dry-run` succeeds today**
  ("added 4 packages in 998ms", no sync error). The ci.yml comment ("lockfile drifts on every
  googleapis transitive bump → strict npm ci would fail") no longer reproduces — `npm ci` installs
  the lockfile verbatim and only fails on package.json↔lockfile desync, which is not present.
- **Impact:** server CI builds are non-reproducible (each run re-resolves `^` transitive ranges);
  the one gate most prone to "works today, breaks tomorrow" supply drift.
- **Fix:** flip both ci.yml server installs (`server-tests`, `e2e-tests`) to
  `npm ci --no-audit --no-fund`; update the comment + `tech-stack.md` versioning note. No
  googleapis pin needed (^146 + committed lockfile is reproducible under npm ci). Falls back
  trivially if a future desync appears (regen lockfile in the same PR that bumps deps).

### CODE-015 · P3 · 10 dead client dependencies — **fix this round**
- **Evidence:** `client/src` imports Radix via the umbrella `radix-ui` package (9 files); the 8
  individual `@radix-ui/react-*` deps have **zero imports**. `react-hot-toast` (replaced by sonner)
  and `i18next-browser-languagedetector` (removed in the English-only migration): zero refs.
  `tw-animate-css` looked unused but is loaded via CSS `@import` — KEEP.
- **Impact:** dead weight in install/audit surface; `tech-stack.md` still lists react-hot-toast.
- **Fix:** `npm uninstall` the 10; update tech-stack.md toast line. Client tests+build verify.

### CODE-016 · P3 · schedule core drifting past its size sanction — backlog
- **Evidence:** `scheduleService.js` 583 lines (sanction note says ~511) — growth = Wave E
  (capacity, durable cancellation, waitlists), all transaction-heavy booking paths;
  `domains/schedule/use-cases.js` 399 (no sanction). Next-largest unsanctioned:
  emailTemplates 307, attendance-export 285, adminDbRoutes 259, groups/mutations 260.
- **Fix sketch:** don't extract mid-audit. Re-sanction scheduleService at ~585 with a hard
  "next slice extracts into `domains/schedule/`" note in `project-structure.md`; treat
  use-cases.js the same. Template/config-shaped files (emailTemplates, rateLimiters 319) are
  cohesive single-concern — exempt by nature, note only.

### CODE-017 · P3 · 20 lazy requires; several likely no longer dodge a real cycle — backlog
- **Evidence:** 18 of 20 sit in `controllers/auth/*` requiring `models/User`/`mfaService`/
  `invalidateUserCache` per-handler — a pattern copied from the pre-split authController cycle;
  after the modular split the cycle may not exist. 2 legit-looking: completion repository (User),
  waitlist promotion → scheduleService (real cycle: scheduleService ↔ waitlist).
- **Fix sketch:** opportunistic — when touching an auth controller, try hoisting the require;
  if no cycle error, keep it hoisted. Not worth a dedicated PR.

**Dead code / unused deps:** server deps grep = 0 unused ✓. `knip` skipped (CJS noise risk,
low expected yield given the grep results).

**Duplicate logic:** slot/date helpers single-sourced (`lib/scheduling-slots.js` client,
scheduling policies server-side); capacity checks centralized in `session-booking-policy` /
waitlist promotion. No actionable duplication found.

## C. Frontend architecture

- `pages/` = exactly the 4 sanctioned shells (+1 test) ✓; no domain page left behind.
- Deep imports (`../../../`): **0** ✓.
- `AuthContext.jsx` 184 lines — session+role only, no scope creep ✓.
- `hooks/` retains 21 shared hooks (useSchedules, useUsers, useLearning…) consumed across
  features — consistent with the "colocate when single-feature, share when cross-cutting"
  convention; observation only, no action.
- `components/ui` = 15 shadcn-style files; not diffed against upstream this round (no drift
  complaints; low value) — noted as not-audited.

## D. Dependencies & platform

| Pending major | Risk note |
|---|---|
| express 4.22 → 5.2 | Real migration (router/middleware semantics); plan as its own task post-audit |
| mongoose 8.24 → 9.7 | Query/hook behavior changes; touches every repository — own task, after PostgreSQL gate decision (don't pay twice) |
| eslint 9 → 10 (client) | Config-format churn; do with a ratchet re-baseline |
| bcryptjs 2→3, uuid 11→14, dotenv 16→17 | Low risk, low urgency — batch in a deps PR |
| googleapis 146 → 173 | Works as-is; no pin needed once npm ci lands (CODE-014); bump only with calendar-flow retest |

- Minors (helmet, zod, sentry, vite, RQ, etc.): routine; batch whenever.
- **Node engines:** root `>=18` vs CI 22 (server) / 20 (client) vs Render runtime — recommend
  raising engines to `>=20` and pinning the client CI job to 22 for parity (cheap, with CODE-014).
  (Client CI node 20 vs server 22 is an accident of history, not a decision.)

## Owner triage outcomes (2026-06-12) — all 4 as recommended

1. **CODE-014 + CODE-015 → shipped this round.** ci.yml server installs (server-tests + e2e)
   AND the root build scripts (Render deploy path) flipped to `npm ci` — the PR's own CI proves
   the lockfile installs verbatim before main ever deploys. 10 dead client deps uninstalled;
   client gates after removal: 247/247 tests, build clean, lint 63/63.
2. **Vocabulary verdicts locked** and written into `domain-model-and-migration.md`:
   Team→LearningGroup DROPPED (permanent exception), Evaluation→Assessment DEFERRED
   (converge-when-touched), dual enrollment KEPT (two real modes). The vocabulary table has no
   open rows left.
3. **CODE-016 → re-sanctioned**: `project-structure.md` now sanctions scheduleService ~585 +
   `domains/schedule/use-cases.js` ~400 with a hard "further growth must extract into
   `domains/schedule/`" rule; also corrected the stale "remaining Phase 1 work" line
   (routes + features/ shipped — repository interfaces only).
4. **Node alignment → shipped**: engines `>=20` (root), client-tests CI job 20 → 22
   (all jobs now Node 22).

## In-round fixes summary (this PR — `fix/audit-code-round-7`)

| Fix | Files |
|---|---|
| CODE-014 npm ci everywhere | `.github/workflows/ci.yml` (×2 jobs), root `package.json` build scripts, `tech-stack.md` versioning note |
| CODE-015 10 dead client deps | `client/package.json` + lockfile, `tech-stack.md` toast line |
| Node 22 alignment | root `package.json` engines, `ci.yml` client-tests job, `tech-stack.md` header |
| Vocabulary verdicts + re-sanction docs | `domain-model-and-migration.md`, `project-structure.md` |

## Backlog handed to master plan

- **CODE-016** closed-as-decided (re-sanction); extraction only if the files grow again.
- **CODE-017** P3: 18 of 20 lazy requires (controllers/auth/*) likely no longer dodge a real
  cycle post-split — hoist opportunistically when touching those files.
- Dependency majors (express 5, mongoose 9, eslint 10, bcryptjs 3, uuid 14, dotenv 17): each its
  own post-audit task; googleapis bump only with a calendar-flow retest.

## Unresolved questions

None — all four triage questions answered and executed.
