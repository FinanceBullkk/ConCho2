const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown, getCsrfHeaders } = require('../setup');
const { findActiveRowWhere, countActiveRowsWhere } = require('../pg-test-utils');
const PushSubscription = require('../../models/PushSubscription');
const Schedule = require('../../models/Schedule');

// ──────────────────────────────────────────────────────────
// Mobile API — mobile learning surface (Modernization H2 — B5).
// Covers push subscribe/unsubscribe, the VAPID-key 503 when unconfigured, the
// self-scoped "due today" feed (upcoming enrolled sessions + assignment halves),
// and the auth boundary.
// ──────────────────────────────────────────────────────────

let app, tokens, seed;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
});

afterAll(async () => { await teardown(); });

afterEach(async () => {
  await Promise.all([
    PushSubscription.deleteMany({}),
    Schedule.deleteMany({ topic: /B5/ }),
  ]);
});

const get = (token, path) => request(app).get(path).set('Authorization', `Bearer ${token}`);
const post = async (token, path, body) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).post(path).set('Authorization', `Bearer ${token}`).set(csrf).send(body);
};
const del = async (token, path, body) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).delete(path).set('Authorization', `Bearer ${token}`).set(csrf).send(body);
};

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/b5-test-endpoint', keys: { p256dh: 'BPxTestKeyValue', auth: 'authTestValue' } };

describe('Mobile API — mobile learning surface (B5)', () => {
  test('push subscribe stores the device; unsubscribe removes it', async () => {
    const sub = await post(tokens.leader, '/api/me/push/subscribe', SUB);
    expect(sub.status).toBe(201);
    const stored = await findActiveRowWhere('PushSubscription', { endpoint: SUB.endpoint });
    expect(String(stored.userId)).toBe(seed.leader._id.toString());

    const un = await del(tokens.leader, '/api/me/push/subscribe', { endpoint: SUB.endpoint });
    expect(un.status).toBe(200);
    expect(await findActiveRowWhere('PushSubscription', { endpoint: SUB.endpoint })).toBeNull();
  });

  test('subscribe is idempotent on endpoint (re-subscribe upserts)', async () => {
    await post(tokens.leader, '/api/me/push/subscribe', SUB);
    await post(tokens.leader, '/api/me/push/subscribe', SUB);
    expect(await countActiveRowsWhere('PushSubscription', { endpoint: SUB.endpoint })).toBe(1);
  });

  test('vapid-key returns 503 when Web Push is not configured (no VAPID env in test)', async () => {
    expect((await get(tokens.leader, '/api/me/push/vapid-key')).status).toBe(503);
  });

  test('mobile-feed is self-scoped and includes the learner\'s upcoming enrolled session', async () => {
    const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await Schedule.create({ classId: seed.class1._id, topic: 'B5 Upcoming', startTime: start, endTime: end, enrolledUsers: [seed.leader._id] });

    const feed = await get(tokens.leader, '/api/me/mobile-feed');
    expect(feed.status).toBe(200);
    expect(feed.body.data).toMatchObject({ pushEnabled: false });
    expect(Array.isArray(feed.body.data.overdue)).toBe(true);
    expect(Array.isArray(feed.body.data.dueSoon)).toBe(true);
    expect(feed.body.data.upcomingSessions.find((s) => s.topic === 'B5 Upcoming')).toBeTruthy();

    // A different learner does not see this session in their feed.
    const otherFeed = await get(tokens.teacher, '/api/me/mobile-feed');
    expect(otherFeed.body.data.upcomingSessions.find((s) => s.topic === 'B5 Upcoming')).toBeFalsy();
  });

  test('the mobile surface requires authentication', async () => {
    expect((await request(app).get('/api/me/mobile-feed')).status).toBe(401);
    expect((await request(app).get('/api/me/push/vapid-key')).status).toBe(401);
  });
});
