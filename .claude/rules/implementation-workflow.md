# Delivery and Implementation Workflow

How humans and agents turn a request into a small, verified, usable product
slice. Applies to features, behavior changes, migrations, and bug fixes.

The goal is not to maximize code shipped. The goal is to close one real user
loop with trustworthy evidence before starting the next one.

## Sources of truth

Read these before changing behavior:

1. `docs/development-roadmap.md` — current status and next work.
2. The affected `docs/specs/<capability>/spec.md` — observable behavior.
3. Applicable ADRs in `docs/decisions/` — locked domain and architecture
   decisions.
4. A plan in `plans/`, when the change is large or ambiguous.

If these sources disagree, stop implementation and resolve the disagreement.
Do not silently choose whichever model is easiest to code.

## Status language

Use these terms precisely in progress reports and handoffs:

| Status | Meaning |
|---|---|
| **Planned** | Outcome, non-goals, and acceptance examples are written; no implementation claim. |
| **Implemented** | Code exists, but one or more verification gates are still pending. |
| **Verified** | The original scenario and applicable automated/browser/data checks pass locally. |
| **Ready for review** | Verified, docs are current, the diff was reviewed, and the slice is intentionally committed. |
| **Done** | Ready for review and all applicable remote CI/merge gates are green. |

Never use **ready**, **fixed**, or **done** for a user-facing change that has not
been exercised through its real UI. If browser verification is unavailable,
say **implemented, UI verification blocked** and explain the blocker. A user
screenshot is useful feedback, but it is not a substitute for our own QA loop.

## Phase 0 — Re-baseline before coding

Write a short delivery contract in the plan, issue, or working notes:

- **User outcome:** one observable result for one actor.
- **In scope / out of scope:** especially adjacent workflows that will not move.
- **Domain authority:** the spec/ADR/reference implementation that defines the
  business meaning.
- **Acceptance examples:** Given/When/Then for the happy path, permission denial,
  and one core edge case.
- **Data impact:** tables/records affected, source evidence, migration and
  rollback boundary.
- **Feedback loop:** the exact test, HTTP probe, or browser flow that can prove
  the result.

For UI work, also name the reference screen and the required states: empty,
loading, populated, error, drawer/modal open, and mutation success/failure as
applicable.

### Stop-and-replan triggers

Stop adding code and re-baseline when any of these happens:

- the governing ADR, domain model, or reference product changes;
- a second independent user outcome enters the slice;
- a migration changes meaning rather than only supporting the agreed outcome;
- the original feedback loop no longer proves the requested behavior;
- the diff crosses roughly 15 files or 500 handwritten changed lines (excluding
  generated files) without an explicit reason it must remain atomic.

The size threshold is a review alarm, not a quota. Split by independently
verifiable user outcome, never by arbitrary frontend/backend layers.

## Phase 1 — Build the feedback loop first

Choose the closest seam that reproduces the real failure or desired workflow:

1. Backend integration test for mutation, authorization, audit, and transaction
   behavior.
2. Client component test for isolated rendering or state logic.
3. Playwright flow for a user-visible journey across routing, API, data, and UI.
4. Deterministic data verifier for imports, migrations, and reconciliation.

For bug fixes, make the signal fail before changing production code, then watch
it pass. A shallow test that cannot reproduce the reported symptom does not
count. For example, “the form opens” does not verify create, edit, reschedule,
cancel, notification feedback, or responsive layout.

If the required runner, database, credentials, or browser is unavailable, fix
the feedback loop first or report the work as blocked/unverified. Do not continue
shipping based only on code inspection.

## Phase 2 — Implement one vertical slice

Implement the smallest end-to-end path that delivers the Phase 0 outcome:

- real route/use-case with capability and resource authorization;
- validation, transaction, audit, and soft-delete/cancellation behavior;
- real frontend entrypoint and mutation feedback;
- report, completion, certificate, or notification consumer when relevant;
- tests at the seams identified in Phase 1.

Finish that path before starting an adjacent capability. Keep unrelated user
changes intact and do not combine opportunistic cleanup with the slice.

Database or imported-data work must be rehearsed on a disposable/prototype
database first. Record before/after counts and invariants. Preserve source
evidence and provide a tested rollback or compensating path before touching an
active environment. Production data changes always need explicit authorization.

## Phase 3 — Verify the product, not only the code

Use the verification ladder in `.claude/rules/testing-and-ci.md`.

For every user-facing UI change, browser verification is mandatory:

- run the real route against a real seeded/local backend;
- exercise the full changed interaction, not only page load;
- check desktop at 1440×900 and 1280×800;
- check 390×844 when the surface is responsive or mobile-accessible;
- check drawer/modal open and closed, overflow, clipping, scrolling, and focus;
- confirm no unexpected console errors or failed network requests;
- compare with the named reference screen when one exists.

The original reported scenario must be rerun after the fix. Unit tests, lint,
and a production build cannot replace this browser check.

## Phase 4 — Review the whole diff

Before calling the slice ready:

- inspect `git diff` and `git diff --check`;
- confirm every changed file belongs to the delivery contract;
- search for temporary logs, debug flags, bypasses, and stale TODOs;
- verify migration `up`/rollback semantics and data counts where applicable;
- update the affected spec, roadmap, ADR/status, system map, and permission
  matrix only when their truth changed;
- state known limitations instead of hiding them behind a green test count.

## Phase 5 — Commit and report evidence

Commit one verified slice with a conventional message. Do not wait for several
independent workflows to accumulate into one large commit. Never push directly
to `main`; ask before `git push`.

The delivery report must contain:

- the user outcome now working;
- exact automated checks run and their results;
- routes/interactions and viewports checked in the browser;
- data counts/invariants checked for migrations or imports;
- known limitations or blocked gates;
- commit/push/CI status.

## Definition of Done

A task is not done until every applicable item is true:

- [ ] One user outcome, non-goals, domain authority, and acceptance examples are stable.
- [ ] The implementation closes that outcome end to end.
- [ ] Auth, authorization, CSRF, validation, rate limits, audit, and soft-delete/cancellation controls remain intact.
- [ ] Tests cover the real happy path, permission denial, and one core edge case.
- [ ] The original bug/scenario is reproduced before the fix and passes after it.
- [ ] User-facing changes pass real-browser interaction and viewport checks.
- [ ] Data migrations/imports have recorded before/after invariants and a rollback boundary.
- [ ] Applicable targeted and full tests, lint, build, and `git diff --check` pass.
- [ ] Tracker, capability specs, ADRs, system map, and permission matrix reflect current truth.
- [ ] The final diff contains only the agreed slice and no debug residue.
- [ ] The verified slice is intentionally committed; remote CI is green before **Done**.

This checklist is mirrored in `.github/PULL_REQUEST_TEMPLATE.md`. Update both in
the same change whenever the Definition of Done changes.

## Autonomy bounds

- Run read-only discovery, local tests, and reversible implementation steps
  without asking when they stay inside the agreed slice.
- Pause for a decision when domain meaning, scope, destructive data impact, or
  external side effects are not already authorized.
- Always ask before `git push` or production data mutation.
