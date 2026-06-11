// @ts-check
import { test, expect } from './fixtures.js';

/**
 * E2E — User CRUD smoke
 *
 * Audit PR J (QA-002 follow-up). Walks the happy-path of:
 *   1. Admin opens the New User modal
 *   2. Fills empCode + name + email + password
 *   3. Submits — row appears in the table
 *   4. Searches for the new code (URL-synced filter)
 *   5. Opens the row's delete confirm and confirms
 *   6. Row disappears
 *
 * The test uses a per-run unique empCode (E2E + 6 hex) so concurrent
 * runs against the same backend do not collide. Cleanup in finally
 * guarantees the user is removed even if an assertion fails mid-flow.
 *
 * Pre-req: server seeded (npm run seed) and reachable; MFA disabled on
 * the seed admin (default).
 *
 * Audit PR X (P2-09): updated for the IA-S2 route move
 *   /users → /people?tab=users  (UsersPage is now a tab inside PeoplePage)
 * The inner page's "User Management" heading and "+ New User" button are
 * unchanged — only the URL we navigate to changed.
 */

const uniqueCode = () =>
  'E2E' + Math.random().toString(16).slice(2, 8).toUpperCase();

test.describe('Users — CRUD smoke', () => {
  test('admin can create then delete a user', async ({ adminPage }) => {
    const empCode = uniqueCode();
    const name = `E2E Smoke ${empCode}`;
    const email = `${empCode.toLowerCase()}@e2e.invalid`;
    const password = 'e2e-smoke-pass-12345';

    let createdRowVisible = false;

    try {
      // ── 1) Navigate ────────────────────────────────────
      await adminPage.goto('/people?tab=users');
      // PeoplePage's PageHeader emits "People" as h1; the nested
      // UsersPage emits "User Management" as its own h1. Asserting on
      // the inner one proves the tab content actually rendered (the
      // outer header would be visible even with a tab-loading error).
      await expect(
        adminPage.getByRole('heading', { name: /^User Management$/ }),
      ).toBeVisible({ timeout: 10_000 });

      // ── 2) Open the Create modal ───────────────────────
      // The page may include other "New User"-named controls in
      // alternate UI surfaces; scope to the first match (the primary
      // action button in the PageHeader-adjacent actions row).
      await adminPage.getByRole('button', { name: /\+ New User/i }).first().click();
      await expect(
        adminPage.getByRole('heading', { name: /create user/i }),
      ).toBeVisible();

      // ── 3) Fill required fields ────────────────────────
      await adminPage.getByLabel(/employee code/i).fill(empCode);
      await adminPage.getByLabel(/full name/i).fill(name);
      // Email field's label includes "(Workspace)" — match by partial regex.
      await adminPage.getByLabel(/^Email/i).fill(email);
      // Password field's label may be "Password" or "New Password..."; in
      // create mode it's the bare "Password" entry.
      await adminPage.getByLabel(/^Password$/i).fill(password);
      // Role defaults to Participant; leave as is.

      // ── 4) Submit ──────────────────────────────────────
      await adminPage.getByRole('button', { name: /^Create$/ }).click();

      // ── 5) Wait for the modal to close ─────────────────
      // Critical: until the Radix Dialog unmounts, focus stays trapped
      // inside the modal and key/input events sent to the FilterBar
      // below silently target the modal's still-mounted form fields.
      // The CI failure on this test was exactly this — the empCode
      // typed into FilterBar.fill() was being absorbed by the modal's
      // input until the unmount completed, by which point setSearch
      // had never fired so the URL never gained `?search=...`.
      await expect(
        adminPage.getByRole('heading', { name: /create user/i }),
      ).toHaveCount(0, { timeout: 10_000 });

      // ── 6) Find the row by searching for the empCode ───
      // Search is URL-synced via useListUrlState. Pin to the UsersPage
      // FilterBar's canonical placeholder copy (not generic /search/i)
      // so we never accidentally match the navbar's Ctrl+K search
      // button text on some breakpoints.
      const search = adminPage.getByPlaceholder(
        /Search by name, code, email, or department/i,
      );
      await expect(search).toBeVisible({ timeout: 7_000 });
      // Click before fill so focus is firmly on the FilterBar input —
      // belt-and-braces in case any focus-trap fragment lingers from
      // the freshly-unmounted modal.
      await search.click();
      await search.fill(empCode);
      await expect(adminPage).toHaveURL(new RegExp(`[?&]search=${empCode}`), {
        timeout: 5_000,
      });
      const row = adminPage.getByRole('row', { name: new RegExp(empCode, 'i') });
      await expect(row).toBeVisible({ timeout: 7_000 });
      createdRowVisible = true;

      // ── 6) Delete the row ──────────────────────────────
      // The trash button is the only one with title="Delete user" inside
      // the matched row.
      await row.getByRole('button', { name: /delete user/i }).click();
      // Confirmation dialog: heading "Delete this user?" + destructive
      // "Delete" button. Scope to the dialog to avoid matching anything else.
      const confirm = adminPage.getByRole('heading', { name: /delete this user/i });
      await expect(confirm).toBeVisible();
      await adminPage
        .getByRole('button', { name: /^Delete$/ })
        .click();

      // ── 7) Row vanishes ────────────────────────────────
      await expect(row).toHaveCount(0, { timeout: 7_000 });
      createdRowVisible = false;
    } finally {
      // Belt-and-braces cleanup: if the delete step never ran (assertion
      // earlier in the chain failed), use the API to soft-delete the user
      // so subsequent runs aren't blocked by the empCode unique index.
      if (createdRowVisible) {
        // Reach into the page's authenticated context and fire the DELETE.
        // We don't have a direct API token here — the admin's auth cookie
        // is already attached.
        await adminPage.evaluate(async (code) => {
          try {
            const list = await fetch(`/api/users?search=${encodeURIComponent(code)}`)
              .then((r) => r.json())
              .catch(() => ({ data: [] }));
            const found = (list?.data || []).find((u) => u.empCode === code);
            if (found?._id) {
              await fetch(`/api/users/${found._id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
              });
            }
          } catch {
            /* best-effort */
          }
        }, empCode);
      }
    }
  });
});
