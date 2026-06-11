# Full System Audit — Master Plan

**Created:** 2026-06-11 · **Status:** structure ready, no round started
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
| 6 | Tests & CI health | phase-06-tests-and-ci.md | med | S | ⬜ |
| 7 | Code architecture & debt | phase-07-code-architecture-and-debt.md | low | M | ⬜ |
| 8 | Docs & spec truth | phase-08-docs-and-spec-truth.md | low | S | ⬜ |

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
| UX-08 | P2 | 03 | `LearningField` (+ feedback/eval selects) labels not associated with inputs — unlabeled controls for screen readers across Learning CRUD + feedback modals (WCAG 1.3.1/4.1.2). Fix: `useId()` + `htmlFor`/`cloneElement` in `LearningField` | Owner 2026-06-11: backlog |
| UX-09 | P3 | 03 | Home dashboard error boundary ("Something went wrong") renders behind the forced-password modal on first login (dashboard queries 403 on the mustChangePassword gate). Fix: gate dashboard `enabled:` on `!mustChangePassword`, or route the 403 to the change-pw flow | Owner 2026-06-11: backlog |
| PERF-015 | P3 | 04 | `findPrograms`/`findCohorts`/`getClasses` return ALL rows (no skip/limit) — cohorts grow ~1/delivery. Fix: add `paginationQuery` + skip/limit to these lists + client hooks, or a hard cap | Owner 2026-06-11: backlog |
| PERF-016 | P3 | 04 | `populateSessionQuery` hydrates full `enrolledUsers` on the session LIST path (list rows only need the count). Fix: trim list populate to a count/`_id`, keep full populate on `findSessionById` | Owner 2026-06-11: backlog |
| DATA-017? | P2 | 04→data | Dashboard `User.aggregate` calls don't `$match isDeleted` (aggregate bypasses soft-delete hooks) → trashed participants counted in stats. Data-accuracy, not perf — triage in a DATA round | Found 2026-06-11 (PERF round); needs-triage |
| OPS-010 | P2 | 05 | Sentry cron missed-run detection not armed for pinger-driven runs — CRON_JOBS entries carry no `schedule`, external check-ins create schedule-less monitors. Fix: add crontab to CRON_JOBS (reconcile `0 2 * * *`, attendance `0 * * * *`, assignment `0 1 * * *` per owner) + pass through cronRoutes | Owner 2026-06-11: backlog |
| OPS-011 | P2 | 05 | envValidator misses README-required `CORS_ORIGINS`/`CLIENT_ORIGIN` (prod boots → runtime write-outage / localhost reset links); README §6.4 misses boot-required `IMPORT_DEFAULT_PASSWORD` | Owner 2026-06-11: backlog |
| OPS-012 | P3 | 05 | cron `?token=` leaks into pino `req.url` + 730-day audit notes (redact is key-based, can't mask URL substrings). Fix: redact token query param at cronAuth log/audit sites (owner picked redact over dropping query support) | Owner 2026-06-11: backlog |
| OPS-013 | P2 | 05 | `backup-dr.md` §4.1 DR env table drifted: lists nonexistent `REFRESH_SECRET`/`MFA_ENCRYPTION_KEY`, omits boot-required `IMPORT_DEFAULT_PASSWORD` → rebuild-from-runbook boot-loops mid-incident | Owner 2026-06-11: backlog |
| OPS-014 | P3 | PR#40 close-out | `auth-password-reset.js` forgot-password background DB failures (lookup / token-persist / rollback save) log at `warn` — promote to `error` so ops alerting sees silent reset-flow corruption; email-send fail stays `warn` (retry-able) | 2026-06-11: backlog (residual from superseded PR #40) |
| BUG-005 | P3 | PR#40 close-out | `UsersPage` default `sortBy=lastActive` but server `SORTABLE` whitelist (`controllers/user/user-queries.js`) lacks it → default Users sort silently falls back to `empCode`. Fix: whitelist + map sort to denormalised `lastActiveAt` | 2026-06-11: backlog (residual from superseded PR #40) |

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
