// @ts-check
import { test, expect } from './fixtures.js';

/**
 * E2E — Role-based UI gating
 *
 * Verifies the `useRole`/`can()` permission system actually hides admin-only
 * actions for participants and shows them for admins.
 */

test.describe('Permissions / RBAC', () => {
  test('Admin sees "+ New User" button on Users page', async ({ adminPage }) => {
    await adminPage.goto('/users');
    await expect(adminPage.getByRole('button', { name: /\+ new user/i })).toBeVisible();
  });

  test('Admin sees "+ New Cohort" button on Classes page', async ({ adminPage }) => {
    await adminPage.goto('/classes');
    await expect(adminPage.getByRole('button', { name: /\+ new cohort/i })).toBeVisible();
  });

  test('Admin sees "+ New Team" button on Teams page', async ({ adminPage }) => {
    await adminPage.goto('/teams');
    await expect(adminPage.getByRole('button', { name: /\+ new team/i })).toBeVisible();
  });

  test('Participant does NOT see "+ New User" — Users page is admin-only', async ({ participantPage }) => {
    // ProtectedRoute should redirect Participants away from /users
    await participantPage.goto('/users');
    // We don't assert a specific URL because the redirect target may vary;
    // we only assert that the admin-only "+ New User" button is not present.
    await expect(participantPage.getByRole('button', { name: /\+ new user/i })).toHaveCount(0);
  });

  test('Participant landing on /dashboard shows participant-scoped view', async ({ participantPage }) => {
    await expect(participantPage).toHaveURL(/\/dashboard$/);
    // Sign-out button should still be available for any authenticated user
    await expect(
      participantPage.getByRole('button', { name: /sign out|logout|log out/i })
        .or(participantPage.getByRole('link', { name: /sign out|logout|log out/i })),
    ).toBeVisible();
  });
});
