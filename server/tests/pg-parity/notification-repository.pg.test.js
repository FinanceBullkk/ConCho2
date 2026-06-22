/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — notification repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * In-app bell read/mark surface + per-user preferences. Runs only when a
 * Postgres URL is present; SKIPS otherwise. Asserts identical behaviour + traps:
 *   • feed + unread count exclude status='pending' (transient) rows
 *   • markRead is self-scoped (another user's id → null); markAll returns count
 *   • preferences: a user with none set OMITS the key (Mongo default undefined)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/notification/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const U1 = hex(911); const U2 = hex(912);
const N1 = hex(921); const N2 = hex(922); const N3 = hex(923); const N4 = hex(924); const N5 = hex(925);

const logProj = (l) => (l == null ? null : { cadenceKey: l.cadenceKey, status: l.status, read: l.readAt != null });

describePg('PG-parity: notification repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', name: 'Uno', notificationPreferences: { email: true, inApp: false }, isDeleted: false },
      { _id: oid(U2), empCode: 'U2', name: 'Dos', isDeleted: false }, // no prefs → key omitted
    ]);
    const log = (id, u, status, cadence, d, readAt = null) => ({
      _id: oid(id), type: 'assignment_due_soon', channel: 'in_app', recipientEmail: '',
      recipientUserId: oid(u), cadenceKey: cadence, status, sentAt: null, readAt, error: '', metadata: {}, createdAt: d,
    });
    await db.collection(coll('NotificationLog')).insertMany([
      log(N1, U1, 'sent', 'c1', day(3)),
      log(N2, U1, 'sent', 'c2', day(2), day(5)),  // already read
      log(N3, U1, 'pending', 'c3', day(4)),         // transient → excluded
      log(N4, U2, 'sent', 'c4', day(2)),            // other user
      log(N5, U1, 'failed', 'c5', day(1)),          // not pending → included, unread
    ]);

    await query('TRUNCATE notification_logs, users');
    await query(`INSERT INTO users(id,emp_code,name,notification_preferences,is_deleted) VALUES
      ($1,'U1','Uno','{"email":true,"inApp":false}',false),($2,'U2','Dos',null,false)`, [U1, U2]);
    const ipg = (id, u, status, cadence, d, readAt = null) => query(
      `INSERT INTO notification_logs(id,type,channel,recipient_user_id,cadence_key,status,read_at,created_at)
       VALUES ($1,'assignment_due_soon','in_app',$2,$3,$4,$5,$6)`,
      [id, u, cadence, status, readAt ? readAt.toISOString() : null, d.toISOString()]);
    await ipg(N1, U1, 'sent', 'c1', day(3));
    await ipg(N2, U1, 'sent', 'c2', day(2), day(5));
    await ipg(N3, U1, 'pending', 'c3', day(4));
    await ipg(N4, U2, 'sent', 'c4', day(2));
    await ipg(N5, U1, 'failed', 'c5', day(1));
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('findForUser (newest first, pending excluded) + countUnread — identical', async () => {
    const [m, p] = await both((r) => r.findForUser(U1));
    expect(m.map((l) => logProj(l).cadenceKey)).toEqual(['c1', 'c2', 'c5']); // day3,2,1; c3 pending out
    expect(p.map(logProj)).toEqual(m.map(logProj));

    const [mC, pC] = await both((r) => r.countUnreadForUser(U1)); // c1 + c5 unread (c2 read, c3 pending)
    expect(mC).toBe(2); expect(pC).toBe(2);
  });

  test('markRead self-scoped (wrong user → null) + recount — identical', async () => {
    expect(await repo.impls.mongo.markRead(N1, U2)).toBeNull(); // N1 is U1's, not U2's
    expect(await repo.impls.pg.markRead(N1, U2)).toBeNull();

    const [mR, pR] = await both((r) => r.markRead(N1, U1));
    expect(logProj(mR).read).toBe(true); expect(logProj(pR).read).toBe(true);

    const [mC, pC] = await both((r) => r.countUnreadForUser(U1)); // only c5 left unread
    expect(mC).toBe(1); expect(pC).toBe(1);
  });

  test('markAllReadForUser returns count + zeroes unread — identical', async () => {
    // markAll filters only read_at IS NULL (no status filter, mirroring Mongo
    // updateMany) → it also marks the transient pending row c3 → 2 on both.
    const [m, p] = await both((r) => r.markAllReadForUser(U1));
    expect(m).toBe(2); expect(p).toBe(2);
    const [mC, pC] = await both((r) => r.countUnreadForUser(U1));
    expect(mC).toBe(0); expect(pC).toBe(0);
  });

  test('preferences: read (omit when unset) + update — identical', async () => {
    const [m1, p1] = await both((r) => r.findUserPreferences(U1));
    expect(norm(m1)).toEqual({ _id: U1, notificationPreferences: { email: true, inApp: false } });
    expect(norm(p1)).toEqual(norm(m1));

    // U2 has no prefs → the key is omitted on both
    const [m2, p2] = await both((r) => r.findUserPreferences(U2));
    expect(norm(m2)).toEqual({ _id: U2 });
    expect(norm(p2)).toEqual(norm(m2));

    const [mU, pU] = await both((r) => r.updateUserPreferences(U2, { email: false, inApp: true }));
    expect(norm(mU)).toEqual({ _id: U2, notificationPreferences: { email: false, inApp: true } });
    expect(norm(pU)).toEqual(norm(mU));
  });
});
