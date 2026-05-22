// @ts-check
import { test as base, expect } from '@playwright/test';

/**
 * TMS E2E fixtures.
 *
 * `adminPage`:        a Page already logged in as Admin (000001).
 * `participantPage`:  a Page already logged in as Participant (000004).
 *
 * Login goes through the real UI so we also exercise the auth flow.
 * If MFA is enabled for a test account, the fixture will skip — disable
 * MFA on the seed accounts (default) before running E2E.
 */

// Default credentials — match server/seed.js. Override via env for shared envs.
const ADMIN_CODE = process.env.E2E_ADMIN_CODE || '000001';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin12345';
const PARTICIPANT_CODE = process.env.E2E_PARTICIPANT_CODE || '000004';
const PARTICIPANT_PASS = process.env.E2E_PARTICIPANT_PASS || 'participant123';

/**
 * Drive the login form to authenticate as the given user.
 * Throws if MFA is required — the fixture cannot bypass MFA from the UI.
 */
export async function loginViaUI(page, { empCode, password }) {
  await page.goto('/login');
  await page.getByLabel(/employee code/i).fill(empCode);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for either successful nav to dashboard OR the MFA step.
  await Promise.race([
    page.waitForURL(/\/dashboard$/, { timeout: 10_000 }).catch(() => {}),
    page.getByRole('heading', { name: /two-factor authentication/i })
      .waitFor({ timeout: 10_000 }).catch(() => {}),
  ]);

  if (await page.getByRole('heading', { name: /two-factor authentication/i }).isVisible().catch(() => false)) {
    throw new Error(
      `MFA is enabled for ${empCode}. Disable MFA on the seed account ` +
        `(Admin → Users → 🛡️ disable MFA) before running E2E tests.`,
    );
  }
}

export const test = base.extend({
  adminPage: async ({ page }, use) => {
    await loginViaUI(page, { empCode: ADMIN_CODE, password: ADMIN_PASS });
    await expect(page).toHaveURL(/\/dashboard$/);
    await use(page);
  },

  participantPage: async ({ page }, use) => {
    await loginViaUI(page, { empCode: PARTICIPANT_CODE, password: PARTICIPANT_PASS });
    await expect(page).toHaveURL(/\/dashboard$/);
    await use(page);
  },
});

export { expect };
