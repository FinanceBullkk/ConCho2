// @ts-check
import { test, expect } from '@playwright/test';

/**
 * E2E — Authentication flow
 *
 * Exercises the LoginPage end-to-end against the real API + DB.
 * Pre-req: server running and seeded (npm run seed in server/).
 */

test.describe('Authentication', () => {
  test('admin can sign in and lands on /dashboard', async ({ page }) => {
    await page.goto('/login');

    // Header is visible
    await expect(page.getByRole('heading', { name: 'TMS', exact: false })).toBeVisible();

    // Fill credentials and submit
    await page.getByLabel(/employee code/i).fill('000001');
    await page.getByLabel(/password/i).fill('admin12345');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Lands on dashboard (or MFA challenge — skip if so)
    const mfa = page.getByRole('heading', { name: /two-factor authentication/i });
    if (await mfa.isVisible().catch(() => false)) {
      test.skip(true, 'Admin has MFA enabled in this env — disable before running E2E');
    }
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('wrong password shows a visible error and stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/employee code/i).fill('000001');
    await page.getByLabel(/password/i).fill('definitely-not-the-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    // The form's root error renders an alert region
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('client-side validation: empty empCode blocks submission', async ({ page }) => {
    await page.goto('/login');
    // Only fill password, leave empCode empty
    await page.getByLabel(/password/i).fill('something');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Form should not navigate away (empCode is required by Zod)
    await expect(page).toHaveURL(/\/login$/);
  });

  test('forgot-password link routes to /forgot-password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test('protected route /dashboard redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
