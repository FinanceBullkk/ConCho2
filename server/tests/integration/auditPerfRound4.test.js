/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — Audit Round 4 (Phase 04: Performance & Scale)
 * ──────────────────────────────────────────────────────────
 * PERF-014: the learning-session READ paths used to invalidate the
 * session-order cache on every read, guaranteeing a miss + an extra
 * Schedule.find per list/detail. Reads must read-THROUGH the cache;
 * only write paths invalidate. Regression: after a read the cache entry
 * exists (was deleted before the fix), and a 2nd read serves it.
 * ──────────────────────────────────────────────────────────
 */

const { getApp, getSeedData, teardown } = require('../setup');

let seed, Class, Schedule, repository, sessionOrderCache;

beforeAll(async () => {
  await getApp();
  seed = getSeedData();
  Class = require('../../models/Class');
  Schedule = require('../../models/Schedule');
  repository = require('../../domains/learning/session/repository');
  ({ sessionOrderCache } = require('../../domains/schedule/session-order'));
});

afterAll(async () => {
  await teardown();
});

describe('PERF-014 — session read paths read-through the cache (no invalidation on read)', () => {
  let cohort;

  beforeAll(async () => {
    cohort = await Class.create({
      classCode: `PERF014_${Date.now()}`, courseName: 'Perf 014', totalSessions: 10,
    });
    const base = Date.now() + 3 * 24 * 60 * 60 * 1000;
    await Schedule.create([
      { classId: cohort._id, bookedTeamId: seed.team._id, startTime: new Date(base), endTime: new Date(base + 3600e3), enrolledUsers: [seed.member1._id], status: 'scheduled' },
      { classId: cohort._id, bookedTeamId: seed.team._id, startTime: new Date(base + 24 * 3600e3), endTime: new Date(base + 25 * 3600e3), enrolledUsers: [seed.member1._id], status: 'scheduled' },
    ]);
  });

  test('findSessions leaves the cohort cache POPULATED and numbers sessions 1..N', async () => {
    const key = cohort._id.toString();
    sessionOrderCache.del(key); // start cold

    const { sessions } = await repository.findSessions({ classId: cohort._id }, { skip: 0, limit: 50 });

    // Regression: before the fix this entry was deleted on every read.
    const cached = sessionOrderCache.get(key);
    expect(cached).toBeDefined();
    expect(cached).toHaveLength(2);

    const numbers = sessions.map((s) => s.sessionNumber).sort();
    expect(numbers).toEqual([1, 2]);
  });

  test('findSessionById also leaves the cache populated (read-through)', async () => {
    const key = cohort._id.toString();
    sessionOrderCache.del(key);
    const one = await Schedule.findOne({ classId: cohort._id }).lean();

    await repository.findSessionById(one._id);

    expect(sessionOrderCache.get(key)).toBeDefined();
  });
});
