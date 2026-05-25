// @ts-check
import { test, expect } from './fixtures.js';

/**
 * E2E — Authenticated navigation smoke
 *
 * Loads each major admin page and confirms it renders without crashing.
 * This catches regressions in lazy-loaded routes, broken hooks, and
 * uncaught errors in initial render.
 */

// Router uses /home as the authenticated landing page; legacy
// /dashboard redirects there. Listing /home avoids the redirect hop.
const ADMIN_PAGES = [
  { path: '/home',      heading: /dashboard|overview|home/i },
  { path: '/users',     heading: /user management/i },
  { path: '/teams',     heading: /team management/i },
  { path: '/classes',   heading: /class management/i },
  { path: '/schedules', heading: /schedule management/i },
  { path: '/admin',     heading: /admin|control/i },
];

test.describe('Authenticated navigation', () => {
  for (const { path, heading } of ADMIN_PAGES) {
    test(`Admin can load ${path} without errors`, async ({ adminPage }) => {
      const errors = [];
      adminPage.on('pageerror', (e) => errors.push(e.message));

      await adminPage.goto(path);
      // Page heading visible — proves the route's lazy bundle loaded
      // and the React tree mounted.
      await expect(adminPage.getByRole('heading', { name: heading }).first())
        .toBeVisible({ timeout: 10_000 });

      expect(errors, `Uncaught errors on ${path}: ${errors.join(' | ')}`)
        .toHaveLength(0);
    });
  }

  test('UsersPage table renders the seed admin row', async ({ adminPage }) => {
    await adminPage.goto('/users');
    // Search for the seed admin by empCode to narrow to a single row
    await adminPage.getByPlaceholder(/search/i).fill('000001');
    // The seed admin's empCode should appear in the table
    await expect(adminPage.getByText('000001').first()).toBeVisible();
  });

  test('Search filter on Users page is URL-synced', async ({ adminPage }) => {
    await adminPage.goto('/users');
    await adminPage.getByPlaceholder(/search/i).fill('admin');
    // URL should reflect the search after the debounce settles
    await expect(adminPage).toHaveURL(/[?&]search=admin/i, { timeout: 5_000 });
  });
});
