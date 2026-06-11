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
| 2 | Data integrity & audit trail | phase-02-data-integrity-and-audit-trail.md | highest | L | ⬜ |
| 3 | Business flows & UX wiring | phase-03-business-flows-and-ux.md | high | M | ⬜ |
| 4 | Performance & scale | phase-04-performance-and-scale.md | med | M | ⬜ |
| 5 | Reliability & operations | phase-05-reliability-and-operations.md | med | M | ⬜ |
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
| _none yet_ | | | | |

## Round log

| Date | Phase | Report | Findings (P0/P1/P2/P3) | PRs |
|------|-------|--------|------------------------|-----|
| 2026-06-11 | 01 Security & AuthZ | `plans/reports/audit-security-260611-1302-findings.md` | 0/0/1/3 — SEC-014 fixed (CastError→400 + zod params + 5 tests); SEC-015/016 accepted+annotated; SEC-017 comments fixed. Core layers verified clean (22 routers, self-scoping, cookies, redaction, audit/gitleaks/.env) | fix/audit-sec-round-1 |
