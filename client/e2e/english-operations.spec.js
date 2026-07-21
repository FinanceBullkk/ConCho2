import { test, expect } from './fixtures.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const dateKey = (date) => date.toISOString().slice(0, 10);

const vietnamDateKey = (value) => dateKey(new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000));

async function nextUnusedEnglishWeek(page) {
  const response = await page.request.get('/api/english-training/sessions?limit=1&offset=0');
  expect(response.ok()).toBe(true);
  const body = await response.json();
  const latest = body.data?.[0]?.heldAt ? new Date(body.data[0].heldAt) : new Date();
  const floor = new Date(Date.now() + 14 * DAY_MS);
  const afterLatest = new Date(latest.getTime() + 14 * DAY_MS);
  const anchor = afterLatest > floor ? afterLatest : floor;
  anchor.setUTCHours(0, 0, 0, 0);
  const daysUntilMonday = (8 - anchor.getUTCDay()) % 7 || 7;
  const monday = new Date(anchor.getTime() + daysUntilMonday * DAY_MS);
  return {
    week: dateKey(monday),
    createDate: dateKey(new Date(monday.getTime() + DAY_MS)),
    movedDate: dateKey(new Date(monday.getTime() + 2 * DAY_MS)),
  };
}

async function canonicalSession(page, meetingId) {
  const response = await page.request.get('/api/english-training/sessions?limit=200&offset=0');
  expect(response.ok()).toBe(true);
  const body = await response.json();
  return body.data.find((row) => row.meetingId === meetingId);
}

test.describe('English Operations ready-to-use workflows', () => {
  test('attendance opens as an evidence review workspace', async ({ adminPage }, testInfo) => {
    await adminPage.goto('/english-operations?tab=attendance');

    await expect(adminPage.getByRole('heading', { name: 'Attendance review' })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /^\d+\s+All sessions$/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /^\d+\s+Needs evidence$/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /^\d+\s+Recorded$/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /^\d+\s+Upcoming$/i })).toBeVisible();

    const needsEvidence = adminPage.getByRole('button', { name: /^\d+\s+Needs evidence$/i });
    await needsEvidence.click();
    await expect(needsEvidence).toHaveAttribute('aria-pressed', 'true');

    // The unrecorded-session roster drawer is a wide-layout affordance; narrower
    // viewports collapse the workspace to the calendar grid, so the compact and
    // mobile projects exercise layout only (they assert no page overflow),
    // matching the persistent mutation flow below.
    if (testInfo.project.name !== 'desktop-wide') {
      const overflow = await adminPage.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      return;
    }

    await adminPage.getByRole('button', { name: /— unrecorded$/i }).first().click();
    const roster = adminPage.getByTestId('attendance-drawer-column');
    await expect(roster).toBeVisible();
    await expect(roster.getByText(/No imported attendance evidence/i)).toBeVisible();
    await expect(roster.locator('.fixed.inset-0')).toHaveCount(0);
  });

  test('schedule create, reschedule, and durable cancel persist after reload', async ({ adminPage }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-wide', 'Persistent mutation flow runs once; viewport projects exercise layout only.');

    const dates = await nextUnusedEnglishWeek(adminPage);
    await adminPage.goto(`/english-operations?tab=schedule&week=${dates.week}`);

    await expect(adminPage.getByRole('heading', { name: 'English delivery calendar' })).toBeVisible();
    await adminPage.getByRole('button', { name: 'Schedule session' }).click();
    await adminPage.getByLabel('Date').fill(dates.createDate);

    const createResponsePromise = adminPage.waitForResponse((response) =>
      response.request().method() === 'POST'
      && /\/api\/english-training\/workspace\/course-runs\/[^/]+\/sessions$/.test(response.url()));
    await adminPage.getByRole('button', { name: /^Create session \d+$/ }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()).data;
    await expect(adminPage.getByText('English session scheduled').last()).toBeVisible();

    await adminPage.reload();
    const createdCard = adminPage.getByRole('button').filter({ hasText: 'E2E001' }).first();
    await expect(createdCard).toBeVisible();
    await createdCard.click();
    await expect(adminPage.getByRole('heading', { name: `Edit session ${created.sessionNumber}` })).toBeVisible();
    await adminPage.getByLabel('Date').fill(dates.movedDate);
    await adminPage.getByLabel('Reason for the change (optional)').fill('PIC requested another day');

    const moveResponsePromise = adminPage.waitForResponse((response) =>
      response.request().method() === 'PATCH'
      && response.url().includes(`/meetings/${created.meetingId}`));
    await adminPage.getByRole('button', { name: 'Save changes' }).click();
    const moveResponse = await moveResponsePromise;
    expect(moveResponse.status()).toBe(200);
    await expect(adminPage.getByText('English session rescheduled').last()).toBeVisible();

    await adminPage.reload();
    const moved = await canonicalSession(adminPage, created.meetingId);
    expect(moved).toBeTruthy();
    expect(vietnamDateKey(moved.heldAt)).toBe(dates.movedDate);
    expect(moved.meetingStatus).toBe('planned');

    const movedCard = adminPage.getByRole('button').filter({ hasText: 'E2E001' }).first();
    await expect(movedCard).toBeVisible();
    await movedCard.click();
    await adminPage.getByRole('button', { name: 'Cancel session' }).click();
    await adminPage.getByLabel('Cancellation reason').fill('Course calendar changed');

    const cancelResponsePromise = adminPage.waitForResponse((response) =>
      response.request().method() === 'DELETE'
      && response.url().includes(`/meetings/${created.meetingId}`));
    await adminPage.getByRole('button', { name: 'Confirm cancellation' }).click();
    const cancelResponse = await cancelResponsePromise;
    expect(cancelResponse.status()).toBe(200);
    await expect(adminPage.getByText('English session cancelled').last()).toBeVisible();

    await adminPage.reload();
    const cancelled = await canonicalSession(adminPage, created.meetingId);
    expect(cancelled).toMatchObject({
      meetingStatus: 'cancelled',
      cancellationReason: 'Course calendar changed',
    });
    const cancelledCard = adminPage.getByRole('button').filter({ hasText: 'E2E001' }).first();
    await expect(cancelledCard).toContainText('Cancelled');
  });

  test('schedule drawer composes without page overflow at the required viewport', async ({ adminPage }) => {
    const pageErrors = [];
    const failedResponses = [];
    adminPage.on('pageerror', (error) => pageErrors.push(error.message));
    adminPage.on('response', (response) => {
      if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`);
    });

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

    const dialog = adminPage.getByRole('dialog', { name: 'English session editor' });
    const metrics = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        position: getComputedStyle(element).position,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    });
    const viewport = adminPage.viewportSize();
    expect(viewport).toBeTruthy();
    if (viewport.width < 1024) {
      expect(metrics.position).toBe('fixed');
      expect(metrics.left).toBeGreaterThanOrEqual(-1);
      expect(metrics.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(Math.abs(metrics.bottom - viewport.height)).toBeLessThanOrEqual(1);
      await expect(adminPage.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
    } else {
      expect(metrics.position).toBe('static');
      expect(metrics.width).toBeLessThanOrEqual(321);
    }

    const pageOverflow = await adminPage.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(pageOverflow).toBeLessThanOrEqual(1);

    await adminPage.getByRole('button', { name: 'Close session form' }).click();
    await expect(adminPage.getByTestId('schedule-drawer-column')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });
});
