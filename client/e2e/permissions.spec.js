// @ts-check
import { test, expect } from './fixtures.js';

/**
 * E2E — Role-based UI gating
 *
 * Verifies the `useRole`/`can()` permission system actually hides admin-only
 * actions for participants and shows them for admins.
 *
 * Audit PR X (P2-09): rewritten for the IA-S2 routes. People still hosts
 * the old Users/Teams pages, while the old Classes surface now appears as
 * Learning cohorts.
 */

test.describe('Permissions / RBAC', () => {
  test('Admin sees "+ New User" button on People → Users tab', async ({ adminPage }) => {
    await adminPage.goto('/people?tab=users');
    await expect(adminPage.getByRole('heading', { name: /^User Management$/ }))
      .toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('button', { name: /\+ new user/i }).first())
      .toBeVisible();
  });

  test('Admin can access Learning → Cohorts tab', async ({ adminPage }) => {
    await adminPage.goto('/learning?tab=cohorts');
    await expect(adminPage.getByRole('heading', { name: /^Learning$/ }))
      .toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('columnheader', { name: /^Cohort$/ }).first())
      .toBeVisible();
  });

  test('Admin sees the create-team action on People → Teams tab', async ({ adminPage }) => {
    await adminPage.goto('/people?tab=teams');
    await expect(adminPage.getByRole('heading', { name: /^Teams$/ }))
      .toBeVisible({ timeout: 10_000 });
    // TeamsPage's create button text is still Vietnamese ("+ Tạo nhóm")
    // because page-level i18n on TeamsPage has not landed yet (tracked as
    // part of FE-015). Match either copy so the test does not block the
    // pending i18n migration.
    await expect(
      adminPage.getByRole('button', { name: /\+ (new team|tạo nhóm)/i }).first(),
    ).toBeVisible();
  });

  test('Participant cannot reach the People section (Admin-only)', async ({ participantPage }) => {
    // ProtectedRoute roles={['Admin']} should redirect Participants away
    // from /people. We don't assert a specific URL because the redirect
    // target may vary; we only assert that the admin-only "+ New User"
    // button is not present on whatever page they land on.
    await participantPage.goto('/people?tab=users');
    await expect(participantPage.getByRole('button', { name: /\+ new user/i }))
      .toHaveCount(0);
  });

  test('Participant landing on /home shows the participant-scoped dashboard', async ({ participantPage }) => {
    await expect(participantPage).toHaveURL(/\/(home|dashboard)$/);
    // Sign-out (i18n key nav.signOut → "Sign out" in EN) lives inside the
    // AvatarMenu Radix DropdownMenu (Navbar.jsx:162-168). Open the menu by
    // clicking the trigger button (aria-label "Open account menu"), then
    // the menuitem becomes visible.
    const accountTrigger = participantPage.getByRole('button', { name: /open account menu/i });
    await expect(accountTrigger).toBeVisible({ timeout: 10_000 });
    await accountTrigger.click();
    // Radix renders the menu item with role="menuitem". The icon is
    // aria-hidden so the accessible name is exactly the i18n string.
    await expect(
      participantPage.getByRole('menuitem', { name: /sign out/i }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
