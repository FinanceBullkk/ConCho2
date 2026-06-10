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

## CI gates — ALL required to merge (`.github/workflows/ci.yml`)
1. **server-tests** — Jest suite
2. **client-tests** — Vitest unit + hook suite
3. **client-build** — `vite build` must compile clean
4. **client-lint** — eslint with ratchet cap
5. **secrets-scan** — gitleaks (fails on any secret pattern)
6. **audit** — `npm audit` high+ (prod deps on server, full on client)
7. **e2e-tests** — Playwright against real seeded backend (slowest, ~5–10 min)

## ESLint ratchet (critical rule)
`client/package.json` runs `eslint . --max-warnings <cap>`. **Current cap = 72.**
- The cap may only go DOWN as warnings are fixed, **never UP**. PR review rejects any increase.
- `client/eslint.config.js` documents the policy + history (its header comment may lag the actual cap — package.json is source of truth).
- Hard errors (always block, no ratchet): `no-undef`, `no-unused-vars`, `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`.

## Test discipline
- Tests verify the FINAL merged code. Don't skip, `.skip`, or weaken assertions just to go green.
- No fake data / mocks-as-shortcuts to fake a pass — exercise real code paths.
- Fix failing tests for real; re-run until genuinely passing before pushing.
- New backend domains/use-cases should ship with integration tests (`server/tests/integration/`).
