# Testing & CI

## Run tests
```bash
cd server && npm test            # Jest + Supertest + mongodb-memory-server (--runInBand)
cd client && npm run test:run    # Vitest + React Testing Library
cd client && npm run test:e2e    # Playwright (needs seeded backend + Mongo replica set)
cd client && npm run test:coverage
cd server && npm run test:smoke  # Artillery load (also :load, :spike)
```
Server tests need env `NODE_ENV=test` and a dummy `JWT_SECRET` (required at boot).

## CI gates — ALL required to merge (`.github/workflows/ci.yml`) — 7 gates
1. **client-tests** — Vitest unit + hook suite
2. **client-build** — `vite build` must compile clean
3. **client-lint** — eslint with ratchet cap
4. **secrets-scan** — gitleaks (fails on any secret pattern)
5. **audit** — `npm audit` high+ (prod deps on server, full on client)
6. **e2e-tests** — Playwright against a real seeded backend on Postgres (slowest, ~5–10 min)
7. **server-tests-pg** — the FULL Jest suite on the Postgres backend (`DB_BACKEND=postgres`), zero exclusions — the **sole server-test gate**. Promoted from informational to REQUIRED (Wave G, 2026-07-07) after the GATED schedule roster-sync/waitlist cluster closed; Wave-F PR-2 (attendance-export dual-backend port) then closed `p2-regression` and the temporary exclusion was dropped. The Mongo `server-tests` lane (Jest on `mongodb-memory-server`, `DB_BACKEND=mongo`) was **retired 2026-07-10** (Wave K Phase 2 Batch C) once prod cut over to PG and Atlas was cancelled — it only exercised now-dead Mongo repos. NOTE: the Jest harness still starts `mongodb-memory-server` to author fixtures (via `tests/pg-auto-mirror`); dropping `mongoose` needs the fixture-layer decouple (remaining Wave K work, Batch D).

### Merge discipline (QA-012 — gates are NOT machine-enforced)
GitHub branch protection is unavailable on this repo (private repo, Free plan), so
"required" above is **procedural, not enforced** — GitHub will let a red PR merge.
Therefore, for humans AND agents:
- **Never `gh pr merge` until `gh pr checks <n>` shows every gate green.** No exceptions;
  a red/pending gate means wait, fix, or escalate to the owner.
- Never push directly to `main`; all changes go through a PR so the gates run at all.

## ESLint ratchet (critical rule)
`client/package.json` runs `eslint . --max-warnings <cap>`. **Current cap = 63.**
- The cap may only go DOWN as warnings are fixed, **never UP**. PR review rejects any increase.
- `client/eslint.config.js` documents the policy + history (its header comment may lag the actual cap — package.json is source of truth).
- Hard errors (always block, no ratchet): `no-undef`, `no-unused-vars`, `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` (promoted to a REAL `error` in audit round 6 / QA-013 — it was silently `warn` before).

## Test discipline
- Tests verify the FINAL merged code. Don't skip, `.skip`, or weaken assertions just to go green.
- No fake data / mocks-as-shortcuts to fake a pass — exercise real code paths.
- Fix failing tests for real; re-run until genuinely passing before pushing.
- New backend domains/use-cases should ship with integration tests (`server/tests/integration/`).
- **Time-dependent tests must freeze the clock.** Any test whose subject compares a date to "now" (min-date gates, expiry/overdue, upcoming filters) must pin the clock (`vi.setSystemTime(...)` / Jest fake timers) instead of relying on the real wall clock — otherwise a hardcoded near-future date rots into a past date and the test fails by calendar (see `CreateSessionModal.test.jsx`). Fake only `Date` (`vi.useFakeTimers({ toFake: ['Date'] })`) so `userEvent` timers keep working; restore with `vi.useRealTimers()`.
