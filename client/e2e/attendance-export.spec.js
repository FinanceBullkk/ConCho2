// @ts-check
import { test, expect } from './fixtures.js';
import {
  apiLoginAdmin, findClassByCode, findTeamByName, createPastSessionInFreeSlot,
} from './api-helpers.js';

/**
 * QA-018b (audit round 6 backlog): E2E for the attendance-marking and
 * HR-export P1 flows. Serial on purpose — the export test consumes the
 * attendance records the marking test creates (the seed has none).
 *
 * Fixture: an Admin API call creates a PAST session for seed Team B / class
 * EL002 (the slot policy validates VN wall-clock windows, not dates; marking
 * rejects FUTURE sessions, so a past fixture is required). Past sessions
 * refuse deletion once started ("attendance is preserved"), so instead of
 * cleanup each run claims the next free past slot — see
 * createPastSessionInFreeSlot. On CI the DB is fresh every run anyway.
 */

let fixtureSession = null;

test.describe.serial('attendance marking → HR export', () => {
  test('teacher marks a past session as all-present', async ({ teacherPage: page, request }) => {
    // ── Fixture: Admin creates yesterday's session for Team B (EL002) ──
    await apiLoginAdmin(request);
    const cls = await findClassByCode(request, 'EL002');
    const team = await findTeamByName(request, 'Marketing Team Beta');
    fixtureSession = await createPastSessionInFreeSlot(request, {
      classId: cls._id,
      bookedTeamId: team._id,
    });

    // ── Teacher marks it on the unified Operations Attendance ─────
    // (Converge Phase 4: attendance is unified at /calendar (mode="all") and
    // shows BOTH worlds with a Team/Cohort facet — the separate English
    // attendance tab was retired. EL002 is a team-world class; it appears here
    // for the teacher, proving the unified surface covers team marking.)
    await page.goto('/calendar?tab=attendance');
    await expect(page.getByRole('heading', { name: 'Attendance' }).first()).toBeVisible();

    // Navigate back to the week the fixture landed in (the free-slot scan
    // may have gone several weeks back on a persistent dev DB).
    const start = new Date(fixtureSession.startTime);
    const monday = (d) => { const m = new Date(d); const day = (m.getDay() + 6) % 7; m.setDate(m.getDate() - day); m.setHours(0, 0, 0, 0); return m; };
    let weeksBack = Math.round((monday(new Date()).getTime() - monday(start).getTime()) / (7 * 86400000));
    for (; weeksBack > 0; weeksBack -= 1) {
      await page.getByRole('button', { name: 'Previous week' }).click();
    }

    // .first(): a persistent dev DB may hold older fixture cells in the same
    // week (done or orphaned toMark) — any toMark cell exercises the flow.
    const cell = page.getByRole('button', { name: /EL002 — toMark/ }).first();
    await expect(cell).toBeVisible();
    await cell.click();

    // Drawer: roster defaults to P; stamp all as marked and save.
    await page.getByRole('button', { name: /mark all present/i }).click();
    await page.getByRole('button', { name: /^Save \(\d+\)$/ }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });

    // The calendar cell flips to the done state.
    await expect(page.getByRole('button', { name: /EL002 — done/ }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin downloads the pending attendance as Excel', async ({ adminPage: page }) => {
    await page.goto('/reports?tab=hr-export');
    await expect(page.getByRole('heading', { name: /download attendance report/i })).toBeVisible();

    // The marking test created 3 fresh records — the export button shows the
    // live pending count and must be enabled.
    const exportBtn = page.getByRole('button', { name: /^Export \d+ records?$/ });
    await expect(exportBtn).toBeEnabled({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

    // Toast confirms the round trip (download + records flipped to exported).
    await expect(page.getByText(/Downloaded .*\.xlsx/)).toBeVisible({ timeout: 10_000 });

    // No fixture cleanup: a started session refuses deletion by design
    // ("Past attendance is preserved for reporting") — see header comment.
  });
});
