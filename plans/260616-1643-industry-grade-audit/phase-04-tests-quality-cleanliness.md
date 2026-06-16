# Phase 04 — Tests, Gates & Code Cleanliness

**Priority:** P1 (owner-prioritized) · **Status:** 🔴 todo
**Anchor:** real coverage (not pass/fail) · flakiness · complexity · duplication · debt

## Objective
Prove the test suite actually protects the critical paths (not just "green"),
the gates are honest, and the codebase is clean enough that change-risk is low.

## Industry checks (each → evidence)
- **Real coverage, critical-path-weighted.** From phase-00 coverage: identify
  modules where a bug would be expensive (authz/policy, finance/budget money math,
  booking transactions, completion/certificate engine, audit chain) that sit below
  ~80% line/branch. Coverage gaps on money/security/transactions = P1.
- **Test honesty.** No `.skip`/`xit`/`it.only`, no weakened assertions, no
  mock-as-shortcut faking a real path. Each gate-critical feature has happy +
  permission-denied + one edge per the repo's own quality bar.
- **Flakiness.** The e2e `mustChangePassword` seed gate (found this session) +
  client modal/user-event timeouts under load. Make e2e deterministic
  (seed/fixture handles force-change; stable timeouts). Confirm CI e2e is truly green.
- **Lint debt burndown.** The 63 warnings grouped by rule (phase-00). Fix the
  mechanical ones (a11y label/handler, effect setState) to ratchet the cap DOWN.
- **Complexity hotspots.** Functions with high cyclomatic complexity / deep
  nesting (eslint complexity, or LOC heuristic) → refactor candidates.
- **Duplication.** jscpd blocks (phase-00) → DRY candidates (esp. cross-domain
  controller/use-case boilerplate).
- **Dead code.** knip unused exports/files/deps (phase-00) → remove (carefully —
  keep public surface + entrypoints).
- **God objects / file-size debt.** >300 LOC files: extract toward `domains/`
  per the repo rule; sanctioned-legacy noted (scheduleService etc.).
- **Consistency.** Response envelope uniform; i18n — no hard-coded user-facing
  strings in new UI (ComplianceMatrixPage, StudioSchedulingPage flagged); naming
  conventions; TODO/FIXME inventory; error handling via `handleError`.
- **Dependency hygiene.** npm audit moderate vulns (OpenTelemetry/uuid transitive)
  remediation path; lockfile↔package.json sync; unused deps (knip).

## Method (multi-agent workflow)
A coverage-gap agent (consumes phase-00 coverage), a test-honesty agent
(grep skip/only + assertion-quality read), a cleanliness agent (complexity/dup/
dead-code/file-size), an i18n+consistency agent. Adversarial pass confirms a
"low coverage" path is genuinely critical (not trivial).

## Success criteria
- Coverage-gap list (critical-path, severity-rated) + a test-add plan.
- Flaky-e2e root cause fixed (deterministic). Lint burndown target set + cap
  lowered. Dead-code/dup/complexity inventory with remove/refactor calls.

## Todo
- [ ] critical-path coverage-gap list
- [ ] test-honesty scan (skip/only/weak assertions)
- [ ] e2e flakiness fix (mustChangePassword + timeouts) + confirm CI green
- [ ] lint-by-rule burndown + lower cap
- [ ] complexity hotspots
- [ ] duplication (jscpd) DRY candidates
- [ ] dead-code (knip) removal list
- [ ] file-size/god-object extraction calls
- [ ] i18n + envelope + naming consistency
- [ ] dependency vuln + lockfile hygiene
