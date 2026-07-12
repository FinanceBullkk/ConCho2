/**
 * Integration Tests — /api/notifications (Cohesion P5, in-app notification bell)
 *
 * Self-scoped read feed over NotificationLog + mark-read / mark-all-read.
 * Verifies self-scoping (never another user's rows), pending exclusion, and
 * unread-count accounting.
 *
 * Run: npm test -- --testPathPatterns=notifications-mine
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { readActiveRow, countActiveRowsWhere, deleteActiveRowsWhere, updateActiveRow } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let app, tokens, seed, csrf;

const makeLog = (userId, over = {}) =>
  fx.createNotificationLog({
    type: 'assignment_due_soon',
    channel: 'email',
    recipientUserId: userId,
    learnerId: userId,
    cadenceKey: `${userId}:${Math.random().toString(36).slice(2)}`,
    status: 'sent',
    metadata: { assignmentTitle: 'Compliance 101', dueDate: new Date() },
    ...over,
  });

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await deleteActiveRowsWhere("NotificationLog", {});
});

const mine = (token) =>
  request(app).get('/api/notifications/mine').set('Authorization', `Bearer ${token}`);

describe('GET /api/notifications/mine', () => {
  test('requires auth', async () => {
    await request(app).get('/api/notifications/mine').expect(401);
  });

  test('returns only the caller rows + unreadCount; excludes pending and others', async () => {
    await makeLog(seed.leader._id); // unread
    await makeLog(seed.leader._id, { readAt: new Date() }); // read
    await makeLog(seed.leader._id, { status: 'pending' }); // excluded (transient)
    await makeLog(seed.member1._id); // another user — excluded

    const res = await mine(tokens.leader).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2); // the two non-pending leader rows
    expect(res.body.unreadCount).toBe(1);
    // DTO shape: presenter-derived title + link.
    expect(res.body.data[0].title).toBe('Assignment due soon');
    expect(res.body.data[0].link).toBe('/home');
  });

  test('teacher can read their own (empty) feed — notification.read is role-wide', async () => {
    const res = await mine(tokens.teacher).expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.unreadCount).toBe(0);
  });
});

describe('POST /api/notifications/:id/read', () => {
  test('marks own notification read and drops the unread count', async () => {
    const log = await makeLog(seed.leader._id);

    await request(app)
      .post(`/api/notifications/${log._id}/read`)
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .expect(200);

    const after = await mine(tokens.leader).expect(200);
    expect(after.body.unreadCount).toBe(0);
    expect(after.body.data[0].isRead).toBe(true);
  });

  test('cannot mark another user notification read (self-scoped → 404)', async () => {
    const others = await makeLog(seed.member1._id);

    await request(app)
      .post(`/api/notifications/${others._id}/read`)
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .expect(404);

    // untouched
    const reread = await readActiveRow('NotificationLog', others._id);
    expect(reread.readAt).toBeNull();
  });
});

describe('POST /api/notifications/read-all', () => {
  test('marks every unread caller row read', async () => {
    await makeLog(seed.leader._id);
    await makeLog(seed.leader._id);
    await makeLog(seed.member1._id); // another user — untouched

    const res = await request(app)
      .post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .expect(200);
    expect(res.body.data.updated).toBe(2);

    const after = await mine(tokens.leader).expect(200);
    expect(after.body.unreadCount).toBe(0);

    const otherUnread = await countActiveRowsWhere('NotificationLog', {
      recipientUserId: seed.member1._id, readAt: null,
    });
    expect(otherUnread).toBe(1);
  });
});

describe('/api/notifications/preferences (TMS.update S7)', () => {
  afterEach(async () => {
    await updateActiveRow("User", seed.leader._id, { notificationPreferences: null });
  });

  test('GET returns server defaults before any customisation', async () => {
    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .expect(200);
    expect(res.body.data.digest).toBe('daily');
    expect(res.body.data.categories.overdue).toEqual({ inApp: true, email: true });
    expect(res.body.data.categories.system).toEqual({ inApp: false, email: false });
  });

  test('PUT merges a partial update over the current preferences + audits', async () => {
    const res = await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ categories: { completions: { inApp: true, email: true } }, digest: 'weekly' })
      .expect(200);
    expect(res.body.data.digest).toBe('weekly');
    expect(res.body.data.categories.completions).toEqual({ inApp: true, email: true });
    // untouched categories keep their defaults
    expect(res.body.data.categories.overdue).toEqual({ inApp: true, email: true });

    // persisted: a fresh GET reflects the saved prefs
    const after = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .expect(200);
    expect(after.body.data.digest).toBe('weekly');
  });

  test('PUT rejects an invalid digest value (400)', async () => {
    await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ digest: 'hourly' })
      .expect(400);
  });
});
