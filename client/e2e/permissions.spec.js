// @ts-check
import { test, expect } from './fixtures.js';

/**
 * E2E — Role-based UI gating
 *
 * Verifies the `useRole`/`can()` permission system actually hides admin-only
 * actions for participants and shows them for admins.
 *
 * Audit PR X (P2-09): rewritten for the IA-S2 routes. Section pages
 * (/people, /programs) host the old single-purpose pages (UsersPage,
 * TeamsPage, ClassesPage) inside tabs, so the admin-only action buttons
 * still live inside them — only the URL changed.
 */

test.describe('Permissions / RBAC', () => {
  test('Admin sees "+ New User" button on People → Users tab', async ({ adminPage }) => {
    await adminPage.goto('/people?tab=users');
    await expect(adminPage.getByRole('heading', { name: /^User Management$/ }))
      .toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('button', { name: /\+ new user/i }).first())
      .toBeVisible();
  });

  test('Admin sees "+ New Cohort" button on Programs → Classes tab', async ({ adminPage }) => {
    await adminPage.goto('/programs?tab=classes');
    await expect(adminPage.getByRole('heading', { name: /^Class Management$/ }))
      .toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('button', { name: /\+ new cohort/i }).first())
      .toBeVisible();
  });

  test('Admin sees "+ New Team" button on People → Teams tab', async ({ adminPage }) => {
    await adminPage.goto('/people?tab=teams');
    await expect(adminPage.getByRole('heading', { name: /^Teams$/ }))
      .toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('button', { name: /\+ new team/i }).first())
      .toBeVisible();
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
    // Sign-out (i18n key nav.signOut → "Sign out" in EN) should be reachable
    // for any authenticated user. The navbar exposes it inside the account
    // menu, so click the menu opener first.
    const accountTrigger = participantPage.getByRole('button', { name: /open account menu|account/i }).first();
    if (await accountTrigger.isVisible().catch(() => false)) {
      await accountTrigger.click();
    }
    await expect(
      participantPage.getByRole('button', { name: /^Sign out$/i })
        .or(participantPage.getByRole('menuitem', { name: /^Sign out$/i }))
        .or(participantPage.getByRole('link', { name: /^Sign out$/i }))
        .first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
