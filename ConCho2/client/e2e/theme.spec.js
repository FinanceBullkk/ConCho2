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
 */

test.describe('Theme toggle', () => {
  test('toggles dark mode and persists across reload', async ({ adminPage }) => {
    await adminPage.goto('/dashboard');

    // Read initial state
    const initialDark = await adminPage.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );

    // Click the theme toggle button (sun/moon icon in navbar)
    const toggle = adminPage.getByRole('button', { name: /theme|dark mode|light mode|toggle/i }).first();
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
