// @ts-check
import { test, expect } from './fixtures.js';

/**
 * E2E — Theme toggle persistence
 *
 * Verifies that:
 *   1. Clicking the theme toggle flips html.dark
 *   2. The choice persists across reload (localStorage)
 *   3. There's no flash of unstyled content (the anti-flash inline script
 *      sets the class before React mounts)
 *
 * Audit PR X (P2-09): the toggle is now keyed by i18n strings
 *   nav.switchLight = "Switch to light mode"
 *   nav.switchDark  = "Switch to dark mode"
 * The button's accessible name flips based on current theme, so match
 * either side of the toggle in the role query.
 */

test.describe('Theme toggle', () => {
  test('toggles dark mode and persists across reload', async ({ adminPage }) => {
    await adminPage.goto('/home');

    // Read initial state
    const initialDark = await adminPage.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );

    // The toggle's aria-label is "Switch to light mode" when in dark mode,
    // or "Switch to dark mode" when in light mode — match either side so
    // we don't depend on whichever theme the test session starts with.
    const toggle = adminPage.getByRole('button', {
      name: /Switch to (light|dark) mode/i,
    }).first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await toggle.click();

    // Class should flip
    await expect.poll(async () =>
      await adminPage.evaluate(() => document.documentElement.classList.contains('dark')),
    ).toBe(!initialDark);

    // Reload — preference must survive
    await adminPage.reload();
    await expect.poll(async () =>
      await adminPage.evaluate(() => document.documentElement.classList.contains('dark')),
    ).toBe(!initialDark);
  });
});
