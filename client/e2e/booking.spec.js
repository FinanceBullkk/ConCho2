// @ts-check
import { test, expect } from './fixtures.js';

/**
 * QA-018 (audit round 6): E2E for the leader booking grid — the core business
 * loop (CLAUDE.md "booking model") had no e2e coverage at all.
 *
 * Covers: /book renders the slot grid for a team leader → leader books a free
 * slot in a future week → the cell flips to "Mine" → leader cancels it again
 * (which also restores DB state for re-runs against a persistent dev DB).
 *
 * Booking two weeks ahead keeps the spec deterministic:
 *   - clear of the 2-sessions/week/team cap regardless of pre-existing data,
 *   - beyond the 24h cancel-cutoff guard, so "Cancel session" is enabled.
 *
 * Seed assumptions (server/scripts/seed.js): participant 000004 is the LEADER
 * of a team whose class is Ongoing and whose program allows leader_booking —
 * the same precondition the /book page itself requires.
 */

test.describe('leader booking grid (/book)', () => {
  test('leader books a free future slot, then cancels it', async ({ participantPage: page }) => {
    await page.goto('/book');

    // Leader landed on the grid (non-leaders get a "not a Team Leader" card).
    await expect(page.getByRole('heading', { name: /schedule & book/i })).toBeVisible();

    // Jump two weeks ahead (cap-free, cancel-guard-free).
    const nextWeek = page.getByRole('button', { name: /next week/i });
    await nextWeek.click();
    await nextWeek.click();

    // An empty bookable cell renders the "+ Book" affordance.
    const bookableCell = page.getByText('+ Book').first();
    await expect(bookableCell).toBeVisible();
    await bookableCell.click();

    // Drawer opens in book mode; confirm. (Drawer titles are <p>, not headings.)
    await expect(page.getByText('Book this slot')).toBeVisible();
    await page.getByRole('button', { name: /^book(\s*anyway)?$/i }).click();

    // The booked cell flips to the leader's own session ("Mine" badge).
    const mineBadge = page.getByText('Mine', { exact: true });
    await expect(mineBadge).toBeVisible({ timeout: 10_000 });

    // Cancel it again: own cell → cancel drawer → confirm. ("Cancel session"
    // appears as both drawer title and button — target the button role only.)
    await page.getByText(/click to cancel/i).first().click();
    await page.getByRole('button', { name: /^cancel session$/i }).click();

    // Cell frees up: no "Mine" session left in this week's view.
    await expect(mineBadge).toHaveCount(0, { timeout: 10_000 });
  });

  test('grid explains the slot states to the leader (legend)', async ({ participantPage: page }) => {
    await page.goto('/book');
    await expect(page.getByText(/your session — click to cancel/i)).toBeVisible();
    await expect(page.getByText(/available — click to book/i)).toBeVisible();
    await expect(page.getByText(/taken by another team/i)).toBeVisible();
  });
});
