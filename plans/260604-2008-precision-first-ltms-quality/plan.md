# Precision-First LTMS Quality Plan

**Status:** active  
**Mode:** quality freeze for major features  
**Principle:** one session = one bounded question  
**Owner intent:** accuracy over quantity; P0/P1 before new major roadmap work

## Summary

This plan turns the broad LTMS quality audit into small, high-signal sessions.
Each session owns one journey or subsystem, gathers evidence, gives a verdict,
and either fixes a P0/P1 immediately or creates a focused follow-up plan.

## Operating Rules

- Do not mix journeys in one session.
- Do not chase side findings unless they are P0.
- Preserve auth, CSRF, rate limits, capability/role authz, audit log, soft delete, validation, and production observability.
- New reports and session artifacts stay under this plan folder or `plans/reports/`.
- Public APIs stay stable unless a focused fix plan explicitly approves change.

## Session Sequence

| # | Session | Status | Core Question |
|---|---|---|---|
| 01 | [Baseline Truth](sessions/01-baseline-truth.md) | completed | What is true now: docs, code, dirty tree, gates? |
| 02 | [Auth + Session Security](sessions/02-auth-session-security.md) | completed | Can sessions be created, protected, revoked, and audited safely? |
| 03 | [Role/Authz Matrix](sessions/03-role-authz-matrix.md) | completed | Do server policy and client permissions match for each role? |
| 04 | [People + Org](sessions/04-people-org.md) | completed | Does user/org management preserve data and manager scope? |
| 05 | [Learning Enrollment](sessions/05-learning-enrollment.md) | completed | Are enrollment, prerequisites, and paths truthful and consistent? |
| 06 | [Scheduling + Attendance](sessions/06-scheduling-attendance.md) | pending | Are booking and attendance safe under races and downstream reports? |
| 07 | [Assessment + Completion + Certificates](sessions/07-assessment-completion-certificates.md) | pending | Does completion truth match attempts, feedback, and certificates? |
| 08 | [Reports + Export](sessions/08-reports-export.md) | pending | Are reports/export rows correct, safe, and scoped? |
| 09 | [Cron + Reconcile + Observability](sessions/09-cron-reconcile-observability.md) | pending | Can operators know scheduled jobs and drift checks actually work? |
| 10 | [Release Gate](sessions/10-release-gate.md) | pending | Is there any open P0/P1 blocking feature work? |

## Required Session Output

Use [session-template.md](session-template.md) every time:
Goal, Scope, Evidence, Verdict, Action, Verification, Backlog, Unresolved.

## Gates

- Release gates: server Jest, client Vitest, client build, client lint, npm audit high+, gitleaks, Playwright e2e.
- Add regression tests only for verified risk.
- Full release gate requires zero open P0/P1.

## Current Notes

- Session 01 completed with repo/doc/worktree evidence and gate inventory.
- Session 02 completed; one P1 client/backend auth mismatch fixed, focused
  auth gates green, Playwright smoke deferred until seeded backend is available.
- Session 03 completed; one P1 Teacher calendar/server authz mismatch fixed,
  focused role/capability denial gates green.
- Session 04 completed; one P1 user soft-delete schedule-history corruption
  fixed, focused People/Org and downstream rollup gates green.
- No code implementation belongs in this plan until a session identifies a concrete P0/P1 or approved focused fix.
- Current dirty tree must be preserved; do not revert unrelated changes.
