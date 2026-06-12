# Full System Audit — Master Plan

**Created:** 2026-06-11 · **Status:** ALL 8 ROUNDS COMPLETE (2026-06-12)
**System:** TMS v2 / internal LTMS (~1000 employees) — MERN monorepo, compliance-first.

## Goal
Audit the WHOLE system area-by-area: confirm the load-bearing layers actually hold
(security, data integrity, audit trail), every shipped flow completes end-to-end,
and the engine room (perf, ops, tests, docs) matches what we believe. Output =
triaged findings → fix PRs, not a paper exercise.

## Method (per round)
1 phase = 1 audit round, run inline (no subagents). Per round:
1. Work the phase checklist; collect evidence (`file:line`, repro, query output).
2. Write findings report → `plans/reports/audit-{phase}-{yymmdd-hhmm}-{slug}.md`.
3. Owner triage (AskUserQuestion): confirm severity, pick what ships now.
4. Fix P0/P1 in the same round (branch → tests → PR → CI → merge on approval);
   P2/P3 → Backlog table below.
5. Every fix lands WITH a regression test. Tracker + roadmap changelog updated.
6. **Docs ride along:** any doc/rule a finding proves stale — incl. the
   agent-facing `.claude/rules/*` and `docs/current-system-map.md` that steer
   every future edit session — is corrected in the SAME round, not parked for
   phase 08. Phase 08 stays the deep pass; rounds keep docs from rotting
   between now and then.

## Conventions
- **Finding ID:** `{AREA}-{NNN}` (3-digit), CONTINUING the existing series in code
  comments (SEC-013, DATA-011, PERF-010, OPS-007, UX-03, QA-001, CODE-007 seen).
  Before assigning: `grep -o "{AREA}-[0-9]+"` to find the current max.
- **Severity:** P0 exploitable/data-loss now · P1 wrong behavior users hit ·
  P2 latent risk/debt · P3 cosmetic/nice-to-have.
- **Finding format:** ID · severity · evidence · impact · fix sketch · status.
- **No gate weakening:** a finding is never "fixed" by skipping a test or
  loosening a security layer.

## Phases (recommended order = risk first)

| # | Phase | File | Risk | Effort | Status |
|---|-------|------|------|--------|--------|
| 1 | Security & AuthZ (+PII) | phase-01-security-and-authz.md | highest | L | ✅ 2026-06-11 |
| 2 | Data integrity & audit trail | phase-02-data-integrity-and-audit-trail.md | highest | L | ✅ 2026-06-11 |
| 3 | Business flows & UX wiring | phase-03-business-flows-and-ux.md | high | M | ✅ 2026-06-11 |
| 4 | Performance & scale | phase-04-performance-and-scale.md | med | M | ✅ 2026-06-11 |
| 5 | Reliability & operations | phase-05-reliability-and-operations.md | med | M | ✅ 2026-06-11 |
| 6 | Tests & CI health | phase-06-tests-and-ci.md | med | S | ✅ 2026-06-11 |
| 7 | Code architecture & debt | phase-07-code-architecture-and-debt.md | low | M | ✅ 2026-06-12 |
| 8 | Docs & spec truth | phase-08-docs-and-spec-truth.md | low | S | ✅ 2026-06-12 |

Effort: S ≈ half session · M ≈ 1 session · L ≈ 1–2 sessions (fixes included).
Phases 1–2 first (they guard the product's core promise: compliance/audit).
3 next (catches "shipped but unusable" gaps like the trainer-only visibility one).
4–8 are engine-room — order flexible.

## Definition of Done (whole audit)
- ☑ All 8 phase reports written, findings triaged with owner
- ☑ All P0/P1 fixed + regression-tested + merged
- ☑ P2/P3 captured in Backlog with owner decision (fix later / wontfix)
- ☑ Tracker, roadmap changelog, affected specs updated

## Backlog (P2/P3 carried between rounds)

| ID | Sev | Phase | One-liner | Decision |
|----|-----|-------|-----------|----------|
| DATA-016 | P3 | 02 | No reconcile check for stale `waiting` waitlist rows on past sessions — add check #12 (flag or auto-expire) | Owner 2026-06-11: backlog |
| UX-08 | P2 | 03 | `LearningField` labels not associated with inputs (WCAG 1.3.1/4.1.2) | **FIXED 2026-06-12** (backlog sweep): `useId()` + `htmlFor` + `cloneElement` in `LearningField` (explicit child id wins); 4 component tests |
| UX-09 | P3 | 03 | Dashboard error boundary behind the forced-password modal (queries 403 on mustChangePassword gate) | **FIXED 2026-06-12** (backlog sweep): `DashboardPage` returns null + disables queries while `mustChangePassword`; 3 component tests |
| PERF-015 | P3 | 04 | `findPrograms`/`findCohorts`/`getClasses` returned ALL rows | **FIXED 2026-06-12** (backlog sweep): opt-in `?page/?limit` + hard cap 500 on all 3 lists, envelope unchanged; window test |
| PERF-016 | P3 | 04 | Session LIST hydrated full `enrolledUsers` | **FIXED 2026-06-12** (backlog sweep): list populate trimmed to `_id` (count + viewer-membership intact), detail keeps full roster; list-vs-detail test |
| DATA-017? | P2 | 04→data | ~~Dashboard `User.aggregate` skips isDeleted~~ — **CLOSED-OBSOLETE** (owner 2026-06-12, round 8): `User.js:269` pre('aggregate') hook injects the `isDeleted` filter (landed with DATA-012); claim no longer reproduces | Closed 2026-06-12 |
| OPS-010 | P2 | 05 | Sentry cron missed-run detection not armed for pinger-driven runs — CRON_JOBS entries carry no `schedule`, external check-ins create schedule-less monitors. Fix: add crontab to CRON_JOBS (reconcile `0 2 * * *`, attendance `0 * * * *`, assignment `0 1 * * *` per owner) + pass through cronRoutes | Owner 2026-06-11: backlog |
| OPS-011 | P2 | 05 | envValidator misses README-required `CORS_ORIGINS`/`CLIENT_ORIGIN` (prod boots → runtime write-outage / localhost reset links); README §6.4 misses boot-required `IMPORT_DEFAULT_PASSWORD` | Owner 2026-06-11: backlog |
| OPS-012 | P3 | 05 | cron `?token=` leaks into pino `req.url` + 730-day audit notes (redact is key-based, can't mask URL substrings). Fix: redact token query param at cronAuth log/audit sites (owner picked redact over dropping query support) | Owner 2026-06-11: backlog |
| OPS-013 | P2 | 05 | `backup-dr.md` §4.1 DR env table drifted: lists nonexistent `REFRESH_SECRET`/`MFA_ENCRYPTION_KEY`, omits boot-required `IMPORT_DEFAULT_PASSWORD` | **FIXED in round 8** (DOCS-011 — table corrected) |
| OPS-014 | P3 | PR#40 close-out | Forgot-password background DB failures logged at `warn` | **FIXED 2026-06-12** (backlog sweep): outer catch promoted to `error` (email-send fail stays `warn`); log-level regression test |
| BUG-005 | P3 | PR#40 close-out | Users default sort `lastActive` silently fell back to `empCode` (missing from `SORTABLE`) | **FIXED 2026-06-12** (backlog sweep): whitelisted + mapped to denormalised `lastActiveAt` (+`_id` tiebreaker); order-discriminating test |
| QA-017 | P3 | 06 | Client coverage thresholds (60/60/60 in vite.config.js) gate nothing (CI runs `test:run`) and functions currently FAILS (55.95%) — lower to 55 + ratchet, or wire a non-required weekly coverage job | Owner 2026-06-11: backlog |
| QA-019 | P3 | 06 | gitleaks allowlist excludes whole trees (`server/tests/`, `client/e2e/`, `.github/workflows/`, `docs/audit/`) — real secret pasted there is invisible to the gate. Tighten to fixture-pattern regexes | Owner 2026-06-11: backlog |
| QA-020 | P3 | 06 | CI server-tests re-downloads the mongod binary every run (no mongodb-memory-server cache). Fix: `MONGOMS_DOWNLOAD_DIR` + actions/cache keyed on mms version — ride the next CI-touching PR | Owner 2026-06-11: backlog |
| QA-022 | P3 | 06 | Legacy-controller coverage holes (syncController 11%, dashboard-stats 12%, class-mutations 17%, calendarService 22%, importController 38%, auth-mfa 52% lines) — `domains/*` all healthy. Policy: test-when-touched; class-mutations + auth-mfa first if a round is cut | Owner 2026-06-11: backlog |
| QA-018b | P2 | 06 | Remaining persona-critical e2e specs after booking shipped | **FIXED 2026-06-12**: 4 specs shipped in owner order — attendance mark (teacher, past-session fixture via free-slot scan) + export download (serial, consumes the marked records) + MFA login (API enroll + local RFC-6238 TOTP through the UI challenge, admin-disable cleanup) + waitlist join/leave (inactive-member full-session fixture). Full e2e suite 28/28 |
| CODE-017 | P3 | 07 | 18/20 lazy requires (`controllers/auth/*` — User/mfaService/invalidateUserCache per handler) likely no longer dodge a real cycle after the modular split. Hoist opportunistically when touching those files; 2 legit cycles stay (completion repo, waitlist→scheduleService) | Owner 2026-06-12: backlog |
| DEPS | P3 | 07 | Pending majors, each its own post-audit task: express 4→5, mongoose 8→9 (after PostgreSQL gate decision), eslint 9→10 (ratchet re-baseline), bcryptjs/uuid/dotenv batch; googleapis 146→173 only with calendar retest | Owner 2026-06-12: backlog |
| DOCS-006b | P3 | 08 | Swagger coverage: only ~10 annotated ops; glob now includes `domains/**` (round 8) — annotate routes over time, starting with the learning/schedule surface | Owner 2026-06-12: backlog, annotate-when-touched |

_(SEC-018 was triaged here then **FIXED** in a separate security PR #54 — see Round log; no longer carried.)_

## Round log

| Date | Phase | Report | Findings (P0/P1/P2/P3) | PRs |
|------|-------|--------|------------------------|-----|
| 2026-06-11 | 01 Security & AuthZ | `plans/reports/audit-security-260611-1302-findings.md` | 0/0/1/3 — SEC-014 fixed (CastError→400 + zod params + 5 tests); SEC-015/016 accepted+annotated; SEC-017 comments fixed. Core layers verified clean (22 routers, self-scoping, cookies, redaction, audit/gitleaks/.env) | fix/audit-sec-round-1 (PR #51) |
| 2026-06-11 | 02 Data integrity & audit trail | `plans/reports/audit-data-260611-1321-findings.md` | 0/1/2/2 — DATA-014 fixed (Evaluation soft-delete + revive-on-upsert + hooks incl. aggregate); DATA-012 fixed (distinct hook ×6 models); DATA-013 fixed (import trash guards users+classes); DATA-015 dead fns removed; DATA-016 → backlog. Audit-trail layer verified clean (55 record sites, enum complete, tx coverage, reconcile map) | fix/audit-data-round-2 (PR #52, merged) |
| 2026-06-11 | 03 Business flows & UX | `plans/reports/audit-flows-260611-1357-findings.md` | 1/3/2 (+1 incidental SEC) — FLOW-001 fixed (teacher eval grading: new scoped `/api/evaluations/roster`, picker rewired); BUG-003 fixed (lean-virtuals no-op → enrolledCount + completion averageScore); BUG-004 fixed (booking "0 students" → members.length); UX-08/UX-09 → backlog; SEC-018 → fixed separately (PR #54). 11 new tests; all gates green. Auth/booking/learner/feedback loops verified clean live | fix/audit-flows-round-3 (PR #53, merged) |
| 2026-06-11 | 03→sec (incidental) | `plans/reports/audit-sec-260611-1430-mfa-replay-findings.md` | 0/1/0/0 — **SEC-018 fixed**: MFA replay guard compared the relative `verifyDelta` (always 0 for a current code) → TOTP login worked once then false-replay lockout (P0 if `MFA_REQUIRED_ROLES` set). Now compares/persists the ABSOLUTE TOTP step counter. +6 unit tests (incl. next-step regression); auth/MFA/password suites 53/53 | fix/audit-sec-round-3-mfa-replay (PR #54, merged) |
| 2026-06-11 | 04 Performance & scale | `plans/reports/audit-perf-260611-1637-findings.md` | 0/0/1/2 — **PERF-014 fixed**: session-order cache was invalidated on every READ (`learning/session/repository.js`) → guaranteed miss + extra `Schedule.find` per list/detail + cross-path thrash; removed read-path invalidation (writers already invalidate). +2 regression tests (cache survives a read) + test-infra cache flush. PERF-015/016 → backlog; DATA-017? (dashboard aggregate skips isDeleted) → needs-triage. Hot paths verified well-built (batched aggregations, real indexes, pool 20, no N+1). Dynamic load baselines deferred (shared-Atlas load-test unsafe). | perf/audit-phase-4 (PR #56, merged) |
| 2026-06-11 | 05 Reliability & operations | `plans/reports/audit-ops-260611-1722-findings.md` | 0/1/3/1 — **OPS-009 fixed** (P1): `verify-backup.js` loaded repo-root `.env` (doesn't exist; env lives in `server/.env`) → the documented monthly backup drill failed as written and had NEVER run (empty drill logs). Path fixed + `VERIFY_BACKUP_ENV_PATH` override + 3 spawn-based regression tests; **first real drill executed** (9/10 vs dev DB; prod run = owner). OPS-010/011/013 (P2) + OPS-012 (P3) → backlog with owner decisions. Ops layer otherwise verified clean: graceful shutdown, timing-safe cronAuth + heartbeat/staleness, SMTP/Google fail-soft everywhere, 22× `withTransaction`, Sentry 5xx-only + PII strip, request-id logging, substantive runbooks. Owner-verify items: Render/Atlas/cron-job.org dashboards, quarterly restore drill never run. | fix/audit-ops-round-5 (PR #57, merged) |
| 2026-06-12 | 07 Code architecture & debt | `plans/reports/audit-code-260612-0859-findings.md` | 0/0/0/4 — migration verified essentially landed (all major legacy controllers/services are 10–35-line facades; `pages/` = 4 sanctioned shells; 0 deep imports; 0 unused server deps; no silent legacy growth). **Shipped per owner triage:** CODE-014 `npm install`→`npm ci` everywhere (CI ×2 jobs + root Render build scripts — the googleapis-drift workaround no longer reproduces; dry-run proven) + Node-22 alignment (engines `>=20`, client CI 20→22); CODE-015 10 dead client deps removed (8 stray `@radix-ui/*` superseded by the umbrella, react-hot-toast, languagedetector) — client 247/247/build/lint-63 green after. **Closed-as-decided:** CODE-016 scheduleService re-sanctioned ~585 + use-cases ~400 with hard extract-on-growth rule; vocabulary table CLOSED (Team rename DROPPED, Evaluation→Assessment DEFERRED-when-touched, dual enrollment KEPT). CODE-017 lazy-requires + DEPS majors → backlog | fix/audit-code-round-7 |
| 2026-06-12 | 08 Docs & spec truth | `plans/reports/audit-docs-260612-0939-findings.md` | 0/0/5/7 — **DOCS-001 fixed** (users-and-roles spec described nonexistent auto-gen empCode/optional email — rewritten to admin-entered required both, 4 roles); **DOCS-002 fixed** (auth spec: 24h→JWT_EXPIRE, lockout 5→10, pre-SEC-018 replay mechanism); **DOCS-003 fixed AS CODE** (owner: prod session TTL intent = 24h → JWT_EXPIRE default '7d'→'1d' + render.yaml + 3 regression tests); **DOCS-004 fixed** (.claude/rules: 4 roles, capability layer live, policy-enforcement truth — capacity+completion ARE enforced, configurable slots, 7 domains, schedule own routes, counts); **DOCS-005 fixed** (cron-pinger runbook never armed attendance/assignment reminder pings — no internal fallback exists; 2 ping defs added); DOCS-006 glob extended + claims demoted (annotation → backlog DOCS-006b); DOCS-007/008 registry+spec metadata fixed; DOCS-009 README node 20 + §6.4 rows; DOCS-010 matrix /api/ready + system-map 3 missing rows; DOCS-011 = OPS-013 fixed; DOCS-012 scorecard synced. 2 audit scripts committed (route-diff: 141 routes vs matrix; env-diff: 44 reads vs §6.4). DATA-017? closed-obsolete (aggregate hook exists). Spot-verified clean: scheduling/enrollment/evaluations/capability-authz specs, runbooks, roadmap, AGENTS.md | fix/audit-docs-round-8 |
| 2026-06-11 | 06 Tests & CI health | `plans/reports/audit-qa-260611-2330-findings.md` | 0/0/4/8 — suite core healthy (854/854 ×3 runs, no flakes, no open handles; CI 8m vs 15m budget). **All 4 P2 fixed in-round per owner triage:** QA-011 limiter wiring-inventory test (21 tests — the only untested mandatory security layer); QA-012 branch protection unavailable (Free+private) → merge discipline codified in testing-and-ci.md; QA-013 exhaustive-deps was silently `warn` not the documented hard error → 8 sites fixed (incl. a REAL stale-closure bug: attendance drawer unsaved-changes guard dead) + promoted to `error` + ratchet 72→63; QA-018 zero e2e on P1 flows → booking-grid spec shipped (2/2 local vs live dev). P3 fixed: QA-014 teardown-noise root-caused (unit tests now mock auditService; SIGKILL = Windows-only artifact, CI clean); QA-015 stale directive; QA-016 coverage/ lint leak; QA-021 actions v4→v5 (Node-20 forced-24 deadline 06-16). Coverage truth: server 83.5% lines (legacy holes → QA-022), client 70% (api.js interceptors 23%). QA-017/019/020/022 + QA-018b → backlog | fix/audit-qa-round-6 |
