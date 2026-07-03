/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — planning repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * A4 TNA → annual plan (domains/planning) on the dual-backend Unit of Work:
 * TrainingRequest CRUD + demand aggregation, TrainingPlan upsert (jsonb item
 * subdocs), and the scheduleItem transaction composition (cohort insert + plan
 * link + approved→planned flip + A1 budget row, all-or-nothing). Runs only when
 * a Postgres URL is present (the pg-parity CI job); SKIPS otherwise.
 *
 * Uses MongoMemoryReplSet (Mongo transactions need a replica set).
 *
 * Pinned identical on both backends:
 *   1. createRequest defaults + lean reads omit soft-delete fields + list filters;
 *   2. updateRequest / softDeleteRequest lifecycle;
 *   3. aggregateDemand (kind/quarter/department grouping, rejected + deleted
 *      excluded, fiscalYear window, null department bucket, demand-desc order);
 *   4. upsertPlan create/update (item defaults, FRESH subdoc _ids on every
 *      $set, createdBy preserved on update);
 *   5. scheduleItem tx commit — cohort + plan link + planned flip + budget;
 *   6. rollback — a throw discards ALL four writes;
 *   7. duplicate classCode → Mongo-style { code: 11000 } (23505 mapped);
 *   8. label lookups — deleted skills still labelled (no find-hook), deleted
 *      departments hidden, programs never hidden.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const uow = require('../../domains/_shared/unit-of-work');
const planningRepo = require('../../domains/planning/repository');
const financeRepo = require('../../domains/finance/repository');
const Class = require('../../models/Class');
const Budget = require('../../models/Budget');
const TrainingRequest = require('../../models/TrainingRequest');
const TrainingPlan = require('../../models/TrainingPlan');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const plain = (d) => (d && d.toObject ? d.toObject() : d);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Shared ids (Mongo casts hex → ObjectId; PG stores text).
const P1 = hex(0x901); const P2 = hex(0x902);           // learning programs
const SK1 = hex(0x911); const SK2 = hex(0x912);         // skills (SK2 deleted)
const D1 = hex(0x921); const D2 = hex(0x922);           // departments (D2 deleted)
const U1 = hex(0x931);                                  // a user id (createdBy)

const BACKENDS = {
  mongo: {
    run: uow.impls.mongo,
    repo: planningRepo.impls.mongo,
    finance: financeRepo.impls.mongo,
    id: (h) => oid(h),
    cohortByCode: (code) => Class.findOne({ classCode: code }).lean(),
    budgetCount: (fy) => Budget.countDocuments({ fiscalYear: fy }),
  },
  pg: {
    run: uow.impls.pg,
    repo: planningRepo.impls.pg,
    finance: financeRepo.impls.pg,
    id: (h) => h,
    cohortByCode: async (code) => {
      const { rows } = await query(`SELECT * FROM classes WHERE class_code = $1 AND is_deleted = false`, [code]);
      return rows[0] || null;
    },
    budgetCount: async (fy) => {
      const { rows } = await query(`SELECT count(*)::int AS n FROM budgets WHERE fiscal_year = $1`, [fy]);
      return rows[0].n;
    },
  },
};

const seed = async () => {
  // Mongo (raw collections — deterministic ids, hooks don't apply to seeding)
  const db = mongoose.connection.db;
  await Promise.all(
    ['LearningProgram', 'Skill', 'Department', 'TrainingRequest', 'TrainingPlan', 'Class', 'Budget']
      .map((m) => db.collection(coll(m)).deleteMany({})),
  );
  await db.collection(coll('LearningProgram')).insertMany([
    { _id: oid(P1), code: 'LEAD', name: 'Leadership', status: 'active' },
    { _id: oid(P2), code: 'SAFE', name: 'Safety', status: 'active' },
  ]);
  await db.collection(coll('Skill')).insertMany([
    { _id: oid(SK1), name: 'Excel', isDeleted: false },
    { _id: oid(SK2), name: 'Negotiation', isDeleted: true },
  ]);
  await db.collection(coll('Department')).insertMany([
    { _id: oid(D1), name: 'Operations', code: 'OPS', isDeleted: false },
    { _id: oid(D2), name: 'Old Dept', code: 'OLD', isDeleted: true },
  ]);
  // PG
  await query('TRUNCATE training_requests, training_plans, classes, budgets, learning_programs, skills, departments');
  await query(
    `INSERT INTO learning_programs(id, code, name, status) VALUES
      ($1,'LEAD','Leadership','active'), ($2,'SAFE','Safety','active')`, [P1, P2]);
  await query(
    `INSERT INTO skills(id, name, is_deleted) VALUES
      ($1,'Excel',false), ($2,'Negotiation',true)`, [SK1, SK2]);
  await query(
    `INSERT INTO departments(id, name, code, is_deleted) VALUES
      ($1,'Operations','OPS',false), ($2,'Old Dept','OLD',true)`, [D1, D2]);
};

// Seed one request through the repo (exercises each backend's create path).
const makeRequest = (b, over = {}) =>
  b.repo.createRequest({
    target: { kind: 'program', id: b.id(P1) },
    headcount: 5,
    targetQuarter: '2026-Q1',
    ...over,
  });

describePg('PG-parity: planning repository', () => {
  let replSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), { dbName: 'pg_parity_planning' });
    await Promise.all([Class.init(), TrainingRequest.init(), TrainingPlan.init()]); // unique indexes (dup-key test)
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (replSet) await replSet.stop();
    await closePool();
  });

  beforeEach(seed);

  test('createRequest defaults + reads omit soft fields + list filters — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      const a = plain(await makeRequest(b, { departmentId: b.id(D1) }));
      expect(a).toMatchObject({
        headcount: 5, status: 'submitted', priority: 'med', rationale: '',
        targetQuarter: '2026-Q1',
      });
      expect(String(a.target.id)).toBe(P1);
      await sleep(10); // distinct createdAt for the sort pin
      const c = plain(await makeRequest(b, {
        target: { kind: 'skill', id: b.id(SK1) }, headcount: 2,
        targetQuarter: '2026-Q2', priority: 'high', rationale: 'Q2 skill push',
      }));
      expect(c).toMatchObject({ priority: 'high', rationale: 'Q2 skill push' });

      const found = await b.repo.findRequestById(String(a._id));
      expect(String(found._id)).toBe(String(a._id));
      expect(found).not.toHaveProperty('isDeleted'); // select:false ⇔ omitted column
      expect(found).not.toHaveProperty('deletedAt');

      const all = await b.repo.listRequests({});
      expect(all).toHaveLength(2);
      expect(String(all[0]._id)).toBe(String(c._id)); // createdAt desc — newest first
      expect(await b.repo.listRequests({ 'target.kind': 'skill' })).toHaveLength(1);
      expect(await b.repo.listRequests({ targetQuarter: '2026-Q1' })).toHaveLength(1);
      expect(await b.repo.listRequests({ departmentId: String(b.id(D1)) })).toHaveLength(1);
      expect(await b.repo.listRequests({ status: 'approved' })).toHaveLength(0);
      /* eslint-enable no-await-in-loop */
    }
  });

  test('updateRequest + softDeleteRequest lifecycle — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      const a = plain(await makeRequest(b));
      const approved = await b.repo.updateRequest(String(a._id), { status: 'approved' });
      expect(approved.status).toBe('approved');
      expect(approved).not.toHaveProperty('isDeleted');

      const gone = await b.repo.softDeleteRequest(String(a._id));
      expect(String(gone._id)).toBe(String(a._id));
      expect(await b.repo.findRequestById(String(a._id))).toBeNull();
      expect(await b.repo.listRequests({})).toHaveLength(0);
      expect(await b.repo.softDeleteRequest(String(a._id))).toBeNull(); // second flip → null
      /* eslint-enable no-await-in-loop */
    }
  });

  test('aggregateDemand: grouping/exclusions/order — identical', async () => {
    const out = {};
    for (const [name, b] of Object.entries(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      await makeRequest(b, { headcount: 5, departmentId: b.id(D1) });                        // P1 Q1 D1
      await makeRequest(b, { headcount: 3, targetQuarter: '2026-Q2' });                      // P1 Q2 null-dept
      await makeRequest(b, { target: { kind: 'program', id: b.id(P2) }, headcount: 4, departmentId: b.id(D1) }); // P2 Q1 D1
      const rej = plain(await makeRequest(b, { headcount: 2 }));
      await b.repo.updateRequest(String(rej._id), { status: 'rejected' });                   // excluded everywhere
      await makeRequest(b, { target: { kind: 'skill', id: b.id(SK1) }, headcount: 7 });      // skill Q1 null-dept
      await makeRequest(b, { headcount: 9, targetQuarter: '2027-Q1', departmentId: b.id(D1) }); // outside FY2026
      const del = plain(await makeRequest(b, { headcount: 11 }));
      await b.repo.softDeleteRequest(String(del._id));                                       // excluded (soft-deleted)

      const norm = (rows) => rows.map((r) => ({ key: r._id == null ? null : String(r._id), demand: r.demand, count: r.count }));
      out[name] = {
        byProgram: norm(await b.repo.aggregateDemand({ by: 'program', fiscalYear: '2026' })),
        byQuarter: norm(await b.repo.aggregateDemand({ by: 'quarter', fiscalYear: '2026' })),
        byDepartment: norm(await b.repo.aggregateDemand({ by: 'department' })),
      };
      /* eslint-enable no-await-in-loop */
    }
    expect(out.mongo.byProgram).toEqual([
      { key: P1, demand: 8, count: 2 }, { key: P2, demand: 4, count: 1 },
    ]);
    expect(out.mongo.byQuarter).toEqual([
      { key: '2026-Q1', demand: 16, count: 3 }, { key: '2026-Q2', demand: 3, count: 1 },
    ]);
    expect(out.mongo.byDepartment).toEqual([
      { key: D1, demand: 18, count: 3 }, { key: null, demand: 10, count: 2 },
    ]);
    expect(out.pg).toEqual(out.mongo);
  });

  test('upsertPlan create/update: item defaults, fresh _ids, createdBy kept — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      const created = await b.repo.upsertPlan('2026', {
        items: [
          { target: { kind: 'program', id: b.id(P1) }, quarter: '2026-Q1', demand: 8, estCostMinor: 500000 },
          { target: { kind: 'skill', id: b.id(SK1) } }, // schema defaults apply
        ],
        createdBy: b.id(U1),
      });
      expect(created.fiscalYear).toBe('2026');
      expect(created.items).toHaveLength(2);
      expect(created.items[0]).toMatchObject({ quarter: '2026-Q1', demand: 8, estCostMinor: 500000, cohortIds: [] });
      expect(created.items[1]).toMatchObject({ quarter: '', demand: 0, estCostMinor: 0, cohortIds: [] });
      expect(created.items[0]._id).toBeTruthy();
      expect(String(created.createdBy)).toBe(U1);
      expect(created).not.toHaveProperty('isDeleted');

      const updated = await b.repo.upsertPlan('2026', {
        items: [{ target: { kind: 'program', id: b.id(P1) }, quarter: '2026-Q1', demand: 9 }],
      });
      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].demand).toBe(9);
      // $set creates NEW subdocs → fresh _id every upsert
      expect(String(updated.items[0]._id)).not.toBe(String(created.items[0]._id));
      expect(String(updated.createdBy)).toBe(U1); // preserved when not passed

      const read = await b.repo.findPlan('2026');
      expect(String(read._id)).toBe(String(updated._id));
      expect(await b.repo.findPlan('2030')).toBeNull();
      /* eslint-enable no-await-in-loop */
    }
  });

  // Composes the 4 writes exactly like use-cases.scheduleItem.
  const runScheduleItemTx = (b, itemId, classCode) =>
    b.run(async (tx) => {
      const cohort = await b.repo.createCohortClass(
        { classCode, courseName: 'Leadership', programId: b.id(P1), totalSessions: 10 }, tx);
      const matched = await b.repo.pushCohortIdToPlanItem('2026', itemId, cohort._id, tx);
      await b.repo.markRequestsPlanned('program', b.id(P1), '2026-Q1', tx);
      const budget = await b.finance.createBudget({
        fiscalYear: '2026', programId: b.id(P1), amountMinor: 500000, currency: 'VND',
        label: 'TNA 2026 · Leadership', createdBy: null,
      }, tx);
      return { cohort, matched, budgetId: budget._id };
    });

  const seedPlanAndApproved = async (b) => {
    const plan = await b.repo.upsertPlan('2026', {
      items: [{ target: { kind: 'program', id: b.id(P1) }, quarter: '2026-Q1', demand: 8, estCostMinor: 500000 }],
    });
    for (const q of ['2026-Q1', '2026-Q1', '2026-Q2']) {
      const r = plain(await makeRequest(b, { targetQuarter: q })); // eslint-disable-line no-await-in-loop
      await b.repo.updateRequest(String(r._id), { status: 'approved' }); // eslint-disable-line no-await-in-loop
    }
    return String(plan.items[0]._id);
  };

  test('scheduleItem tx: cohort + plan link + planned flip + budget commit atomically — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      const itemId = await seedPlanAndApproved(b);
      const out = await runScheduleItemTx(b, itemId, 'TNA001');
      expect(out.matched).toBe(1);

      const cohort = await b.cohortByCode('TNA001');
      expect(cohort).toBeTruthy();
      expect(cohort.status).toBe('Ongoing'); // model default ⇔ pg default
      const plan = await b.repo.findPlan('2026');
      expect(plan.items[0].cohortIds.map(String)).toContain(String(out.cohort._id));
      expect(await b.repo.listRequests({ status: 'planned' })).toHaveLength(2); // only the Q1 approved pair
      expect(await b.repo.listRequests({ status: 'approved' })).toHaveLength(1); // Q2 untouched
      expect(await b.budgetCount('2026')).toBe(1);
      /* eslint-enable no-await-in-loop */
    }
  });

  test('rollback: a throw after all four writes discards everything — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      const itemId = await seedPlanAndApproved(b);
      await expect(
        b.run(async (tx) => {
          const cohort = await b.repo.createCohortClass(
            { classCode: 'TNA002', courseName: 'Leadership', programId: b.id(P1), totalSessions: 10 }, tx);
          await b.repo.pushCohortIdToPlanItem('2026', itemId, cohort._id, tx);
          await b.repo.markRequestsPlanned('program', b.id(P1), '2026-Q1', tx);
          await b.finance.createBudget({
            fiscalYear: '2026', programId: b.id(P1), amountMinor: 500000, currency: 'VND',
          }, tx);
          throw new Error('boom after all writes');
        }),
      ).rejects.toThrow('boom after all writes');

      expect(await b.cohortByCode('TNA002')).toBeNull();
      expect((await b.repo.findPlan('2026')).items[0].cohortIds).toEqual([]);
      expect(await b.repo.listRequests({ status: 'planned' })).toHaveLength(0);
      expect(await b.repo.listRequests({ status: 'approved' })).toHaveLength(3);
      expect(await b.budgetCount('2026')).toBe(0);
      /* eslint-enable no-await-in-loop */
    }
  });

  test('duplicate classCode → Mongo-style code 11000, tx rolled back — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      const itemId = await seedPlanAndApproved(b);
      await runScheduleItemTx(b, itemId, 'TNA003'); // first commit wins

      let err = null;
      try {
        await runScheduleItemTx(b, itemId, 'TNA003'); // same code again
      } catch (e) { err = e; }
      expect(err && err.code).toBe(11000);

      const plan = await b.repo.findPlan('2026');
      expect(plan.items[0].cohortIds).toHaveLength(1); // no second link leaked
      expect(await b.budgetCount('2026')).toBe(1);     // no second budget leaked
      /* eslint-enable no-await-in-loop */
    }
  });

  test('label lookups: deleted skill labelled, deleted department hidden — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      const programs = await b.repo.findProgramsByIds([b.id(P1), b.id(P2)]);
      expect(programs.map((p) => p.name).sort()).toEqual(['Leadership', 'Safety']);
      expect(programs[0]).toHaveProperty('code');

      // Skill has NO find-hook → the deleted skill is still labelled.
      const skills = await b.repo.findSkillsByIds([b.id(SK1), b.id(SK2)]);
      expect(skills.map((s) => s.name).sort()).toEqual(['Excel', 'Negotiation']);

      // Department HAS the hook → the deleted department is hidden.
      const depts = await b.repo.findDepartmentsByIds([b.id(D1), b.id(D2)]);
      expect(depts.map((d) => d.name)).toEqual(['Operations']);

      expect(await b.repo.findProgramsByIds([])).toEqual([]);
      /* eslint-enable no-await-in-loop */
    }
  });
});
