// @ts-check
import { test, expect } from '@playwright/test';
import { loginViaUI } from './fixtures.js';
import {
  apiLoginAdmin, apiSend, findClassByCode, findTeamByName, findUserIdByEmpCode,
  createScheduleWithRetry,
} from './api-helpers.js';

/**
 * QA-018b: E2E for the learner waitlist join/leave loop (phase-04 slice B).
 *
 * A waitlist only exists on a FULL session the viewer can see but is not
 * enrolled in. The fixture builds the real-world shape of that state:
 *   1. seed member 000006 (Team Alpha) is set Inactive,
 *   2. Admin creates a future Team-Alpha session with capacity 2 — the roster
 *      snapshot takes only the ACTIVE members (000004, 000005) → 2/2 FULL,
 *   3. 000006 is re-activated: a team member NOT on the full session's roster
 *      — exactly the phase-04 visibility widening + waitlist audience.
 *
 * 000006 then drives the UI: /me/sessions shows the full session with a
 * "Join waitlist" action → joining shows "Waiting #1" → leaving restores the
 * join action. Cleanup cancels the fixture session (its waitlist dissolves
 * in the same transaction — release-resources).
 *
 * Booked 2 weeks ahead at the 15:00–16:00 VN slot: clear of the 2/week team
 * cap and far from booking.spec's "first free cell" two-weeks-ahead pick.
 */

const WAITLIST_USER = { empCode: '000006', password: 'participant123' };

// Two weeks ahead, 15:00 VN == 08:00 UTC (VN is fixed +07:00).
const futureSlotUtc = () => {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 14);
  start.setUTCHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(9, 0, 0, 0);
  return { start, end };
};

test.describe('learner waitlist (/me/sessions)', () => {
  test('non-rostered team member joins and leaves a full session waitlist', async ({ page, request }) => {
    // ── Fixture (Admin API) ─────────────────────────────────
    await apiLoginAdmin(request);
    const userId = await findUserIdByEmpCode(request, WAITLIST_USER.empCode);
    const cls = await findClassByCode(request, 'EL001');
    const team = await findTeamByName(request, 'Sales Team Alpha');

    let scheduleId = null;
    try {
      // 1. Park 000006 as Inactive so the roster snapshot skips them.
      await apiSend(request, 'PUT', `/api/users/${userId}`, { status: 'Inactive' });

      // 2. Full session: capacity 2 == the two remaining Active members.
      const { start, end } = futureSlotUtc();
      const created = await createScheduleWithRetry(request, {
        classId: cls._id,
        bookedTeamId: team._id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        capacity: 2,
      });
      scheduleId = created._id;
      expect(created.enrolledUsers).toHaveLength(2);

      // 3. Re-activate — now a team member NOT on the full roster.
      await apiSend(request, 'PUT', `/api/users/${userId}`, { status: 'Active' });

      // ── UI: join then leave the waitlist ──────────────────
      await loginViaUI(page, WAITLIST_USER);
      await page.goto('/me/sessions');

      const joinBtn = page.getByRole('button', { name: /join waitlist/i });
      await expect(joinBtn).toBeVisible({ timeout: 10_000 });
      await joinBtn.click();

      await expect(page.getByText(/Waiting #1/)).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: /^Leave$/ }).click();
      await expect(page.getByText(/Waiting #1/)).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByRole('button', { name: /join waitlist/i })).toBeVisible();
    } finally {
      // ── Cleanup — always restore seed state for re-runs ────
      await apiSend(request, 'PUT', `/api/users/${userId}`, { status: 'Active' }).catch(() => {});
      if (scheduleId) {
        await apiSend(request, 'DELETE', `/api/schedules/${scheduleId}`).catch(() => {});
      }
    }
  });
});
