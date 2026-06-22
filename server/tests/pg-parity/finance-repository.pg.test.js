/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — finance repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * CostEntry + Budget CRUD, cost roll-ups, budget-vs-actual inputs, label
 * lookups, tenant currency. Runs only when a Postgres URL is present; SKIPS
 * otherwise. Asserts identical behaviour + traps:
 *   • CostEntry scope subobject ↔ flat scope_* columns; update replaces scope
 *   • soft-delete excluded on reads AND aggregations (aggregate hook)
 *   • create defaults (type 'other') + currency uppercased
 *   • rollup _id null bucket + totalMinor-desc sort; sum over a window
 *   • label lookups hide deleted dept/class/vendor; programs are never hidden
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/finance/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const P1 = hex(611);
const D1 = hex(621); const DD = hex(622);
const C1 = hex(631);
const V1 = hex(641); const VD = hex(642);
const CE1 = hex(651); const CE2 = hex(652); const CE3 = hex(653); const CE4 = hex(654); const CED = hex(655);
const B1 = hex(661); const B2 = hex(662); const BD = hex(663);

const FY = { from: day(1), to: new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)) };

const scopeProj = (s) => (s == null ? null : {
  programId: s.programId ? String(s.programId) : null,
  cohortId: s.cohortId ? String(s.cohortId) : null,
  sessionId: s.sessionId ? String(s.sessionId) : null,
  departmentId: s.departmentId ? String(s.departmentId) : null,
  vendorId: s.vendorId ? String(s.vendorId) : null,
});
const costProj = (c) => (c == null ? null : {
  scope: scopeProj(c.scope), type: c.type, amountMinor: c.amountMinor,
  currency: c.currency, poRef: c.poRef, note: c.note,
});
const budgetProj = (b) => (b == null ? null : {
  fiscalYear: b.fiscalYear, departmentId: b.departmentId ? String(b.departmentId) : null,
  programId: b.programId ? String(b.programId) : null, amountMinor: b.amountMinor,
  currency: b.currency, label: b.label,
});
const rollProj = (rows) => rows.map((r) => ({ id: r._id == null ? null : String(r._id), totalMinor: r.totalMinor, count: r.count }));

describePg('PG-parity: finance repository', () => {
  let mem;
  let mCE; let pCE; let mB; let pB; // captured from create

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('Setting')).insertOne({ key: 'LND_COST_CONFIG', value: { currency: 'EUR' } });
    await db.collection(coll('LearningProgram')).insertOne({ _id: oid(P1), name: 'Prog 1', code: 'PG-1' });
    await db.collection(coll('Department')).insertMany([
      { _id: oid(D1), name: 'Dept 1', isDeleted: false },
      { _id: oid(DD), name: 'Dept Gone', isDeleted: true },
    ]);
    await db.collection(coll('Class')).insertOne({ _id: oid(C1), classCode: 'CC1', courseName: 'Course 1', isDeleted: false });
    await db.collection(coll('Vendor')).insertMany([
      { _id: oid(V1), name: 'Vendor 1', isDeleted: false },
      { _id: oid(VD), name: 'Vendor Gone', isDeleted: true },
    ]);

    const ce = (id, scope, type, amt, d, del = false) => ({
      _id: oid(id), scope, type, amountMinor: amt, currency: 'EUR', incurredOn: day(d),
      poRef: '', note: '', isDeleted: del, createdAt: day(d),
    });
    await db.collection(coll('CostEntry')).insertMany([
      ce(CE1, { programId: oid(P1), departmentId: oid(D1) }, 'trainer', 10000, 2),
      ce(CE2, { programId: oid(P1) }, 'venue', 5000, 5),
      ce(CE3, {}, 'other', 3000, 8),
      ce(CE4, { vendorId: oid(V1) }, 'vendor', 7000, 10),
      ce(CED, { programId: oid(P1) }, 'trainer', 99999, 3, true), // deleted → excluded everywhere
    ]);
    await db.collection(coll('Budget')).insertMany([
      { _id: oid(B1), fiscalYear: '2026', departmentId: oid(D1), programId: null, amountMinor: 50000, currency: 'EUR', label: 'Dept budget', isDeleted: false, createdAt: day(1) },
      { _id: oid(B2), fiscalYear: '2026', departmentId: null, programId: oid(P1), amountMinor: 20000, currency: 'EUR', label: 'Prog budget', isDeleted: false, createdAt: day(2) },
      { _id: oid(BD), fiscalYear: '2026', departmentId: null, programId: null, amountMinor: 1, currency: 'EUR', label: 'Gone', isDeleted: true, createdAt: day(3) },
    ]);

    await query('TRUNCATE settings, learning_programs, departments, classes, vendors, cost_entries, budgets');
    await query(`INSERT INTO settings(id,key,value) VALUES ($1,'LND_COST_CONFIG','{"currency":"EUR"}')`, [hex(601)]);
    await query(`INSERT INTO learning_programs(id,name,code) VALUES ($1,'Prog 1','PG-1')`, [P1]);
    await query(`INSERT INTO departments(id,name,code,is_deleted) VALUES ($1,'Dept 1','DEP1',false),($2,'Dept Gone','DEP2',true)`, [D1, DD]);
    await query(`INSERT INTO classes(id,class_code,course_name,is_deleted) VALUES ($1,'CC1','Course 1',false)`, [C1]);
    await query(`INSERT INTO vendors(id,name,is_deleted) VALUES ($1,'Vendor 1',false),($2,'Vendor Gone',true)`, [V1, VD]);
    const ipg = (id, sp, sd, sv, type, amt, d, del = false) => query(
      `INSERT INTO cost_entries(id,scope_program_id,scope_department_id,scope_vendor_id,type,amount_minor,currency,incurred_on,is_deleted)
       VALUES ($1,$2,$3,$4,$5,$6,'EUR',$7,$8)`, [id, sp, sd, sv, type, amt, day(d).toISOString(), del]);
    await ipg(CE1, P1, D1, null, 'trainer', 10000, 2);
    await ipg(CE2, P1, null, null, 'venue', 5000, 5);
    await ipg(CE3, null, null, null, 'other', 3000, 8);
    await ipg(CE4, null, null, V1, 'vendor', 7000, 10);
    await ipg(CED, P1, null, null, 'trainer', 99999, 3, true);
    await query(`INSERT INTO budgets(id,fiscal_year,department_id,program_id,amount_minor,currency,label,is_deleted,created_at) VALUES
      ($1,'2026',$2,null,50000,'EUR','Dept budget',false,$3),($4,'2026',null,$5,20000,'EUR','Prog budget',false,$6),($7,'2026',null,null,1,'EUR','Gone',true,$8)`,
    [B1, D1, day(1).toISOString(), B2, P1, day(2).toISOString(), BD, day(3).toISOString()]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('getTenantCurrency reads the configured setting — identical', async () => {
    const [m, p] = await both((r) => r.getTenantCurrency());
    expect(m).toBe('EUR'); expect(p).toBe('EUR');
  });

  test('listCostEntries: scope/type/fiscalYear filters + soft-delete excluded + sort — identical', async () => {
    // all live in FY2026, sorted incurredOn desc: CE4(10),CE3(8),CE2(5),CE1(2); CED deleted out
    const f = { incurredOn: { $gte: FY.from, $lte: FY.to } };
    const [mA, pA] = await both((r) => r.listCostEntries(f));
    expect(mA.map((c) => String(c._id))).toEqual([CE4, CE3, CE2, CE1]);
    expect(pA.map(costProj)).toEqual(mA.map(costProj));

    const [mP, pP] = await both((r) => r.listCostEntries({ 'scope.programId': P1 }));
    expect(mP.map((c) => String(c._id)).sort()).toEqual([CE1, CE2].sort());
    expect(pP.map(costProj)).toEqual(mP.map(costProj));

    const [mT, pT] = await both((r) => r.listCostEntries({ type: 'vendor' }));
    expect(mT.map((c) => String(c._id))).toEqual([CE4]);
    expect(pT.map(costProj)).toEqual(mT.map(costProj));
  });

  test('findCostEntryById: found + deleted hidden — identical', async () => {
    const [m, p] = await both((r) => r.findCostEntryById(CE1));
    expect(costProj(m)).toEqual({ scope: scopeProj({ programId: P1, departmentId: D1 }), type: 'trainer', amountMinor: 10000, currency: 'EUR', poRef: '', note: '' });
    expect(costProj(p)).toEqual(costProj(m));
    expect(await repo.impls.mongo.findCostEntryById(CED)).toBeNull();
    expect(await repo.impls.pg.findCostEntryById(CED)).toBeNull();
  });

  test('createCostEntry: scope mapping + defaults + currency uppercased — identical', async () => {
    const data = { scope: { programId: P1, cohortId: C1 }, amountMinor: 4242, currency: 'eur', incurredOn: day(12), createdBy: null };
    [mCE, pCE] = await both((r) => r.createCostEntry(data));
    const expected = { scope: scopeProj({ programId: P1, cohortId: C1 }), type: 'other', amountMinor: 4242, currency: 'EUR', poRef: '', note: '' };
    expect(costProj(mCE)).toEqual(expected); // type defaults 'other', currency upper
    expect(costProj(pCE)).toEqual(costProj(mCE));
  });

  test('updateCostEntry replaces scope + soft-delete not updatable — identical', async () => {
    const [mU, pU] = await both((r) =>
      r.updateCostEntry(r === repo.impls.mongo ? mCE._id : pCE._id, { scope: { departmentId: D1 }, note: 'patched' }));
    // scope fully replaced → only departmentId remains, program/cohort cleared
    expect(costProj(mU)).toMatchObject({ scope: scopeProj({ departmentId: D1 }), note: 'patched' });
    expect(scopeProj(mU.scope).programId).toBeNull();
    expect(costProj(pU)).toEqual(costProj(mU));
    expect(await repo.impls.mongo.updateCostEntry(CED, { note: 'x' })).toBeNull();
    expect(await repo.impls.pg.updateCostEntry(CED, { note: 'x' })).toBeNull();
  });

  test('sumCostEntries + rollupCostEntries (program/type) exclude deleted — identical', async () => {
    // live in FY2026 (excl CED 99999, plus the created CE 4242 at day 12): 10000+5000+3000+7000+4242 = 29242, count 5
    const [mS, pS] = await both((r) => r.sumCostEntries({ from: FY.from, to: FY.to }));
    expect(mS).toEqual({ totalMinor: 29242, count: 5 });
    expect(pS).toEqual(mS);

    const [mR, pR] = await both((r) => r.rollupCostEntries({ groupField: 'type', from: FY.from, to: FY.to }));
    expect(rollProj(pR)).toEqual(rollProj(mR));
    // 'other' bucket = CE3(3000)+createdCE(4242)=7242; 'trainer'=10000; 'venue'=5000; 'vendor'=7000
    const byType = Object.fromEntries(rollProj(mR).map((r) => [r.id, r.totalMinor]));
    expect(byType).toMatchObject({ trainer: 10000, venue: 5000, vendor: 7000, other: 7242 });

    const [mRp, pRp] = await both((r) => r.rollupCostEntries({ groupField: 'scope.programId', from: FY.from, to: FY.to }));
    expect(rollProj(pRp)).toEqual(rollProj(mRp));
    // null bucket present (CE3 + CE4 have no program)
    expect(rollProj(mRp).some((r) => r.id === null)).toBe(true);
  });

  test('Budget CRUD + listCostScopesInRange + label lookups (deleted hidden) — identical', async () => {
    const [mL, pL] = await both((r) => r.listBudgets({ fiscalYear: '2026' }));
    expect(mL.map((b) => String(b._id))).toEqual([B2, B1]); // fiscalYear desc, createdAt desc (B2 day2 > B1 day1)
    expect(pL.map(budgetProj)).toEqual(mL.map(budgetProj));

    [mB, pB] = await both((r) => r.createBudget({ fiscalYear: '2026', programId: P1, amountMinor: 9000, currency: 'eur' }));
    expect(budgetProj(mB)).toMatchObject({ fiscalYear: '2026', programId: P1, amountMinor: 9000, currency: 'EUR' });
    expect(budgetProj(pB)).toEqual(budgetProj(mB));

    const [mU, pU] = await both((r) => r.updateBudget(r === repo.impls.mongo ? mB._id : pB._id, { amountMinor: 9500, label: 'up' }));
    expect(budgetProj(mU)).toMatchObject({ amountMinor: 9500, label: 'up' });
    expect(budgetProj(pU)).toEqual(budgetProj(mU));

    const [mScope, pScope] = await both((r) => r.listCostScopesInRange({ from: FY.from, to: FY.to }));
    expect(pScope.map((c) => ({ s: scopeProj(c.scope), a: c.amountMinor })).sort((a, b) => a.a - b.a))
      .toEqual(mScope.map((c) => ({ s: scopeProj(c.scope), a: c.amountMinor })).sort((a, b) => a.a - b.a));

    // label lookups: deleted dept/vendor hidden; program never hidden
    const [mDep, pDep] = await both((r) => r.findDepartmentsByIds([D1, DD]));
    expect(mDep.map((d) => d.name)).toEqual(['Dept 1']); // DD hidden
    expect(pDep.map((d) => d.name)).toEqual(['Dept 1']);
    const [mVen, pVen] = await both((r) => r.findVendorsByIds([V1, VD]));
    expect(mVen.map((v) => v.name)).toEqual(['Vendor 1']);
    expect(pVen.map((v) => v.name)).toEqual(['Vendor 1']);
    const [mProg, pProg] = await both((r) => r.findProgramsByIds([P1]));
    expect(mProg.map((p) => p.name)).toEqual(['Prog 1']);
    expect(pProg.map((p) => p.name)).toEqual(['Prog 1']);
  });

  test('softDeleteBudget + softDeleteCostEntry hide the row — identical', async () => {
    const [mD, pD] = await both((r) => r.softDeleteBudget(r === repo.impls.mongo ? mB._id : pB._id));
    expect(mD).toBeTruthy(); expect(pD).toBeTruthy();
    expect(await repo.impls.mongo.findBudgetById(mB._id)).toBeNull();
    expect(await repo.impls.pg.findBudgetById(pB._id)).toBeNull();

    const [mC, pC] = await both((r) => r.softDeleteCostEntry(r === repo.impls.mongo ? mCE._id : pCE._id));
    expect(mC).toBeTruthy(); expect(pC).toBeTruthy();
    expect(await repo.impls.mongo.findCostEntryById(mCE._id)).toBeNull();
    expect(await repo.impls.pg.findCostEntryById(pCE._id)).toBeNull();
  });
});
