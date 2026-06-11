# Audit Phase 06 — Tests & CI Health — Findings

**Date:** 2026-06-11 · **Round:** 6/8 (full-system audit `plans/260611-1230-full-system-audit/`)
**Method:** 3× full server-suite runs + client coverage run + invariant grep inventory +
e2e spec review + eslint JSON categorization + CI workflow/branch-protection probe. Inline, no subagents.

## Verdict

Suite is healthy at the core: **854/854 server tests / 87 suites pass 3× consecutively**
(~5.5 min local, 8m CI), client 247/247, zero flakes observed, no open handles reported.
The real risks live AROUND the tests: the rate-limit layer has no test at all (the only
load-bearing security layer with zero gate), GitHub Free + private repo means **no branch
protection — every "required" gate is convention-only**, and two doc/config claims about
lint severity are false. No P0/P1. After owner triage, **all 4 P2s were resolved in-round**
(limiter wiring test, merge-discipline codified, exhaustive-deps fixed+promoted, booking e2e) on
top of 4 cheap P3 fixes; QA-017/019/020/022 carried to backlog. One real user-facing bug fell out
of QA-013: the attendance drawer's unsaved-changes guard was dead (stale closure) — now fixed.

## Suite-health evidence (checklist C)

| Observation | Result |
|---|---|
| Run 1 (plain) | 854/854, 87 suites, 338s, exit 0 |
| Run 2 (plain) | 854/854, 322s, exit 0 — no flakes |
| Run 3 (coverage) | 854/854, 306s, exit 0 — **noise GONE from-scratch** (QA-014 fix verified) |
| `--detectOpenHandles` | reports nothing in any run |
| Teardown noise | 2× `ReferenceError: import after teardown` (csrfProtection.test.js, cronAuth.test.js) — reproduced locally AND in CI (job 80838895060) → root-caused + FIXED (QA-014) |
| SIGINT→SIGKILL on exit | **Windows-local only** (mongod ignores emulated SIGINT; mongodb-memory-server kills after 10s). CI (Linux) log shows clean stop. Not a defect; documented here |
| Runtime budget | CI 8m05s–8m29s vs 15-min timeout; phase threshold for sharding is >12m → YAGNI holds. Heap fix (4GB NODE_OPTIONS) still required |

## Findings

### QA-011 · P2 · Rate-limit layer has ZERO test coverage (invariant hole)
- **Evidence:** every limiter in `server/middleware/rateLimiters.js` carries `skip: skipInTest` /
  `IS_TEST` (by design, lines 25–33). Grep across `server/tests/**` for `429|imiter` → **0 matches**.
- **Impact:** the only mandatory security layer (CLAUDE.md golden rules) with no failing test if
  someone unmounts `loginLimiter` from the login route, drops `bookingLimiter`, or breaks a
  keyGenerator (regression precedent: BUG #16 export-limiter key bug shipped silently).
- **Fix (owner: ship this round):** new `server/tests/unit/rateLimiterWiring.test.js` —
  `jest.mock('express-rate-limit')` tags every limiter middleware with its config; the suite walks
  the real routers' stacks and asserts 18 security-critical routes still carry the expected
  `{windowMs,max}` budget (login, change-password, mfa verify ×2 limiters, forgot/reset, book-slot
  legacy+learning, waitlist join/leave, attendance, import ×3, export ×2, sync, cron reconcile +
  global-limiter configs), plus keyGenerator unit tests (loginLimiter `ip|empCode`,
  mfaVerifyLimiter cookie-decode + fallbacks, exportLimiter user-id — the BUG #16 class).
  **21 tests, all passing.** Unmounting a limiter or changing a budget now fails CI.
- **Status:** ✅ fixed (owner triage 2026-06-11: build now).

### QA-012 · P2 · Branch protection NOT AVAILABLE — "7 required gates" are convention-only
- **Evidence:** `gh api repos/.../branches/main/protection` → 403 "Upgrade to GitHub Pro or make
  this repository public". Repo is private on Free plan.
- **Impact:** nothing stops merging a red PR or pushing straight to main. `testing-and-ci.md`
  ("CI gates — ALL required to merge") and agent rules assume an enforcement that does not exist.
  Today's discipline (check `gh pr checks` before merge) is the only guard — incl. for agents.
- **Fix (owner: codify discipline):** `.claude/rules/testing-and-ci.md` gains a "Merge discipline"
  section: gates are procedural, never `gh pr merge` until `gh pr checks` is all green, never push
  to main directly. GitHub Pro upgrade declined for now.
- **Status:** ✅ fixed-as-decided (owner triage 2026-06-11: codify, no Pro).

### QA-013 · P2 · `react-hooks/exhaustive-deps` falsely documented as hard-blocking error
- **Evidence:** `testing-and-ci.md` + `client/eslint.config.js` header (line 40) both claim
  exhaustive-deps is a hard error ("no ratchet"). Reality: plugin-recommended severity is **warn**;
  config never overrides it; lint JSON shows **8 live warnings** riding the ratchet:
  `SchedulesPage.jsx:72` (×5), `AttendancePage.jsx:179`, `ClassDetailPage.jsx:448`, `TeamsPage.jsx:604`.
- **Impact:** stale-closure bugs (the exact class the doc says "always blocks") can land today; the
  docs promise a gate that is not armed.
- **Fix (owner: full fix):** all 8 sites fixed — SchedulesPage + ClassDetailPage: `schedData?.data
  || []` wrapped in `useMemo` (also kills 5 every-render recomputes of downstream memos);
  TeamsPage: module-level `teamStatus` removed from deps; **AttendancePage: real stale-closure BUG
  — `handleSelectSchedule` captured an old `requestClose` (isDirty=false), so toggle-clicking a
  cell with unsaved attendance edits closed the drawer WITHOUT the confirm guard** → `requestClose`
  added to deps. Then `'react-hooks/exhaustive-deps': 'error'` set in eslint.config.js (the doc
  claim is now true) and the ratchet cap lowered 71 → **63**. Client suite 247/247 green after.
- **Status:** ✅ fixed (owner triage 2026-06-11: fix sites + promote, not docs-only).

### QA-014 · P3 · Post-teardown mongoose-save noise from 2 unit suites — **FIXED in-round**
- **Evidence:** every full run (local + CI) printed 2× `ReferenceError: You are trying to import a
  file after the Jest environment has been torn down` from `tests/unit/csrfProtection.test.js` +
  `tests/unit/cronAuth.test.js`. Stack: `mongoose $getAllSubdocs → saveSubdocsPreSave` — both
  middlewares audit failures fire-and-forget (`auditService.record` → `AuditLog.save()`), the write
  outlives the unit test.
- **Fix:** `jest.mock('../../services/auditService')` in both files (the real audit rows are
  asserted in `tests/integration/auditWriteSide.test.js` — no coverage lost). Noise gone in run 2/3.
- **Residual:** `--forceExit` kept (drop-probe = follow-up; detectOpenHandles is clean so it is
  likely droppable, but a hang would burn the 15-min CI timeout to find out).
- **Status:** ✅ fixed.

### QA-015 · P3 · ESLint ratchet at exact cap, zero headroom — categorized; **cap 72 → 71 in-round**
- **Evidence:** 72 warnings = cap 72 before this round. Breakdown: **47 jsx-a11y** (19
  label-has-associated-control ⊃ backlog UX-08, 11 click-events-have-key-events, 10
  no-static-element-interactions, 5 no-autofocus, 2 no-noninteractive-element-interactions),
  **16 react-compiler v7** (static-components 4, incompatible-library 3, set-state-in-effect 3,
  purity 3, immutability 3), **8 exhaustive-deps** (→ QA-013), **1 stale eslint-disable**
  (SearchPalette.jsx:185 — eslint itself reports it unused). Top files: SchedulesPage 10,
  EvaluationPage 9, DatabaseExplorer 8, TeamsPage 8, BookClassPage 7 (legacy-est pages).
- **Fix landed:** removed the stale directive → 71 warnings; cap lowered to 71 (`client/package.json`).
  Burn-down note: fixing backlog UX-08 (LearningField label association) would clear up to 19 more.
- **Status:** ✅ partial fix; burn-down continues via UX-08 + QA-013.

### QA-016 · P3 · `coverage/` output linted by eslint — **FIXED in-round**
- **Evidence:** running `vitest --coverage` then `eslint .` lints `coverage/lcov-report/*.js`
  (generated code; produced 1 phantom warning). Git side was already safe (root `.gitignore`
  has a bare `coverage` pattern matching all levels).
- **Fix:** `coverage` added to `eslint.config.js` globalIgnores (+ explicit entry in
  `client/.gitignore` for locality, same pattern as the existing redundant `dist`).
- **Status:** ✅ fixed.

### QA-017 · P3 · Client coverage thresholds exist but gate nothing — and currently FAIL
- **Evidence:** `vite.config.js` sets `thresholds: {lines:60, functions:60, branches:60}` but CI
  runs `test:run` (no coverage). Local `test:coverage` exits 1: **functions 55.95% < 60** (lines
  70.05 ✓, branches 60.41 ✓).
- **Impact:** thresholds are dead policy — failing today without anyone noticing; first person to
  run `test:coverage` hits a red that CI never sees.
- **Fix sketch:** owner pick: (a) drop functions threshold to 55 (honest floor, ratchet up like
  lint), (b) write the missing tests (biggest gaps below), (c) delete thresholds. Optionally make
  a non-required CI job run coverage weekly.
- **Status:** open — owner triage.

### QA-018 · P2 · Zero E2E coverage for the persona-critical P1 flows
- **Evidence:** 5 Playwright suites (auth-basic, permissions, navigation, theme, users-crud).
  Phase-03's P1 flows with NO e2e: **leader booking grid** (core business loop), **MFA login**,
  **waitlist join**, **attendance mark**, **export download**. Seed/fixture drift: none found
  (fixtures match `seed.js` users; MFA-off precondition documented; CI clears mustChangePassword).
- **Impact:** the flows that pay the product's rent regress silently at the UI layer; phase-03
  found exactly such a break (FLOW-001 teacher picker) that unit tests missed.
- **Fix (owner: booking spec now):** new `client/e2e/booking.spec.js` — leader logs in via real UI,
  opens `/book`, jumps 2 weeks ahead (clear of the weekly cap + the 24h cancel-cutoff), books a
  free slot, asserts the cell flips to "Mine", then cancels it (also restores DB state for
  persistent-dev reruns) + a legend smoke test. **2/2 passing locally against the real seeded dev
  server.** Remaining specs → backlog in priority order: attendance mark > export download > MFA
  login (speakeasy-generated codes) > waitlist join (needs full-capacity fixture).
- **Status:** ✅ first spec shipped; rest backlog (owner triage 2026-06-11).

### QA-019 · P3 · gitleaks allowlist excludes whole trees — false-negative surface
- **Evidence:** `.gitleaks.toml` allowlists ALL of `server/tests/.*`, `client/e2e/.*`,
  `.github/workflows/.*\.yml$`, `docs/audit/.*\.md$` (paths), plus regexes for seed passwords.
- **Impact:** a REAL credential pasted into a test, workflow, or audit doc is invisible to the
  gate (the planned dynamic spot-check confirms by construction — a secret planted in
  `server/tests/` cannot be caught). gitleaks not installed locally; dynamic CI check skipped.
- **Fix sketch:** narrow paths → regex/stopword allowlist for the known fixture password patterns
  (`*12345`, `bound-a-pwd-*`, `e2e-*-not-used-anywhere-real`); keep node_modules path. Verify by
  planting a canary AWS-style key in a scratch branch PR (expect red) — optional owner-run.
- **Status:** open — owner triage.

### QA-020 · P3 · CI re-downloads the mongod binary every server-tests run
- **Evidence:** `ci.yml` server-tests caches only npm (`cache: 'npm'`); mongodb-memory-server
  (^11.1.0) downloads its mongod binary per cold run (~70–100 MB; part of the 8m runtime).
- **Fix sketch:** set `MONGOMS_DOWNLOAD_DIR: ~/.cache/mongodb-binaries` + `actions/cache` keyed on
  the mongodb-memory-server version (or pin `MONGOMS_VERSION`). Saves ~30–60s/run + flakiness on
  registry hiccups.
- **Status:** open — cheap, can ride any CI PR.

### QA-022 · P3 · Legacy-controller coverage holes (server)
- **Evidence:** per-file table below ("Server" section): syncController 10.9%, dashboard-stats
  12.4%, class-mutations 17.3%, calendarService 21.8%, importController 38%, auth-mfa 52.3% —
  all legacy layer; every `domains/*` module is ≥60% except groups/queries (58%).
- **Impact:** the under-tested files are mutation/security surfaces (class CRUD with
  audit+soft-delete; MFA controller — the SEC-018 bug class; bulk import). Regressions there
  ride on manual testing only.
- **Fix sketch:** policy "extend tests when touched" + 2 targeted suites first:
  `class-mutations` (create/update/archive happy + denial + audit row) and `auth-mfa`
  (enroll/verify/disable + lockout paths). Sync/calendar = mock-google harness, lower priority.
- **Status:** open — owner triage.

### QA-021 · P3 · GitHub Actions Node-20 deprecation hits in 5 days — **FIXED in-round**
- **Evidence:** CI job log warning: "Node.js 20 actions are deprecated… **forced to run with
  Node.js 24 by default starting June 16th, 2026**" naming `actions/checkout@v4` +
  `actions/setup-node@v4`.
- **Fix:** bumped all `actions/checkout` v4→v5 and `actions/setup-node` v4→v5 in `ci.yml`
  (v5 lines are the Node-24 runtime releases). `supercharge/mongodb-github-action@1.11.0` +
  `gitleaks/gitleaks-action@v2` not flagged by the runner — left as-is, watch next runs.
- **Status:** ✅ fixed (validated by this PR's own CI run).

## Coverage truth (checklist A)

### Client (vitest --coverage, v8): 67.85% stmts / 60.41% branch / 55.95% funcs / 70.05% lines
Logic-heavy files under ~50% lines:

| File | Lines | Note |
|---|---|---|
| `src/lib/schedule-conflicts.js` | 0/8 (0%) | pure fn, trivially testable |
| `src/hooks/queryKeys.js` | 2/47 (4%) | key factory — low test value, exercised transitively |
| `src/features/learning/PathFormModal.jsx` | 2/43 (5%) | PathsTab tests mock the modal out |
| `src/hooks/useUsers.js` | 9/51 (18%) | real hook logic untested |
| `src/api/api.js` | 45/195 (23%) | **axios interceptors (CSRF attach, 401/403 refresh) = load-bearing, barely covered** |
| `src/features/attendance/AttendancePage.jsx` | 54/132 (41%) | P1 flow page |
| `src/features/schedule/*` | ~53% feature | booking grid — P1 flow, also top lint offender |

### Server (jest --coverage): 81.22% stmts / 63.41% branch / 83.42% funcs / 83.53% lines
`domains/*` modules are healthy (migration paid off test-wise; only `domains/groups/queries.js`
58% dips under 60). The holes are LEGACY controllers + external-API services (→ QA-022):

| File | Lines | Note |
|---|---|---|
| `controllers/syncController.js` | 10.9% (110) | Google-Sheets sync — mutates users/classes |
| `controllers/dashboard/dashboard-stats.js` | 12.4% (89) | aggregate-heavy (ties to backlog DATA-017?) |
| `controllers/class/class-mutations.js` | 17.3% (81) | **class CRUD mutations — audit/soft-delete path** |
| `services/calendarService.js` | 21.8% (55) | Google Calendar fail-soft branches |
| `services/export/evaluation-workbook.js` | 22.7% (22) | exceljs workbook |
| `config/db.js` | 35.1% (37) | connection retry/backoff branches |
| `controllers/importController.js` | 38.0% (50) | bulk import (DATA-013 guards partially covered) |
| `controllers/reconcileController.js` | 45.2% (31) | |
| `controllers/auth/auth-mfa.js` | 52.3% (65) | **MFA controller — SEC-018 class of bug lives here** |
| `server.js` | 57.0% (158) | boot wiring, partially via supertest |

### Error-path coverage (A3)
Adequate by prior-round evidence: SEC-014 round added CastError→400 regression tests (5);
zod 400-path tests exist across route suites; permission-denial tests standard per domain
(phase-01 verified). No new hole found this round.

## In-round fixes summary (this PR — `fix/audit-qa-round-6`)

| Fix | Files |
|---|---|
| QA-011 limiter wiring-inventory test (21 tests) | `server/tests/unit/rateLimiterWiring.test.js` (new) |
| QA-012 merge-discipline codified | `.claude/rules/testing-and-ci.md` |
| QA-013 8 deps sites + promote to error + cap 71→63 | `SchedulesPage.jsx`, `AttendancePage.jsx` (real dirty-guard bug), `ClassDetailPage.jsx`, `TeamsPage.jsx`, `client/eslint.config.js`, `client/package.json`, `.claude/rules/testing-and-ci.md` |
| QA-014 audit-save teardown noise | `server/tests/unit/cronAuth.test.js`, `server/tests/unit/csrfProtection.test.js` (jest.mock auditService) |
| QA-015 stale directive + ratchet 72→71 (then 63 via QA-013) | `client/src/components/SearchPalette.jsx`, `client/package.json` |
| QA-016 eslint ignores coverage/ | `client/eslint.config.js`, `client/.gitignore` |
| QA-018 booking-grid e2e spec (2 tests, local-verified) | `client/e2e/booking.spec.js` (new) |
| QA-021 actions v5 bump | `.github/workflows/ci.yml` |

Gates at ship time: server suite incl. new wiring test green; client 247/247; lint 63/63 (0 errors);
vite build clean; booking e2e 2/2 against live dev server.

## Owner triage outcomes (2026-06-11)

1. QA-012 → **codify discipline** (no GitHub Pro) — done.
2. QA-013 → **fix all 8 sites + promote to error** — done.
3. QA-011 → **wiring test this round** — done.
4. QA-018 → **booking spec this round**, rest backlog (attendance > export > MFA > waitlist).

## Unresolved questions (→ backlog, defaults applied)

1. QA-017: functions coverage threshold fails (55.95 < 60) and nothing runs it in CI — backlog;
   suggested default: lower to 55 + ratchet up, or wire a non-required weekly coverage job.
2. QA-019: gitleaks whole-tree allowlist — backlog; tighten to fixture-pattern regexes when touched.
3. QA-020: CI mongod binary cache — backlog; ride the next CI-touching PR.
4. QA-022: legacy-controller coverage holes — test-when-touched policy; class-mutations + auth-mfa
   first if a dedicated round is ever cut.
