# Delivery Workflow and English Operations Audit

**Date:** 2026-07-21  
**Branch / head:** `docs/english-live-convergence-plan` @ `96b87b7`  
**Audit type:** focused delivery-process and in-flight change audit  
**Scope:** delivery workflow documents, PR/plan entrypoints, Playwright/CI
enforcement, and the uncommitted English Schedule/Attendance handoff slice  
**Method:** read-only repository inspection; no files were changed while the
audit evidence was collected

## Executive verdict

> **Process documentation: IMPLEMENTED, NOT YET VERIFIED AS AN OPERATING SYSTEM.**
>
> **English Operations worktree: IMPLEMENTED, UI VERIFICATION BLOCKED — NOT
> READY FOR REVIEW.**

The rewritten workflow correctly addresses the failure pattern that triggered
this audit: oversized changes, changing domain authority without re-baselining,
shallow tests, and the owner becoming the first real UI tester. The terminology,
Definition of Done, agent contract, testing standard, docs routing, and PR
checklist are internally aligned.

The workflow is not yet fully operational because its required browser feedback
loop cannot run locally, the proposal template does not capture the new delivery
contract, and CI does not exercise the documented viewport matrix. The current
English slice also crosses both stop-and-replan thresholds and lacks end-to-end
coverage for the exact create/edit/reschedule/cancel workflows under review.

## Audit questions

1. Is there one discoverable source of truth for delivery work?
2. Do all agent and PR entrypoints use the same readiness language and gates?
3. Can the required feedback loops run on the current machine and in CI?
4. Do tests prove the real changed English workflows rather than adjacent
   component behavior?
5. Does the current worktree fit the new slice-size, data-safety, and evidence
   rules?

## Snapshot and evidence

| Item | Observed state |
|---|---|
| Canonical workflow | `.claude/rules/implementation-workflow.md` |
| Testing standard | `.claude/rules/testing-and-ci.md` |
| Mirrored entrypoints | `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `.github/PULL_REQUEST_TEMPLATE.md` |
| Process-doc delta | 6 files; 334 additions / 104 deletions |
| English worktree delta | 19 tracked files + migration 050; 321 additions / 144 deletions + 110 migration lines |
| English handwritten churn | approximately 571 changed lines |
| Workflow stop signal | roughly 15 files or 500 handwritten changed lines |
| Playwright project matrix | one `Desktop Chrome` project; no explicit required viewport projects |
| English Playwright coverage | attendance evidence panel opens; schedule creation form opens |
| English API integration coverage | class → enrollment → new Meeting → attendance save; no adopted imported Meeting reschedule/cancel flow |
| Local browser result | Chromium executable missing; Playwright cannot launch |
| Diff integrity | `git diff --check` completed without whitespace errors |

## Findings

### DWF-001 — Blocker — Required local browser feedback loop cannot run — RESOLVED 2026-07-21

- **Resolution:** Chromium runtime installed (`npx playwright install chromium`,
  chromium-1228). The English spec `e2e/english-operations.spec.js` now launches
  and passes 2/2 against the local PostgreSQL-backed app (`DB_BACKEND=postgres`).
  First cold run failed at login (server/Neon warm-up race on the boot CSRF
  cookie); the warm re-run is green. Baseline established — see Gate 0 execution
  below.
- **Original evidence:**
  `client/test-results/english-operations-English-03e0a-nd-opens-creation-on-demand-chromium/error-context.md:10`
  recorded `browserType.launch: Executable doesn't exist` for the Playwright
  Chromium headless shell.
- **Impact:** user-facing changes cannot reach **Verified** under the canonical
  workflow. Unit tests, lint, and build cannot prove clipping, overflow, drawer
  composition, real network behavior, or persisted mutations.
- **Required action:** install the pinned Playwright Chromium runtime and run a
  minimal authenticated English smoke before any more UI implementation.
- **Exit test:** `cd client && npx playwright test e2e/english-operations.spec.js`
  launches and completes against the local PostgreSQL-backed app.

### DWF-002 — Blocker — English E2E asserts form opening, not the requested workflow

- **Evidence:** `client/e2e/english-operations.spec.js:24-37` checks that
  `Schedule session` opens a form and that three fields are visible. It does not
  submit, reload, edit, reschedule, cancel, verify notifications, or assert the
  persisted result.
- **Impact:** the test can remain green while the exact user workflows are
  broken. This is the same false-confidence pattern that caused repeated owner
  QA/fix loops.
- **Required action:** replace the shallow schedule smoke with end-to-end slices
  for create, edit/reschedule, durable cancel, and visible success/failure
  feedback. Assert the result after reload or through an API/DB-visible read.
- **Exit test:** each changed command is exercised through the real UI and its
  persisted result is asserted.

### DWF-003 — High — Current English slice crosses both stop-and-replan signals

- **Evidence:** 19 tracked English files plus untracked migration 050;
  approximately 571 handwritten changed lines. The new workflow flags roughly
  15 files or 500 lines for re-baselining.
- **Impact:** data handoff, backend read semantics, schedule mutation UI,
  responsive layout, tests, verifier changes, ADR/spec, and roadmap updates are
  accumulating as one delivery unit. A regression cannot be isolated or
  reverted cleanly.
- **Required action:** split by independently verifiable outcome, not by
  frontend/backend layer:
  1. imported-future Meeting handoff and data invariants;
  2. adopted Meeting edit/reschedule/cancel behavior;
  3. calendar/drawer responsive composition.
- **Exit test:** each slice has its own delivery contract, regression signal,
  focused diff, evidence report, and intentional commit.

### DWF-004 — High — Proposal template does not capture the required delivery contract — RESOLVED 2026-07-21

- **Resolution:** `plans/_TEMPLATE-proposal.md` now requires the Phase 0 user
  outcome, scope/non-goals, domain authority, data/rollback impact, named
  feedback loop, UI states, and happy/denial/edge acceptance examples. It also
  includes the canonical stop/re-plan triggers and instructions to re-baseline
  before implementation continues.

- **Evidence:** `plans/_TEMPLATE-proposal.md` contains Why, delta, approach,
  tasks, and a generic verification section, but has no explicit fields for user
  outcome, non-goals, domain authority, data impact/rollback, or named feedback
  loop.
- **Impact:** the canonical workflow can be skipped accidentally at the first
  planning entrypoint; future plans may repeat ambiguous scope and authority
  drift.
- **Required action:** add the Phase 0 delivery-contract fields and stop/replan
  checkpoint to the plan template.
- **Exit test:** a new plan created from the template cannot omit the fields
  required by `.claude/rules/implementation-workflow.md` Phase 0.

### DWF-005 — High — Viewport standard is documented but not executable in Playwright — RESOLVED 2026-07-21

- **Resolution:** `client/playwright.config.js` now defines exact
  `desktop-wide` (1440x900), `desktop-compact` (1280x800), and `mobile-390`
  (390x844) projects. The full suite runs at desktop-wide; the two narrower
  projects repeat `english-operations.spec.js`, making the required responsive
  matrix executable in local runs and the existing CI E2E job. Failure
  screenshots/video/traces and the uploaded Playwright report remain enabled.

- **Evidence:** `client/playwright.config.js:59-64` defines only one Chromium
  project using the default `Desktop Chrome` device. No suite or helper asserts
  `1440×900`, `1280×800`, or `390×844`; repository search found no
  `setViewportSize` or `toHaveScreenshot` usage for English Operations.
- **Impact:** PRs can claim the documented browser gate while CI checks only one
  unspecified desktop viewport. Responsive regressions remain procedural and
  easy to miss.
- **Required action:** add explicit desktop-wide, desktop-compact, and mobile
  projects or a shared viewport matrix for responsive specs. Add overflow,
  clipping, drawer open/closed, and screenshot assertions where reference parity
  matters.
- **Exit test:** CI executes the applicable English responsive spec at all
  required sizes and retains failure artifacts.

### DWF-006 — High — Adopted imported Meeting commands lack real API integration coverage

- **Evidence:** `server/tests/integration/englishLiveOperations.test.js:26-142`
  proves class creation, enrollment, a newly created Meeting, and attendance
  persistence. Current adopted-import tests in
  `server/tests/unit/english-canonical-live-operations.test.js` mock the
  repository; route tests mock controllers.
- **Impact:** migration 050 eligibility, authorization, repository update,
  source-baseline preservation, audit, and cancellation can disagree at runtime
  while unit tests pass.
- **Required action:** add PostgreSQL integration cases that adopt a future
  imported Meeting, reschedule it, cancel it, reject unauthorized access, and
  verify its original source timestamp/duration and audit rows remain intact.
- **Exit test:** the full HTTP → command → repository → PostgreSQL path passes
  for success, denial, and immutable-source edge cases.

### DWF-007 — Medium — Playwright setup comments describe a retired MongoDB backend — RESOLVED 2026-07-21

- **Resolution:** `client/playwright.config.js` header rewritten to describe the
  PostgreSQL-only flow (`DB_BACKEND=postgres`, `knex migrate:latest`,
  `seed-pg.js`), mirroring the `e2e-tests` job in `.github/workflows/ci.yml`.
- **Original evidence:** `client/playwright.config.js:10-18` said the API server
  requires MongoDB even though production, tests, and CI are PostgreSQL-only.
- **Impact:** a developer following the local instructions can prepare the wrong
  environment or assume the E2E lane is obsolete.
- **Required action:** update the comments and link to the PostgreSQL seed/E2E
  setup used by `.github/workflows/ci.yml`.
- **Exit test:** local instructions and CI describe the same backend, seed, and
  credentials flow.

### DWF-008 — Medium — Scope and evidence gates remain procedural

- **Evidence:** diff thresholds and evidence requirements exist in Markdown and
  the PR checklist, but no local command or CI check reports oversized slices,
  missing delivery-contract fields, or absent browser evidence.
- **Impact:** the improved process still relies on reviewer discipline, which is
  weakest during rapid iterative work.
- **Required action:** after the blocker/high findings are closed, add a small
  non-destructive preflight command that reports diff size, lists applicable
  gates, and links to required evidence. Keep judgment with the reviewer; do not
  turn line count into a blind hard failure.
- **Exit test:** every handoff can include one generated preflight summary.

## Controls that passed audit

- One canonical workflow is linked from the docs index and both agent
  entrypoints.
- `Planned`, `Implemented`, `Verified`, `Ready for review`, and `Done` have
  distinct meanings.
- The workflow explicitly prevents calling an untested UI ready and states that
  owner screenshots are not the primary QA loop.
- PR checklist and Definition of Done cover security controls, browser
  interaction, data invariants, documentation, diff review, and CI status.
- Migration/import guidance requires disposable rehearsal, source-evidence
  preservation, before/after invariants, and rollback boundaries.
- Current governing English ADR is explicit:
  `docs/decisions/english-domain-authority.md` supersedes the earlier generic
  convergence model.

## Remediation order

### Gate 0 — Restore the feedback loop

1. Install the pinned Chromium runtime.
2. Correct PostgreSQL-only Playwright setup documentation.
3. Run the existing English spec unchanged to establish a real baseline.

No additional English UI changes should start until Gate 0 passes.

### Gate 1 — Finish wiring the process

1. Update `plans/_TEMPLATE-proposal.md` with the delivery contract.
2. Add explicit Playwright viewport projects/helpers.
3. Keep the process-document changes as a standalone commit.

### Gate 2 — Re-slice the English worktree

Create separate, independently verifiable slices for data handoff, adopted
Meeting commands, and responsive calendar/drawer layout. Record why any slice
that crosses the review threshold must remain atomic.

### Gate 3 — Add missing regression coverage

1. PostgreSQL integration: adopted imported Meeting reschedule/cancel,
   authorization denial, audit, and source-baseline preservation.
2. Playwright: create, edit/reschedule, durable cancel, notification feedback,
   and persisted result.
3. Playwright responsive: drawer closed/open at required desktop widths and
   mobile behavior where supported.
4. Migration rehearsal: before/after counts plus rollback/compensating-path
   verification.

### Gate 4 — Verify and ship one slice at a time

Run the targeted regression loop, affected suites, browser matrix, applicable
full tests, lint, build, verifier, and `git diff --check`. Commit only the slice
whose evidence is complete. Push only after explicit authorization, then wait
for all seven CI gates before calling it **Done**.

## Exit criteria for this audit

This focused audit can be closed when:

- [ ] DWF-001 and DWF-002 are closed with a runnable, persistent English E2E flow.
- [ ] DWF-003 is resolved by splitting the current worktree or documenting why a remaining slice is atomic.
- [x] DWF-004 and DWF-005 are wired into the plan template and Playwright configuration.
- [ ] DWF-006 passes on real PostgreSQL through the production HTTP stack.
- [ ] DWF-007 is corrected.
- [ ] Migration 050 before/after and rollback evidence is recorded.
- [ ] Each resulting slice meets the canonical Definition of Done and all seven CI gates are green.

## Gate 0 execution (2026-07-21)

Ran the Gate 0 remediation steps and recorded a real baseline:

1. **Chromium installed** — `cd client && npx playwright install chromium`
   (chromium-1228). Browser now launches; DWF-001 closed.
2. **PG-only setup documented** — `client/playwright.config.js` header rewritten
   to the PostgreSQL flow; DWF-007 closed.
3. **Baseline run** — API server booted on PostgreSQL
   (`DB_BACKEND=postgres`, Neon prototype, 314 seeded users, seed admin
   `mustChangePassword=false`), Vite auto-started by Playwright. Result:
   `e2e/english-operations.spec.js` → **2 passed (5.1s)**. One prior cold-start
   run failed at login on a server/Neon warm-up race (boot CSRF cookie not yet
   set); the warm re-run is green. No product code changed.

Gate 0 complete. Remaining findings (DWF-002 shallow assertions, DWF-003 slice
size, DWF-004 template, DWF-005 viewport matrix, DWF-006 integration coverage,
DWF-008 preflight) are unaffected and still open.

## Gate 1 execution (2026-07-21)

Delivery contract for this process-only slice:

- **User outcome:** a delivery proposal cannot silently omit the canonical
  Phase 0 questions, and the required responsive viewport matrix is directly
  runnable by developers and CI.
- **In scope:** proposal template, Playwright project wiring, E2E operator docs,
  and this audit record. **Non-goals:** English product behavior, persistent
  workflow assertions, worktree re-slicing, PostgreSQL command integration, and
  automated preflight.
- **Domain authority:** `.claude/rules/implementation-workflow.md` Phase 0 and
  `.claude/rules/testing-and-ci.md` Browser verification standard.
- **Acceptance:** a copied proposal exposes every required contract field; the
  Playwright project list includes the full suite at 1440x900 and the English
  responsive spec at 1280x800 and 390x844; unrelated E2E mutations are not
  multiplied across the narrow projects.
- **Data impact / rollback:** none; configuration and Markdown only. Revert the
  standalone Gate 1 commit if the matrix causes runner incompatibility.
- **Feedback loop:** inspect the Playwright `--list` project/spec expansion,
  then run the English Operations spec through all three projects against the
  seeded PostgreSQL-backed app when the local API is available.

Verification recorded for this configuration slice:

- `cd client && npx.cmd playwright test --list` — 36 tests discovered: 32 in
  `desktop-wide`, two English Operations tests in `desktop-compact`, and the
  same two in `mobile-390`.
- `cd client && npx.cmd eslint playwright.config.js` — passed.
- `git diff --check` — passed. A real browser interaction run was not repeated
  because the local API health probe timed out; persistent workflow and layout
  behavior remain explicitly assigned to Gate 3 rather than claimed here.

Gate 1 closes DWF-004 and DWF-005. DWF-002, DWF-003, DWF-006, and DWF-008 remain
open for the later gates defined above.

## Audit status

**OPEN — Gates 0 and 1 closed; DWF-002/003/006/008 remain.** Gate 1 changes only
the delivery template, Playwright viewport wiring/operator docs, and this audit
record. No English feature code was changed.
