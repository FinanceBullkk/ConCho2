/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — notification repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → mongo by default, both impls load (PG without a
 * connection), and the Mongo bell read/mark surface is intact through the
 * selector. Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/notification-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/notification/repository');
const NotificationLog = require('../../models/NotificationLog');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('notification repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.markRead).toBe(repo.impls.mongo.markRead);
    expect(typeof repo.impls.mongo.findForUser).toBe('function');
    expect(typeof repo.impls.pg.markAllReadForUser).toBe('function');
  });

  test('mongo bell read/mark through the selector (feed excludes pending → markRead → unread drops)', async () => {
    const userId = new mongoose.Types.ObjectId();
    await NotificationLog.create([
      { type: 'assignment_due_soon', channel: 'in_app', recipientUserId: userId, cadenceKey: `k1-${userId}`, status: 'sent' },
      { type: 'assignment_due_soon', channel: 'in_app', recipientUserId: userId, cadenceKey: `k2-${userId}`, status: 'pending' },
    ]);
    const feed = await repo.impls.mongo.findForUser(userId);
    expect(feed.length).toBe(1); // pending excluded
    expect(await repo.impls.mongo.countUnreadForUser(userId)).toBe(1);

    await repo.impls.mongo.markRead(feed[0]._id, userId);
    expect(await repo.impls.mongo.countUnreadForUser(userId)).toBe(0);
  });
});
