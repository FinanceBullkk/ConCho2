/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — room repository CRUD (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * First WHOLE-repository (write) port. Runs only when a Postgres URL is present
 * (CI pg-parity sets PG_URL; locally PG_PROTOTYPE_URL → Neon); SKIPS otherwise.
 * Drives the SAME CRUD ops on both backends and asserts identical observable
 * behaviour + the model's traps:
 *   • setters: code UPPERCASE, name trimmed;
 *   • populate('officeId') excludes a soft-deleted office (→ officeId:null);
 *   • partial-unique `code` among LIVE rooms (reusable after soft-delete);
 *   • office-scope + literal substring search + name order;
 *   • soft-delete hides the row from subsequent reads;
 *   • countFutureSessionsForRoom counts only future sessions.
 * Backend-generated _id/timestamps are ignored — business fields are compared.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const roomRepo = require('../../domains/room/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const OFFICE_A = hex(101); // live
const OFFICE_D = hex(102); // soft-deleted

// Business projection — ignores backend _id / timestamps. officeId is either a
// populated {_id,name,code} or a raw id string depending on the method.
const projOffice = (o) => {
  if (o == null) return null;
  // populated subdoc has a `name`; a raw ObjectId/string id does not (a bson
  // ObjectId is typeof 'object' too, so test on `.name`, not typeof).
  if (typeof o === 'object' && o.name !== undefined) return { _id: String(o._id), name: o.name, code: o.code };
  return String(o);
};
const proj = (r) => (r == null ? null : {
  name: r.name, code: r.code, seats: r.seats, isActive: r.isActive, officeId: projOffice(r.officeId),
});

// Run an op on both backends → [mongoResult, pgResult].
const both = (fn) => Promise.all([fn(roomRepo.impls.mongo), fn(roomRepo.impls.pg)]);

describePg('PG-parity: room repository CRUD (whole-repo write port)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('Room').init();   // build the partial-unique code index
    await mongoose.model('Office').init();
    const db = mongoose.connection.db;
    await db.collection('offices').insertMany([
      { _id: new mongoose.Types.ObjectId(OFFICE_A), name: 'Office A', code: 'HCM', isDeleted: false },
      { _id: new mongoose.Types.ObjectId(OFFICE_D), name: 'Office D', code: 'HN', isDeleted: true },
    ]);

    await query('TRUNCATE offices, rooms, schedules');
    await query(
      `INSERT INTO offices(id,name,code,is_deleted) VALUES ($1,$2,$3,false),($4,$5,$6,true)`,
      [OFFICE_A, 'Office A', 'HCM', OFFICE_D, 'Office D', 'HN'],
    );
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('findLiveOffice: live → {_id}, soft-deleted → null (both backends)', async () => {
    const [ml, pl] = await both((r) => r.findLiveOffice(OFFICE_A));
    expect(String(ml._id)).toBe(OFFICE_A);
    expect(String(pl._id)).toBe(OFFICE_A);
    const [md, pd] = await both((r) => r.findLiveOffice(OFFICE_D));
    expect(md).toBeNull();
    expect(pd).toBeNull();
  });

  test('createRoom: code UPPERCASEd + trimmed, defaults, un-populated officeId — identical', async () => {
    const [m, p] = await both((r) => r.createRoom({ name: '  Lab 1 ', code: 'hcm-a1', officeId: OFFICE_A }));
    // code uppercased + name trimmed by the setters; seats null; isActive true.
    expect(proj(m)).toEqual({ name: 'Lab 1', code: 'HCM-A1', seats: null, isActive: true, officeId: OFFICE_A });
    expect(proj(p)).toEqual(proj(m));
  });

  test('findRoomByIdLean populates office; a soft-deleted office → officeId:null — identical', async () => {
    // create one in the live office and one in the soft-deleted office on each
    // backend — same codes both sides (separate DBs, no cross-backend collision).
    const mk = (r, office, code) => r.createRoom({ name: 'R', code, officeId: office });
    const [mLive, pLive] = await both((r) => mk(r, OFFICE_A, 'LIVEROOM'));
    const [mDead, pDead] = await both((r) => mk(r, OFFICE_D, 'DEADROOM'));

    const live = await Promise.all([
      roomRepo.impls.mongo.findRoomByIdLean(mLive._id),
      roomRepo.impls.pg.findRoomByIdLean(pLive._id),
    ]);
    expect(proj(live[0]).officeId).toEqual({ _id: OFFICE_A, name: 'Office A', code: 'HCM' });
    expect(proj(live[1])).toEqual(proj(live[0]));

    const dead = await Promise.all([
      roomRepo.impls.mongo.findRoomByIdLean(mDead._id),
      roomRepo.impls.pg.findRoomByIdLean(pDead._id),
    ]);
    expect(proj(dead[0]).officeId).toBeNull(); // populate drops the soft-deleted office
    expect(proj(dead[1]).officeId).toBeNull();
  });

  test('partial-unique code: 2nd LIVE room with same code rejected; reusable after soft-delete — both', async () => {
    const code = 'UNIQX';
    const [m1, p1] = await both((r) => r.createRoom({ name: 'U', code, officeId: OFFICE_A }));
    expect(proj(m1).code).toBe(code);
    expect(proj(p1).code).toBe(code);

    // duplicate LIVE code → both backends reject (reuse-after-soft-delete covered next)
    await expect(roomRepo.impls.mongo.createRoom({ name: 'U2', code, officeId: OFFICE_A })).rejects.toBeDefined();
    await expect(roomRepo.impls.pg.createRoom({ name: 'U2', code, officeId: OFFICE_A })).rejects.toBeDefined();
  });

  test('soft-delete frees the unique code + hides the row from reads — both', async () => {
    const code = 'REUSE1';
    const [m1, p1] = await both((r) => r.createRoom({ name: 'X', code, officeId: OFFICE_A }));
    await Promise.all([
      roomRepo.impls.mongo.softDeleteRoom(m1._id),
      roomRepo.impls.pg.softDeleteRoom(p1._id),
    ]);
    // hidden from subsequent reads
    const reads = await Promise.all([
      roomRepo.impls.mongo.findRoomByIdLean(m1._id),
      roomRepo.impls.pg.findRoomByIdLean(p1._id),
    ]);
    expect(reads[0]).toBeNull();
    expect(reads[1]).toBeNull();
    // code reusable now
    const [m2, p2] = await both((r) => r.createRoom({ name: 'X2', code, officeId: OFFICE_A }));
    expect(proj(m2).code).toBe(code);
    expect(proj(p2).code).toBe(code);
  });

  test('listRooms: office-scope + literal search + name order — identical sequences', async () => {
    const byCode = (rows) => rows.map((r) => proj(r));
    const [mAll, pAll] = await both((r) => r.listRooms({ officeId: OFFICE_A }));
    expect(byCode(pAll)).toEqual(byCode(mAll)); // same projection sequence, same order

    const [mS, pS] = await both((r) => r.listRooms({ search: 'Lab' }));
    expect(byCode(pS)).toEqual(byCode(mS));
  });

  test('updateRoomById: normalizes code, returns populated office — identical', async () => {
    const [m1, p1] = await both((r) => r.createRoom({ name: 'Up', code: 'upd1', officeId: OFFICE_A }));
    const upd = await Promise.all([
      roomRepo.impls.mongo.updateRoomById(m1._id, { seats: 20, code: 'upd1-x' }),
      roomRepo.impls.pg.updateRoomById(p1._id, { seats: 20, code: 'upd1-x' }),
    ]);
    expect(proj(upd[0])).toMatchObject({ seats: 20, code: 'UPD1-X', officeId: { _id: OFFICE_A, name: 'Office A', code: 'HCM' } });
    expect(proj(upd[1])).toEqual(proj(upd[0]));
  });

  test('countFutureSessionsForRoom: only future sessions, identical count', async () => {
    const [mR, pR] = await both((r) => r.createRoom({ name: 'Cnt', code: 'cnt1', officeId: OFFICE_A }));
    const future = new Date(Date.now() + 7 * 86400000);
    const past = new Date(Date.now() - 7 * 86400000);
    // seed schedules referencing each backend's own room id
    const db = mongoose.connection.db;
    await db.collection('schedules').insertMany([
      { _id: new mongoose.Types.ObjectId(), classId: new mongoose.Types.ObjectId(), roomId: new mongoose.Types.ObjectId(mR._id), startTime: future, endTime: future, status: 'scheduled' },
      { _id: new mongoose.Types.ObjectId(), classId: new mongoose.Types.ObjectId(), roomId: new mongoose.Types.ObjectId(mR._id), startTime: past, endTime: past, status: 'scheduled' },
    ]);
    await query(
      `INSERT INTO schedules(id,class_id,room_id,start_time,end_time,status) VALUES
        ($1,$2,$3,$4,$5,'scheduled'),($6,$7,$8,$9,$10,'scheduled')`,
      [hex(901), hex(801), pR._id, future.toISOString(), future.toISOString(),
        hex(902), hex(801), pR._id, past.toISOString(), past.toISOString()],
    );
    const [mc, pc] = await Promise.all([
      roomRepo.impls.mongo.countFutureSessionsForRoom(mR._id),
      roomRepo.impls.pg.countFutureSessionsForRoom(pR._id),
    ]);
    expect(mc).toBe(1);
    expect(pc).toBe(1);
  });

  test('findRoomedSessionsInRange: only in-range SCHEDULED sessions, identical (both backends)', async () => {
    const [mR, pR] = await both((r) => r.createRoom({ name: 'Util', code: 'util1', officeId: OFFICE_A }));
    const to = new Date();
    const from = new Date(to.getTime() - 5 * 86400000);
    const inRange = new Date(to.getTime() - 1 * 86400000);   // counted
    const beforeRange = new Date(to.getTime() - 10 * 86400000); // excluded (out of range)
    const db = mongoose.connection.db;
    await db.collection('schedules').insertMany([
      { _id: new mongoose.Types.ObjectId(), classId: new mongoose.Types.ObjectId(), roomId: new mongoose.Types.ObjectId(mR._id), startTime: inRange, endTime: new Date(inRange.getTime() + 3600000), status: 'scheduled' },
      { _id: new mongoose.Types.ObjectId(), classId: new mongoose.Types.ObjectId(), roomId: new mongoose.Types.ObjectId(mR._id), startTime: beforeRange, endTime: beforeRange, status: 'scheduled' },
      { _id: new mongoose.Types.ObjectId(), classId: new mongoose.Types.ObjectId(), roomId: new mongoose.Types.ObjectId(mR._id), startTime: inRange, endTime: inRange, status: 'cancelled' },
    ]);
    await query(
      `INSERT INTO schedules(id,class_id,room_id,start_time,end_time,status) VALUES
        ($1,$2,$3,$4,$5,'scheduled'),($6,$7,$8,$9,$10,'scheduled'),($11,$12,$13,$14,$15,'cancelled')`,
      [hex(911), hex(801), pR._id, inRange.toISOString(), new Date(inRange.getTime() + 3600000).toISOString(),
        hex(912), hex(801), pR._id, beforeRange.toISOString(), beforeRange.toISOString(),
        hex(913), hex(801), pR._id, inRange.toISOString(), inRange.toISOString()],
    );
    const [ms, ps] = await Promise.all([
      roomRepo.impls.mongo.findRoomedSessionsInRange({ roomIds: [mR._id], from, to }),
      roomRepo.impls.pg.findRoomedSessionsInRange({ roomIds: [pR._id], from, to }),
    ]);
    expect(ms).toHaveLength(1);
    expect(ps).toHaveLength(1);
    expect(String(ms[0].roomId)).toBe(String(mR._id));
    expect(String(ps[0].roomId)).toBe(String(pR._id));
    expect(ms[0].startTime).toBeInstanceOf(Date);
    expect(ps[0].startTime).toBeInstanceOf(Date);
  });
});
