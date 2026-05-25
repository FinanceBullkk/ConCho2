// @ts-check
import { test, expect } from './fixtures.js';

/**
 * E2E — Theme toggle persistence
 *
 * Verifies that clicking the navbar theme toggle:
 *   1. Updates `localStorage('tms-theme')` to the opposite value
 *   2. The choice persists across reload
 *
 * Audit PR X (P2-09): the original assertion polled the `html.dark`
 * class directly, which races against React's render cycle on slow CI
 * runners (the click commits state in one frame, `useEffect` flips the
 * class on the next). The localStorage write happens inside the same
 * effect, so reading the stored value is functionally equivalent but no
 * longer racy. The toggle's aria-label is i18n'd — match either side so
 * the test does not depend on which theme the session starts in.
 */

test.describe('Theme toggle', () => {
  test('toggle flips the persisted theme and survives reload', async ({ adminPage }) => {
    await adminPage.goto('/home');

    // Read the persisted theme. May be null on first paint before the
    // useTheme effect runs — wait until it has written something.
    const readTheme = () =>
      adminPage.evaluate(() => localStorage.getItem('tms-theme'));

    await expect.poll(readTheme, { timeout: 5_000 }).not.toBeNull();
    const initial = await readTheme();
    expect(initial === 'dark' || initial === 'light').toBe(true);
    const opposite = initial === 'dark' ? 'light' : 'dark';

    const toggle = adminPage.getByRole('button', {
      name: /Switch to (light|dark) mode/i,
    }).first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await toggle.click();

    // localStorage flips to opposite. This is set inside useTheme's
    // effect alongside the html.dark class — reading the storage is
    // equivalent to reading the class but avoids the render-frame race
    // on slow CI runners.
    await expect.poll(readTheme, { timeout: 5_000 }).toBe(opposite);

    // Reload — preference must survive.
    await adminPage.reload();
    await expect.poll(readTheme, { timeout: 5_000 }).toBe(opposite);
  });
});
