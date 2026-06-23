/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — org/office-repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Office CRUD + countUsersInOffice. Runs only when a Postgres URL is present;
 * SKIPS otherwise. Asserts identical behaviour + traps:
 *   • soft-delete excluded on reads; isDeleted/deletedAt (select:false) omitted
 *   • listOffices substring search (name/code) + name-asc sort
 *   • the unique-code violation (23505 → {code:11000}) rejects on create AND a
 *     code-collision update; a code freed by soft-delete re-creates
 *   • countUsersInOffice counts only live users
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
require('../../models/User'); // countUsersInOffice ref — not loaded eagerly by the repo split
const repo = require('../../domains/org/office-repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const O1 = hex(1111); const O2 = hex(1112); const OD = hex(1113);
const U1 = hex(1121); const U2 = hex(1122); const UD = hex(1123); const U3 = hex(1124);

const offProj = (o) => (o == null ? null : { name: o.name, code: o.code, address: o.address, timezone: o.timezone });

describePg('PG-parity: org/office-repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('Office').init(); // partial-unique code among live
    const db = mongoose.connection.db;

    await db.collection(coll('Office')).insertMany([
      { _id: oid(O1), name: 'Alpha HQ', code: 'NYC', address: '1 St', timezone: 'America/New_York', isDeleted: false },
      { _id: oid(O2), name: 'Beta Site', code: 'LON', address: '', timezone: '', isDeleted: false },
      { _id: oid(OD), name: 'Gone', code: 'OLD', address: '', timezone: '', isDeleted: true },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', name: 'Uno', officeId: oid(O1), isDeleted: false },
      { _id: oid(U2), empCode: 'U2', name: 'Dos', officeId: oid(O1), isDeleted: false },
      { _id: oid(UD), empCode: 'U3', name: 'Gone', officeId: oid(O1), isDeleted: true },
      { _id: oid(U3), empCode: 'U4', name: 'Tre', officeId: oid(O2), isDeleted: false },
    ]);

    await query('TRUNCATE offices, users');
    await query(`INSERT INTO offices(id,name,code,address,timezone,is_deleted) VALUES
      ($1,'Alpha HQ','NYC','1 St','America/New_York',false),($2,'Beta Site','LON','','',false),($3,'Gone','OLD','','',true)`, [O1, O2, OD]);
    await query(`INSERT INTO users(id,emp_code,name,office_id,is_deleted) VALUES
      ($1,'U1','Uno',$5,false),($2,'U2','Dos',$5,false),($3,'U3','Gone',$5,true),($4,'U4','Tre',$6,false)`, [U1, U2, UD, U3, O1, O2]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('listOffices (live only, name asc) + search + findById (deleted hidden) — identical', async () => {
    const [m, p] = await both((r) => r.listOffices({}));
    expect(m.map((o) => offProj(o).code)).toEqual(['NYC', 'LON']); // Alpha, Beta by name asc; Gone excluded
    expect(p.map(offProj)).toEqual(m.map(offProj));

    const [mS, pS] = await both((r) => r.listOffices({ search: 'lon' })); // case-insensitive code match
    expect(mS.map((o) => o.code)).toEqual(['LON']);
    expect(pS.map(offProj)).toEqual(mS.map(offProj));

    const [m1, p1] = await both((r) => r.findOfficeByIdLean(O1));
    expect(offProj(m1)).toEqual({ name: 'Alpha HQ', code: 'NYC', address: '1 St', timezone: 'America/New_York' });
    expect(offProj(p1)).toEqual(offProj(m1));
    expect(await repo.impls.mongo.findOfficeByIdLean(OD)).toBeNull();
    expect(await repo.impls.pg.findOfficeByIdLean(OD)).toBeNull();
  });

  test('createOffice + code-collision (create & update) reject {code:11000} — identical', async () => {
    const [mC, pC] = await both((r) => r.createOffice({ name: 'New', code: 'SFO', address: 'A', timezone: 'PT' }));
    expect(offProj(mC)).toEqual({ name: 'New', code: 'SFO', address: 'A', timezone: 'PT' });
    expect(offProj(pC)).toEqual(offProj(mC));

    await expect(repo.impls.mongo.createOffice({ name: 'Dup', code: 'NYC' })).rejects.toMatchObject({ code: 11000 });
    await expect(repo.impls.pg.createOffice({ name: 'Dup', code: 'NYC' })).rejects.toMatchObject({ code: 11000 });
    // rename O2 onto the live 'NYC' code → collision
    await expect(repo.impls.mongo.updateOfficeById(O2, { code: 'NYC' })).rejects.toMatchObject({ code: 11000 });
    await expect(repo.impls.pg.updateOfficeById(O2, { code: 'NYC' })).rejects.toMatchObject({ code: 11000 });
  });

  test('updateOfficeById patch + countUsersInOffice (live only) — identical', async () => {
    const [mU, pU] = await both((r) => r.updateOfficeById(O1, { name: 'Alpha Tower', address: '2 Ave' }));
    expect(offProj(mU)).toMatchObject({ name: 'Alpha Tower', code: 'NYC', address: '2 Ave' });
    expect(offProj(pU)).toEqual(offProj(mU));

    const [mN, pN] = await both((r) => r.countUsersInOffice(O1)); // U1,U2 live; UD deleted
    expect(mN).toBe(2); expect(pN).toBe(2);
  });

  test('softDeleteOffice hides + frees the code for re-create — identical', async () => {
    const [mD, pD] = await both((r) => r.softDeleteOffice(O2));
    expect(mD).toBeTruthy(); expect(pD).toBeTruthy();
    expect(await repo.impls.mongo.findOfficeByIdLean(O2)).toBeNull();
    expect(await repo.impls.pg.findOfficeByIdLean(O2)).toBeNull();
    // 'LON' is now free (the deleted O2 keeps no live claim) → re-create succeeds on both
    const [mR, pR] = await both((r) => r.createOffice({ name: 'Reborn', code: 'LON' }));
    expect(offProj(mR).code).toBe('LON'); expect(offProj(pR).code).toBe('LON');
  });
});
