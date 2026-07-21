// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for TMS.
 *
 * Strategy:
 *   - Tests hit the Vite dev server (default :3000), which proxies /api → :5000.
 *   - The Vite server is auto-started by `webServer` below; reused if already up
 *     so devs can keep their existing dev process running.
 *   - The Node API server is NOT started here. It runs on PostgreSQL
 *     (DB_BACKEND=postgres; prod, CI, and tests are PG-only since Wave K).
 *     Start it before running E2E, mirroring the `e2e-tests` job in
 *     .github/workflows/ci.yml:
 *
 *       # one-time: apply migrations + seed canonical users on PG
 *       cd server && npx knex migrate:latest --knexfile db/pg/knexfile.js
 *       cd server && DB_BACKEND=postgres NODE_ENV=test npm run seed
 *
 *       # Terminal 1
 *       cd server && DB_BACKEND=postgres npm run dev
 *
 *       # Terminal 2 — runs the E2E suite
 *       cd client && npm run test:e2e
 *
 *   - Seed credentials (from server/scripts/seed-pg.js) used by tests:
 *       Admin       000001 / admin12345
 *       Participant 000004 / participant123
 */
export default defineConfig({
  testDir: './e2e',
  // Each test gets its own browser context, so we can parallelize within a worker.
  fullyParallel: true,
  // No retries locally — flaky tests should be diagnosed, not papered over.
  // CI gets 1 retry to absorb network jitter.
  retries: process.env.CI ? 1 : 0,
  // Single worker by default avoids overwhelming the dev backend.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    // P2-09 (audit PR X): force English so spec selectors match a stable
    // string set. The i18n init reads `navigator.language` (after the
    // empty-localStorage fallback) and maps en-US → en. Without this,
    // the locale leaks from the runner host (CI is en-US, devs may be
    // vi-VN) and specs become host-dependent.
    locale: 'en-US',
    // Capture trace on first retry so failures are debuggable, but don't pay
    // the cost on every run.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Reasonable default timeouts — TMS pages are React + react-query so they
    // settle within a few seconds even with cold queries.
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  expect: {
    timeout: 7_000,
  },

  projects: [
    {
      // The primary project runs every E2E spec at the required wide desktop
      // viewport. Responsive English Operations coverage is repeated by the
      // two focused projects below instead of tripling every mutation suite.
      name: 'desktop-wide',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'desktop-compact',
      testMatch: /english-operations\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile-390',
      testMatch: /english-operations\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
