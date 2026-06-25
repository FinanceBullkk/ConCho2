/**
 * ──────────────────────────────────────────────────────────
 * Unit of Work + booking-write-repository — MONGO behaviour
 * ──────────────────────────────────────────────────────────
 * Proves the dual-backend transaction KEYSTONE on the Mongo side (the side we
 * can run everywhere — this file is NOT gated, so it runs locally and in the
 * server-tests CI job on the shared in-memory REPLICA SET, which is required for
 * MongoDB transactions). The cross-backend Mongo==PG equality of the same four
 * behaviours is pinned separately in tests/pg-parity/booking-transaction.pg.test.js
 * (gated on PG_URL, runs in the pg-parity CI job).
 *
 * Behaviours pinned here:
 *   1. commit   — runInTransaction persists the insert (visible after commit);
 *   2. rollback — a throw after the insert leaves NOTHING persisted;
 *   3. double-booking — a second LIVE insert for the same {classId,startTime}
 *      rejects with { code: 11000 } and the unit rolls back (still exactly one);
 *   4. partial-unique scope — a cancelled session frees the slot for re-booking.
 *
 * A dedicated single-node replica set is created in beforeAll so the file is
 * self-sufficient (mirrors the pattern the pg-parity files use). Schedule.init()
 * forces the partial-unique index to build before the double-booking assertion
 * (else the autoIndex race would let the duplicate insert pass — a known parity
 * pitfall, see phase-03 lessons).
 */
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const uow = require('../../domains/_shared/unit-of-work');
const repo = require('../../domains/schedule/booking-write-repository');
const Schedule = require('../../models/Schedule');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);

const CLS = oid(hex(0x701));
const TEAM = oid(hex(0x702));
const SLOT = new Date('2026-09-01T10:00:00.000Z');
const SLOT_END = new Date('2026-09-01T11:00:00.000Z');

const m = repo.impls.mongo;
const runTx = uow.impls.mongo; // run on Mongo regardless of the DB_BACKEND default
const book = () =>
  runTx((tx) => m.insertScheduledSession({ classId: CLS, bookedTeamId: TEAM, startTime: SLOT, endTime: SLOT_END }, tx));

describe('Unit of Work + booking-write-repository (Mongo)', () => {
  let replSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), { dbName: 'uow_booking_test' });
    await Schedule.init(); // build the {classId,startTime} partial-unique index
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  beforeEach(async () => {
    await Schedule.deleteMany({});
  });

  test('commit: runInTransaction persists the scheduled session', async () => {
    const created = await book();
    expect(created.status).toBe('scheduled');
    expect(await m.countScheduledForClass(CLS)).toBe(1);
  });

  test('rollback: a throw after the insert leaves nothing persisted', async () => {
    await expect(
      runTx(async (tx) => {
        await m.insertScheduledSession({ classId: CLS, startTime: SLOT, endTime: SLOT_END }, tx);
        throw new Error('boom after insert');
      }),
    ).rejects.toThrow('boom after insert');
    expect(await m.countScheduledForClass(CLS)).toBe(0);
  });

  test('double-booking: a second live insert for the same slot rejects { code: 11000 } and rolls back', async () => {
    await book();
    await expect(book()).rejects.toMatchObject({ code: 11000 });
    expect(await m.countScheduledForClass(CLS)).toBe(1); // loser rolled back
  });

  test('partial-unique scope: a cancelled session frees the slot for re-booking', async () => {
    const created = await book();
    await m.cancelSession(created._id);
    await expect(book()).resolves.toMatchObject({ status: 'scheduled' });
    expect(await m.countScheduledForClass(CLS)).toBe(1); // one live (+ one cancelled)
  });
});
