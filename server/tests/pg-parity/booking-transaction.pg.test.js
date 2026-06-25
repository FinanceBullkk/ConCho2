/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — Unit of Work + booking-write-repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The KEYSTONE parity test for the transaction-heavy Wave-D port: it proves the
 * backend-agnostic transaction boundary (domains/_shared/unit-of-work) and the
 * atomic booking write behave IDENTICALLY on MongoDB and Postgres. Runs only
 * when a Postgres URL is present (the pg-parity CI job); SKIPS otherwise.
 *
 * The Mongo side needs MongoDB transactions, so this file spins up a single-node
 * REPLICA SET (not the standalone MongoMemoryServer the CRUD parity files use —
 * transactions abort on a standalone). Schedule.init() builds the partial-unique
 * index before the double-booking assertion.
 *
 * Behaviours pinned identical on both backends:
 *   1. commit   — runInTransaction persists the insert;
 *   2. rollback — a throw after the insert leaves nothing persisted;
 *   3. double-booking — a second live insert for the same {classId,startTime}
 *      rejects with { code: 11000 } (PG 23505 mapped) and rolls back;
 *   4. partial-unique scope — a cancelled session frees the slot for re-booking.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const uow = require('../../domains/_shared/unit-of-work');
const repo = require('../../domains/schedule/booking-write-repository');
const Schedule = require('../../models/Schedule');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);

// Shared hex ids across both backends (Mongo casts hex → ObjectId; PG stores text).
const CLS = hex(0x701);
const TEAM = hex(0x702);
const SLOT = '2026-09-01T10:00:00.000Z';
const SLOT_END = '2026-09-01T11:00:00.000Z';

// Each backend = a (runInTransaction impl, repository impl) pair. The booking
// payload is identical; only the id casts differ (ObjectId vs text).
const BACKENDS = {
  mongo: { run: uow.impls.mongo, repo: repo.impls.mongo, classId: oid(CLS), teamId: oid(TEAM) },
  pg: { run: uow.impls.pg, repo: repo.impls.pg, classId: CLS, teamId: TEAM },
};

const book = (b) =>
  b.run((tx) => b.repo.insertScheduledSession(
    { classId: b.classId, bookedTeamId: b.teamId, startTime: SLOT, endTime: SLOT_END }, tx,
  ));

describePg('PG-parity: Unit of Work + booking-write-repository', () => {
  let replSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), { dbName: 'pg_parity_booking' });
    await Schedule.init(); // build the {classId,startTime} partial-unique index
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (replSet) await replSet.stop();
    await closePool();
  });

  beforeEach(async () => {
    await Schedule.deleteMany({});
    await query('TRUNCATE schedules');
  });

  test('commit: persists the scheduled session — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      const created = await book(b); // eslint-disable-line no-await-in-loop
      expect(created.status).toBe('scheduled');
      expect(await b.repo.countScheduledForClass(b.classId)).toBe(1); // eslint-disable-line no-await-in-loop
    }
  });

  test('rollback: a throw after the insert leaves nothing persisted — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      await expect( // eslint-disable-line no-await-in-loop
        b.run(async (tx) => {
          await b.repo.insertScheduledSession({ classId: b.classId, startTime: SLOT, endTime: SLOT_END }, tx);
          throw new Error('boom after insert');
        }),
      ).rejects.toThrow('boom after insert');
      expect(await b.repo.countScheduledForClass(b.classId)).toBe(0); // eslint-disable-line no-await-in-loop
    }
  });

  test('double-booking: a second live insert for the same slot rejects { code: 11000 } and rolls back — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      await book(b); // eslint-disable-line no-await-in-loop
      await expect(book(b)).rejects.toMatchObject({ code: 11000 }); // eslint-disable-line no-await-in-loop
      expect(await b.repo.countScheduledForClass(b.classId)).toBe(1); // eslint-disable-line no-await-in-loop
    }
  });

  test('partial-unique scope: a cancelled session frees the slot for re-booking — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      const created = await book(b); // eslint-disable-line no-await-in-loop
      await b.repo.cancelSession(created._id); // eslint-disable-line no-await-in-loop
      await expect(book(b)).resolves.toMatchObject({ status: 'scheduled' }); // eslint-disable-line no-await-in-loop
      expect(await b.repo.countScheduledForClass(b.classId)).toBe(1); // eslint-disable-line no-await-in-loop
    }
  });
});
