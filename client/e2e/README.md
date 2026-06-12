# E2E Tests (Playwright)

End-to-end tests that drive the real React app in a headless Chromium browser.

## Prerequisites

1. **Install browsers** (one-time, ~120 MB):
   ```bash
   npx playwright install chromium
   ```

2. **Server running** on `http://localhost:5000` with a seeded DB:
   ```bash
   cd ../server
   npm run seed           # creates the test users below
   npm run dev            # starts the API
   ```
   The Vite dev server is started automatically by Playwright — no need to run `npm run dev` in `client/` separately.

3. **MFA disabled** on the seed admin account (default is disabled). If you've enabled MFA on `000001`, the `adminPage` fixture will throw with a clear message.

4. **Full-suite runs: disable rate limits on the API server.** The suite's
   aggregate traffic from one IP can trip the global limiter (200 req/min) and
   429 a later spec's login. Start the server with
   `DISABLE_RATE_LIMITS=true npm run dev` (the flag is ignored in production;
   limiter wiring has its own gate in `server/tests/unit/rateLimiterWiring.test.js`).
   Running a single spec usually stays under the budget without it.

## Test users (from `server/seed.js`)

| Role        | empCode  | password         |
|-------------|----------|------------------|
| Admin       | `000001` | `admin12345`     |
| Participant | `000004` | `participant123` |

Override via env vars: `E2E_ADMIN_CODE`, `E2E_ADMIN_PASS`, `E2E_PARTICIPANT_CODE`, `E2E_PARTICIPANT_PASS`.

## Running

```bash
npm run test:e2e             # headless, all browsers (chromium)
npm run test:e2e:headed      # see the browser window
npm run test:e2e:ui          # Playwright UI mode — best for writing tests
npm run test:e2e:report      # open the last HTML report

# Run a single file:
npx playwright test auth.spec.js

# Filter by test name:
npx playwright test -g "wrong password"
```

## Suites

| File                  | What it covers                                                       |
|-----------------------|-----------------------------------------------------------------------|
| `auth.spec.js`        | Login flow: success, wrong password, validation, forgot-password link, protected-route redirect |
| `permissions.spec.js` | `useRole`/`can()` UI gating — Admin sees admin actions, Participant doesn't |
| `navigation.spec.js`  | Every major admin page loads without errors; URL-synced filters work |
| `theme.spec.js`       | Dark/light toggle flips `html.dark` and survives reload              |
| `users-crud.spec.js`  | Create a user via the modal, search for them, then delete them — exercises the full mutation + react-query invalidation path (audit PR J — QA-002) |

## Fixtures

`fixtures.js` exports `adminPage` and `participantPage` — Pages already authenticated via the real login flow. Use them when a test needs to start from an authenticated state:

```js
import { test, expect } from './fixtures.js';

test('something admin', async ({ adminPage }) => {
  await adminPage.goto('/users');
  // ... already logged in as 000001
});
```

## CI tips

- `retries: 1` is enabled when `CI=1` to absorb network jitter.
- Reporter switches to `html` + `github` annotations on CI.
- `workers: 1` on CI to avoid backend contention.
- Trace + video are captured only on failures.
