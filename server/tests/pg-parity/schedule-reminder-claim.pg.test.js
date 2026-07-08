/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — reminder claim/stamp (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * reminderService's concurrency control (B7, mig 034): one atomic bulk claim
 * stamps candidates; exact-stamp re-fetch; rollback frees the claim. Runs only
 * when a Postgres URL is present; SKIPS otherwise. Traps pinned:
 *   • claim scope: future window ∩ status scheduled ∩ unclaimed only
 *     (cancelled + already-claimed + out-of-window rows never claimed)
 *   • a second claim with a new stamp claims ZERO (disjointness)
 *   • re-fetch shape: classId {classCode,courseName} + enrolledUsers
 *     [{name,email}] (the email-template context)
 *   • rollback → row claimable again
 *   • pullUsersFromFutureSchedules: future live rosters only + modifiedCount
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/schedule/repository');
require('../../models/Class');
require('../../models/User');
require('../../models/Schedule');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const C1 = hex(0xd01);
const U1 = hex(0xd11); const U2 = hex(0xd12);
const SIN = hex(0xd21);   // in-window, scheduled, unclaimed → claimed
const SCAN = hex(0xd22);  // in-window but cancelled → never
const SOUT = hex(0xd23);  // outside window → never
const SPRE = hex(0xd24);  // already claimed (old stamp) → never
const SPULL = hex(0xd25); // future live roster (pull test)
const SPAST = hex(0xd26); // past roster — pull must not touch

const NOW = new Date('2026-08-01T00:00:00.000Z');
const IN1H = new Date('2026-08-01T01:00:00.000Z');
// Every SCHEDULED fixture needs a DISTINCT startTime — the {classId,startTime}
// partial-unique (status scheduled) rejects same-slot rows.
const IN2H = new Date('2026-08-01T02:00:00.000Z');
const IN30H = new Date('2026-08-02T06:00:00.000Z');
const IN31H = new Date('2026-08-02T07:00:00.000Z');
const WINDOW_END = new Date('2026-08-02T00:00:00.000Z'); // +24h
const OLD_STAMP = new Date('2026-07-31T23:00:00.000Z');

describePg('PG-parity: schedule reminder claim (B7)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'RC-1', courseName: 'Reminder Course', status: 'Ongoing', isDeleted: false },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'RU1', name: 'Recip One', email: 'r1@x.io', role: 'Participant', isDeleted: false },
      { _id: oid(U2), empCode: 'RU2', name: 'Recip Two', email: null, role: 'Participant', isDeleted: false },
    ]);
    const sched = (id, start, status, extra = {}) => ({
      _id: oid(id), classId: oid(C1), startTime: start, endTime: start, status,
      enrolledUsers: [oid(U1), oid(U2)], ...extra,
    });
    await db.collection(coll('Schedule')).insertMany([
      sched(SIN, IN1H, 'scheduled'),
      sched(SCAN, IN1H, 'cancelled'),   // cancelled → may share SIN's slot
      sched(SOUT, IN30H, 'scheduled'),
      sched(SPRE, IN2H, 'scheduled', { remindersSentAt: OLD_STAMP }),
      sched(SPULL, IN31H, 'scheduled'),
      sched(SPAST, new Date('2026-07-01T00:00:00.000Z'), 'scheduled'),
    ]);

    await query('TRUNCATE schedules, classes, users');
    await query(`INSERT INTO classes(id,class_code,course_name,status,is_deleted) VALUES ($1,'RC-1','Reminder Course','Ongoing',false)`, [C1]);
    await query(`INSERT INTO users(id,emp_code,name,email,role,is_deleted) VALUES
      ($1,'RU1','Recip One','r1@x.io','Participant',false),($2,'RU2','Recip Two',NULL,'Participant',false)`, [U1, U2]);
    const ipg = (id, start, status, claimed = null) => query(
      `INSERT INTO schedules(id,class_id,start_time,end_time,status,enrolled_users,reminders_sent_at)
       VALUES ($1,$2,$3,$3,$4,$5::text[],$6)`,
      [id, C1, start.toISOString(), status, [U1, U2], claimed ? claimed.toISOString() : null]);
    await ipg(SIN, IN1H, 'scheduled');
    await ipg(SCAN, IN1H, 'cancelled');
    await ipg(SOUT, IN30H, 'scheduled');
    await ipg(SPRE, IN2H, 'scheduled', OLD_STAMP);
    await ipg(SPULL, IN31H, 'scheduled');
    await ipg(SPAST, new Date('2026-07-01T00:00:00.000Z'), 'scheduled');
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('claim scope + exact-stamp re-fetch shape + disjoint second claim — identical', async () => {
    const stamp = new Date('2026-08-01T00:00:01.000Z');
    await both((r) => r.claimUpcomingReminders(NOW, WINDOW_END, stamp));

    const [m, p] = await both((r) => r.findClaimedForReminder(stamp));
    expect(m).toHaveLength(1); // only SIN (cancelled/out-of-window/pre-claimed excluded)
    expect(p).toHaveLength(1);
    expect(String(norm(m[0])._id)).toBe(SIN);
    expect(String(norm(p[0])._id)).toBe(SIN);
    const proj = (s) => { const n = norm(s); return {
      cls: `${n.classId.classCode} — ${n.classId.courseName}`,
      recipients: (n.enrolledUsers || []).map((u) => ({ name: u.name, email: u.email ?? null })),
    }; };
    expect(proj(m[0])).toEqual({ cls: 'RC-1 — Reminder Course', recipients: [{ name: 'Recip One', email: 'r1@x.io' }, { name: 'Recip Two', email: null }] });
    expect(proj(p[0])).toEqual(proj(m[0]));

    // Disjointness — a second cron firing with a NEW stamp claims zero.
    const stamp2 = new Date('2026-08-01T00:00:02.000Z');
    await both((r) => r.claimUpcomingReminders(NOW, WINDOW_END, stamp2));
    const [m2, p2] = await both((r) => r.findClaimedForReminder(stamp2));
    expect(m2).toHaveLength(0); expect(p2).toHaveLength(0);
  });

  test('rollback frees the claim for the next cron — identical', async () => {
    await both((r) => r.rollbackReminderClaim([SIN]));
    const stamp3 = new Date('2026-08-01T00:00:03.000Z');
    await both((r) => r.claimUpcomingReminders(NOW, WINDOW_END, stamp3));
    const [m, p] = await both((r) => r.findClaimedForReminder(stamp3));
    expect(m).toHaveLength(1); expect(p).toHaveLength(1);
  });

  test('pullUsersFromFutureSchedules: future live only + modifiedCount — identical', async () => {
    // freeze time context: "future" = startTime > real now — SPULL (2026-08-02)
    // and the claim fixtures are future relative to the test run; SPAST is not.
    const [m, p] = await both((r) => r.pullUsersFromFutureSchedules([U2]));
    expect(m.modifiedCount).toBeGreaterThanOrEqual(1);
    expect(p.modifiedCount).toBe(m.modifiedCount);
    const [mRow, pRow] = await both((r) => r.findScheduleByIdRaw(SPULL));
    expect(norm(mRow).enrolledUsers.map(String)).toEqual([U1]);
    expect(norm(pRow).enrolledUsers.map(String)).toEqual([U1]);
    const [mPast, pPast] = await both((r) => r.findScheduleByIdRaw(SPAST));
    expect(norm(mPast).enrolledUsers.map(String)).toEqual([U1, U2]); // untouched
    expect(norm(pPast).enrolledUsers.map(String)).toEqual([U1, U2]);
  });
});
