// @ts-check
import { test, expect } from '@playwright/test';
import { loginViaUI } from './fixtures.js';
import { apiLogin, apiLoginAdmin, apiSend, findUserIdByEmpCode } from './api-helpers.js';
import { totp } from './totp-helper.js';

/**
 * QA-018b: E2E for the MFA login challenge — enroll TOTP via the real API,
 * then complete a UI login through the two-factor step with a locally
 * generated RFC 6238 code (see totp-helper.js; server verifies via
 * speakeasy, window 1).
 *
 * Uses seed participant 000005 so the shared fixtures (000001/000002/000004,
 * which must stay MFA-free) are untouched. The spec disables MFA again at
 * the end via the Admin force-disable endpoint; it also force-disables at the
 * START so a previously failed run can never wedge the account.
 */

const MFA_USER = { empCode: '000005', password: 'participant123' };
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin12345';

// SEC-009: the admin-disable endpoint re-authenticates the admin's own
// password — a session cookie alone cannot strip a victim's MFA.
const adminDisableMfa = (request, userId) =>
  apiSend(request, 'POST', `/api/auth/mfa/admin-disable/${userId}`, { currentPassword: ADMIN_PASS });

test.describe('MFA login (TOTP)', () => {
  test('enrolled user must pass the TOTP challenge to sign in', async ({ page, request }) => {
    // ── Recover from any earlier failed run: force-disable MFA ──
    await apiLoginAdmin(request);
    const userId = await findUserIdByEmpCode(request, MFA_USER.empCode);
    await adminDisableMfa(request, userId); // idempotent — flips mfaEnabled off

    // ── Enroll via the real API as the user ─────────────────
    await apiLogin(request, MFA_USER); // context cookie now belongs to 000005
    const setup = await apiSend(request, 'POST', '/api/auth/mfa/setup');
    const secret = setup.data.secretBase32;
    expect(secret).toBeTruthy();
    const verify = await apiSend(request, 'POST', '/api/auth/mfa/verify-setup', {
      code: totp(secret),
    });
    expect(verify.data.backupCodes).toHaveLength(8);

    // ── UI login now lands on the two-factor step ───────────
    await page.goto('/login');
    await page.getByLabel(/employee code/i).fill(MFA_USER.empCode);
    await page.getByLabel(/password/i).fill(MFA_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(
      page.getByRole('heading', { name: /two-factor authentication/i }),
    ).toBeVisible({ timeout: 10_000 });

    // A wrong code is rejected (error surface, still on the MFA step)…
    await page.getByLabel(/verification code/i).fill('000000');
    await page.getByRole('button', { name: /verify & sign in/i }).click();
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });

    // …while the current TOTP completes the session.
    await page.getByLabel(/verification code/i).fill(totp(secret));
    await page.getByRole('button', { name: /verify & sign in/i }).click();
    await expect(page).toHaveURL(/\/(home|dashboard)$/, { timeout: 15_000 });

    // ── Cleanup: Admin force-disables MFA for the next run ──
    await apiLoginAdmin(request); // overwrite the context cookie back to Admin
    await adminDisableMfa(request, userId);
  });
});
