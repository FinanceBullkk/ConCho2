import { test, expect } from './fixtures.js';

test.describe('English Operations ready-to-use workflows', () => {
  test('attendance opens as an evidence review workspace', async ({ adminPage }) => {
    await adminPage.goto('/english-operations?tab=attendance');

    await expect(adminPage.getByRole('heading', { name: 'Attendance review' })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /^\d+\s+All sessions$/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /^\d+\s+Needs evidence$/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /^\d+\s+Recorded$/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /^\d+\s+Upcoming$/i })).toBeVisible();

    const needsEvidence = adminPage.getByRole('button', { name: /^\d+\s+Needs evidence$/i });
    await needsEvidence.click();
    await expect(needsEvidence).toHaveAttribute('aria-pressed', 'true');

    await adminPage.getByRole('button', { name: /— unrecorded$/i }).first().click();
    const roster = adminPage.getByTestId('attendance-drawer-column');
    await expect(roster).toBeVisible();
    await expect(roster.getByText(/No imported attendance evidence/i)).toBeVisible();
    await expect(roster.locator('.fixed.inset-0')).toHaveCount(0);
  });

  test('schedule keeps the calendar full width and opens creation on demand', async ({ adminPage }) => {
    await adminPage.goto('/english-operations?tab=schedule');

    await expect(adminPage.getByRole('heading', { name: 'English delivery calendar' })).toBeVisible();
    await expect(adminPage.getByTestId('schedule-drawer-column')).toHaveCount(0);

    const openForm = adminPage.getByRole('button', { name: 'Schedule session' });
    await expect(openForm).toBeEnabled();
    await openForm.click();
    await expect(adminPage.getByRole('heading', { name: 'Schedule the next credited session' })).toBeVisible();
    await expect(adminPage.getByLabel('Course run')).toBeVisible();
    await expect(adminPage.getByLabel('Date')).toBeVisible();
    await expect(adminPage.getByLabel('Time slot')).toBeVisible();
  });
});
