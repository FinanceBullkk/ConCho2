/**
 * ──────────────────────────────────────────────────────────
 * Unit Tests — Google Auth helper smoke
 * ──────────────────────────────────────────────────────────
 * Audit finding: SEC-002 (post-fix verification)
 *
 * After `npm audit fix` we want a fast smoke that proves:
 *  - `lib/googleAuth` can still be required without throwing
 *  - `isConfigured()` returns false when no env is set
 *  - `getAuthClient({ scopes, subject })` returns null when not configured
 *
 * These guards catch breaking changes from googleapis major bumps.
 * Real Calendar/Sheets integration is exercised in dedicated e2e
 * suites against a service account fixture (out of scope here).
 */

describe('Google auth helper smoke', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    // Reset env between tests to keep them independent.
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  test('requires without throwing', () => {
    expect(() => require('../../lib/googleAuth')).not.toThrow();
  });

  test('isConfigured() returns false when no credentials env is set', () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const { isConfigured } = require('../../lib/googleAuth');
    expect(isConfigured()).toBe(false);
  });

  test('getAuthClient() returns null when not configured', () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const { getAuthClient } = require('../../lib/googleAuth');
    const client = getAuthClient({
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: 'someone@example.com',
    });
    expect(client).toBeNull();
  });

  test('throws clear error on invalid JSON in GOOGLE_SERVICE_ACCOUNT_KEY_JSON', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON = '{not-json';
    const { isConfigured } = require('../../lib/googleAuth');
    expect(() => isConfigured()).toThrow(/not valid JSON/);
  });
});
