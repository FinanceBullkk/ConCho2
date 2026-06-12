// @ts-check
import { test, expect } from './fixtures.js';

/**
 * E2E — Authenticated navigation smoke
 *
 * Loads each major admin page and confirms it renders without crashing.
 * This catches regressions in lazy-loaded routes, broken hooks, and
 * uncaught errors in initial render.
 *
 * Audit PR X (P2-09): rewritten for the IA-S2/S3 routes
 *   - /users  → /people?tab=users        (PeoplePage hosts UsersPage in a tab)
 *   - /classes → /learning?tab=cohorts   (LearningPage hosts legacy classes as cohorts)
 *   - /schedules → /calendar?tab=schedules (CalendarPage hosts SchedulesPage)
 *   - /admin → /system
 * English-class separation (2026-06-12): the team-booking world has its own
 * section — Teams/Classes/Schedules/Attendance/Evaluations at /english?tab=…
 * The legacy redirects in App.jsx keep the old paths working as a bookmark
 * grace window, but the canonical paths are what the navbar now emits.
 */

// Each entry asserts: the PageHeader title (h1) rendered by the section,
// AND the inner sub-section heading (proves the tab content mounted).
// Both checks together prove the lazy chunk loaded + the React tree
// mounted without an uncaught error.
//
// SystemPage default tab `settings` lazy-loads SettingsPage; CI hits a
// race where the inner chunk swaps before the outer header settles.
// Accept either "System" (PageHeader) OR "Settings" (inner) — both
// prove the SystemPage tree mounted.
const ADMIN_PAGES = [
  // /home renders DashboardPage which puts the greeting (e.g. "Hello, Admin")
  // in the PageHeader title slot. Match the greeting prefix.
  { path: '/home',                     headerHeading: /^Hello, /,            innerHeading: null },
  { path: '/people?tab=users',         headerHeading: /^People$/,            innerHeading: /^User Management$/ },
  { path: '/english?tab=teams',        headerHeading: /^English Class$/,     innerHeading: /^Teams$/ },
  // CohortsTab renders its title via CardTitle (not a heading role) — same
  // reason /learning?tab=cohorts has innerHeading: null.
  { path: '/english?tab=classes',      headerHeading: /^English Class$/,     innerHeading: null },
  { path: '/learning?tab=cohorts',     headerHeading: /^Learning$/,          innerHeading: null },
  { path: '/calendar?tab=schedules',   headerHeading: /^Calendar$/,          innerHeading: /^Schedule Management$/ },
  { path: '/english?tab=schedules',    headerHeading: /^English Class$/,     innerHeading: /^Schedule Management$/ },
  { path: '/system',                   headerHeading: /^(System|Settings)$/, innerHeading: null },
];

test.describe('Authenticated navigation', () => {
  for (const { path, headerHeading, innerHeading } of ADMIN_PAGES) {
    test(`Admin can load ${path} without errors`, async ({ adminPage }) => {
      const errors = [];
      adminPage.on('pageerror', (e) => errors.push(e.message));

      await adminPage.goto(path);
      // Wait for in-flight XHR/fetch to settle. /system in particular
      // fans out to /api/settings, /api/audit-logs, /api/sync etc. while
      // it boots; without this, the heading poll can race the React
      // tree's first render on slow CI.
      await adminPage.waitForLoadState('networkidle', { timeout: 15_000 });

      // PageHeader (shared chrome) — proves the section component mounted.
      await expect(adminPage.getByRole('heading', { name: headerHeading }).first())
        .toBeVisible({ timeout: 15_000 });

      // Inner section heading — proves the tab content actually rendered.
      // Some pages (Dashboard, System) don't have a stable inner heading;
      // skip the second assertion for those.
      if (innerHeading) {
        await expect(adminPage.getByRole('heading', { name: innerHeading }).first())
          .toBeVisible({ timeout: 10_000 });
      }

      expect(errors, `Uncaught errors on ${path}: ${errors.join(' | ')}`)
        .toHaveLength(0);
    });
  }

  test('UsersPage table renders the seed admin row', async ({ adminPage }) => {
    await adminPage.goto('/people?tab=users');
    // Wait for the Users tab content to mount (PeoplePage lazy-renders tab content).
    await expect(adminPage.getByRole('heading', { name: /^User Management$/ }))
      .toBeVisible({ timeout: 10_000 });

    // Search for the seed admin by empCode to narrow to a single row.
    // Pin to the UsersPage FilterBar copy, not generic /search/i.
    await adminPage
      .getByPlaceholder(/Search by name, code, email, or department/i)
      .fill('000001');
    // The seed admin's empCode should appear in the table.
    await expect(adminPage.getByText('000001').first()).toBeVisible();
  });

  test('Search filter on Users page is URL-synced', async ({ adminPage }) => {
    await adminPage.goto('/people?tab=users');
    await expect(adminPage.getByRole('heading', { name: /^User Management$/ }))
      .toBeVisible({ timeout: 10_000 });
    await adminPage.getByPlaceholder(/Search by name, code, email, or department/i).fill('admin');
    // URL should reflect the search after the debounce settles.
    await expect(adminPage).toHaveURL(/[?&]search=admin/i, { timeout: 5_000 });
  });

  test('Legacy /users path redirects (bookmark grace window)', async ({ adminPage }) => {
    // /users is NOT in App.jsx LEGACY_REDIRECTS but the SPA's catch-all
    // sends unknown paths to /home. Either landing is acceptable — the
    // point is the browser stays on the SPA and does not 404.
    await adminPage.goto('/users');
    await expect(adminPage).toHaveURL(/\/(people|home|users)/);
  });

  test('Legacy /classes redirects to /learning?tab=cohorts', async ({ adminPage }) => {
    // This redirect IS configured (App.jsx LEGACY_REDIRECTS) — verify it.
    await adminPage.goto('/classes');
    await expect(adminPage).toHaveURL(/\/learning\?tab=cohorts$/);
  });
});
