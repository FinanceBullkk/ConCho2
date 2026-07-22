# Testing and CI

Testing must prove the changed user outcome at the closest real seam. A large
number of passing shallow tests is not evidence that an end-to-end workflow or
layout works.

## Verification ladder

Run these in order. Keep the first loop narrow and fast; broaden it only after
the target signal is green.

1. **Regression signal** — the smallest test/probe that reproduces the exact
   bug or acceptance example. For a bug, see it fail before the fix.
2. **Affected tests** — nearby client/server suites for the changed domain.
3. **Integration path** — real route, authorization, transaction, audit, and
   database behavior for mutations.
4. **Browser path** — the complete changed user interaction against a real
   seeded/local backend.
5. **Repository gates** — applicable full suites, lint, build, and diff check.

Do not replace a missing higher-level check with more lower-level tests.

## Common commands

```bash
cd server && npm test
cd client && npm run test:run
cd client && npm run lint
cd client && npm run build
cd client && npm run test:e2e
git diff --check
```

Server tests require a PostgreSQL test connection, `NODE_ENV=test`, and a dummy
`JWT_SECRET`. Playwright uses `client/playwright.config.js`, starts the Vite
client, and expects the seeded API server to be available. Install its browser
once with `cd client && npx playwright install chromium`.

If Playwright cannot launch, resolve the missing browser/runtime first. Until
then, report a user-facing change as **UI verification blocked**, not ready.

## Choosing the correct seam

| Change | Minimum regression evidence |
|---|---|
| Pure function or formatter | Unit test |
| Isolated component rendering/state | React Testing Library interaction test |
| API read | Route/integration test using real authorization and repository path |
| Mutation | Integration test for success, denial, core edge case, audit, and transaction |
| User workflow across UI/API | Playwright flow that completes the interaction and verifies persisted result |
| Responsive/layout behavior | Browser assertions/screenshots at required viewports with drawer/modal states |
| Migration/import | Disposable-DB rehearsal with before/after counts, invariants, and rollback check |

A test must assert the requested outcome. Opening a form does not prove that its
save, edit, reschedule, cancel, notification, or persistence behavior works.

## Browser verification standard

For user-facing changes:

- use the real route and representative data;
- exercise the changed interaction from entrypoint through success/error state;
- check 1440×900 and 1280×800 desktop viewports;
- check 390×844 for responsive/mobile-accessible surfaces;
- inspect empty, loading, populated, and error states when applicable;
- open and close affected drawers/modals;
- verify no accidental horizontal page scroll, clipped controls, hidden columns,
  overlapping layers, or unreachable actions;
- check browser console errors and failed API requests;
- compare against the named reference UI when the task requires parity.

Capture a screenshot or trace for a visual regression or reference-parity task.
Human acceptance is the final product check, not the first time the changed UI
is exercised.

## Data and time discipline

- Time-dependent tests must freeze the clock with `vi.setSystemTime(...)` or
  Jest fake timers. Fake only `Date` when `userEvent` timers need to remain real.
- Migrations/imports run on a disposable database before an active environment.
- Record relevant row counts and invariants before and after the operation.
- Preserve raw/source evidence; test rollback or a compensating recovery path.
- Never infer attendance, enrollment, ownership, or status without a documented
  business rule and an explicit acceptance example.

## Test integrity

- Tests verify final merged code. Never skip, weaken, or mock away the behavior
  merely to obtain a green result.
- New backend domains/use-cases ship with integration coverage.
- Re-run the original unminimized scenario after the regression test passes.
- Remove temporary instrumentation and test artifacts before commit.

## CI gates

All seven jobs in `.github/workflows/ci.yml` must be green before a change is
called **Done**:

1. `client-tests` — Vitest unit and hook suite.
2. `client-build` — Vite production build.
3. `client-lint` — ESLint ratchet; the warning cap may only decrease.
4. `secrets-scan` — gitleaks and explicit `.env` tracking guard.
5. `audit` — high+ dependency audit.
6. `e2e-tests` — Playwright against seeded PostgreSQL and the real app.
7. `server-tests-pg` — full Jest suite on PostgreSQL, zero exclusions.

Branch protection is procedural on this repository. Never merge while a gate is
red or pending; verify with `gh pr checks <number>`.

## Evidence in the handoff

Report exact commands/results, browser routes/interactions/viewports, data
invariants, and any blocked check. “Tests pass” without naming which tests and
“looks good” without a browser scenario are not sufficient evidence.
