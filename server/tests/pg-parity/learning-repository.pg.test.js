/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — learning repository: programs + cohorts (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The biggest Wave-B port. Runs only when a Postgres URL is present; SKIPS
 * otherwise. Asserts identical behaviour for the LearningProgram catalog (jsonb
 * policy blobs, case-insensitive name/legacy lookups, unique code/name) and the
 * Cohort (Class) CRUD (full programId populate, soft-delete/restore, the Ongoing
 * guard, team/schedule counts, the booked-sessions + monthly-completion aggs).
 * Mongoose docs are JSON-normalised before comparison. The transactional cohort
 * archive is exercised per-method (session ignored in PG — deferred to Wave-D).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
require('../../models/Setting'); // Class.courseName validator does mongoose.model('Setting') (fail-open w/o data)
const repo = require('../../domains/learning/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const pproj = (raw) => {
  const p = norm(raw);
  return p == null ? null : {
    code: p.code, name: p.name, description: p.description, category: p.category,
    defaultSessionCount: p.defaultSessionCount, deliveryMode: p.deliveryMode, schedulingMode: p.schedulingMode,
    completionPolicy: p.completionPolicy, certificateValidityDays: p.certificateValidityDays ?? null,
    capacityPolicy: p.capacityPolicy, facilitatorPolicy: p.facilitatorPolicy, recertifyPolicy: p.recertifyPolicy,
    customFields: p.customFields || {}, prerequisitePrograms: (p.prerequisitePrograms || []).map(String).sort(),
    status: p.status, legacyCourseName: p.legacyCourseName,
  };
};
const cproj = (raw) => {
  const c = norm(raw);
  if (c == null) return null;
  const prog = c.programId;
  return {
    classCode: c.classCode, courseName: c.courseName, totalSessions: c.totalSessions ?? null, status: c.status,
    customFields: c.customFields || {}, teacherIds: (c.teacherIds || []).map(String).sort(),
    program: prog && typeof prog === 'object' && prog.name !== undefined
      ? { code: prog.code, name: prog.name } : (prog ? 'RAWID' : null),
  };
};

const PROG = { code: 'eng-101', name: 'English 101', category: 'english', deliveryMode: 'hybrid',
  completionPolicy: { attendanceThresholdPercent: 80, requiresAssessment: true },
  capacityPolicy: { maxParticipants: 20 }, legacyCourseName: 'Legacy English' };

describePg('PG-parity: learning repository (programs + cohorts)', () => {
  let mem;
  const id = {};

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('LearningProgram').init(); // unique code + name(ci)
    await mongoose.model('Certificate').init();
    await mongoose.model('Class').init();           // Ongoing partial-unique

    await query('TRUNCATE learning_programs, classes, teams, schedules, enrollments, certificates');

    const [mP, pP] = await both((r) => r.createProgram(PROG));
    const [mP2, pP2] = await both((r) => r.createProgram({ code: 'on-1', name: 'Onboarding', category: 'onboarding' }));
    id.mP = mP._id; id.pP = pP._id; id.mP2 = mP2._id; id.pP2 = pP2._id;

    const [mC, pC] = await both((r) => r.createCohort({ classCode: 'C-100', courseName: 'English 101', programId: r === repo.impls.pg ? pP._id : mP._id, totalSessions: 8, teacherIds: [hex(701)] }));
    id.mC = mC._id; id.pC = pC._id;

    // counts / aggregations scoped to each backend's cohort + program
    const seedScoped = async (isPg) => {
      const cid = String(isPg ? pC._id : mC._id);
      const pid = String(isPg ? pP._id : mP._id);
      const teams = [{ id: hex(711), c: cid, del: false }, { id: hex(712), c: cid, del: true }]; // deleted team excluded
      const sched = [
        { id: hex(721), c: cid, st: 'scheduled', t: Date.UTC(2026, 0, 5, 10) }, // distinct start_time — {classId,startTime}
        { id: hex(722), c: cid, st: 'scheduled', t: Date.UTC(2026, 0, 5, 11) }, // partial-unique WHERE scheduled
        { id: hex(723), c: cid, st: 'cancelled', t: Date.UTC(2026, 0, 5, 12) },
      ];
      const enr = [{ id: hex(731), u: hex(741), c: cid, st: 'Active' }, { id: hex(732), u: hex(742), c: cid, st: 'Active' }, { id: hex(733), u: hex(743), c: cid, st: 'Completed' }];
      const certs = [
        { id: hex(751), p: pid, on: Date.UTC(2026, 0, 10) }, { id: hex(752), p: pid, on: Date.UTC(2026, 0, 20) }, { id: hex(753), p: pid, on: Date.UTC(2026, 1, 5) },
      ];
      if (isPg) {
        await query(`INSERT INTO teams(id,class_id,is_deleted) VALUES ($1,$2,$3),($4,$5,$6)`, [teams[0].id, teams[0].c, false, teams[1].id, teams[1].c, true]);
        await query(`INSERT INTO schedules(id,class_id,start_time,status) VALUES ($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)`,
          sched.flatMap((s) => [s.id, s.c, new Date(s.t).toISOString(), s.st]));
        await query(`INSERT INTO enrollments(id,user_id,class_id,status) VALUES ($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)`,
          enr.flatMap((e) => [e.id, e.u, e.c, e.st]));
        await query(`INSERT INTO certificates(id,program_id,status,issued_at,is_deleted) VALUES ($1,$2,'Issued',$3,false),($4,$5,'Issued',$6,false),($7,$8,'Issued',$9,false)`,
          certs.flatMap((c) => [c.id, c.p, new Date(c.on).toISOString()]));
      } else {
        const db = mongoose.connection.db;
        await db.collection(coll('Team')).insertMany(teams.map((t) => ({ _id: oid(t.id), classId: oid(t.c), isDeleted: t.del })));
        await db.collection(coll('Schedule')).insertMany(sched.map((s) => ({ _id: oid(s.id), classId: oid(s.c), startTime: new Date(s.t), endTime: new Date(s.t + 3600000), status: s.st })));
        await db.collection(coll('Enrollment')).insertMany(enr.map((e) => ({ _id: oid(e.id), userId: oid(e.u), classId: oid(e.c), status: e.st })));
        await db.collection(coll('Certificate')).insertMany(certs.map((c) => ({
          _id: oid(c.id), programId: oid(c.p), cohortId: oid(c.id), status: 'Issued', issuedAt: new Date(c.on), isDeleted: false,
          certificateNumber: `CN-${c.id}`, verificationCode: `VC-${c.id}`,
        })));
      }
    };
    await seedScoped(false);
    await seedScoped(true);
  }, 90_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('createProgram: full fields + jsonb policy defaults merged — identical', async () => {
    const [m, p] = await both((r) => r.findProgramById(r === repo.impls.pg ? id.pP : id.mP));
    expect(pproj(m)).toEqual({
      code: 'ENG-101', name: 'English 101', description: '', category: 'english',
      defaultSessionCount: 1, deliveryMode: 'hybrid', schedulingMode: 'admin_scheduled',
      completionPolicy: { attendanceThresholdPercent: 80, requiresAssessment: true, requiresFeedback: false },
      certificateValidityDays: null, capacityPolicy: { maxParticipants: 20, maxParticipantsPerSession: null },
      facilitatorPolicy: { assignmentRequired: false, visibility: 'all_facilitators' }, recertifyPolicy: { autoAssign: false },
      customFields: {}, prerequisitePrograms: [], status: 'active', legacyCourseName: 'Legacy English',
    });
    expect(pproj(p)).toEqual(pproj(m));
  });

  test('findProgramByName + findProgramByLegacyCourseName: case-insensitive — identical', async () => {
    const [mN, pN] = await both((r) => r.findProgramByName('ENGLISH 101'));
    expect(pproj(mN).code).toBe('ENG-101');
    expect(pproj(pN)).toEqual(pproj(mN));
    const [mL, pL] = await both((r) => r.findProgramByLegacyCourseName('legacy english'));
    expect(pproj(mL).code).toBe('ENG-101');
    expect(pproj(pL)).toEqual(pproj(mL));
  });

  test('findPrograms: filter + (category,name) order — identical', async () => {
    const [m, p] = await both((r) => r.findPrograms());
    expect(m.map((x) => x.code)).toEqual(['ENG-101', 'ON-1']); // english < onboarding
    expect(p.map((x) => x.code)).toEqual(m.map((x) => x.code));
    const [mF, pF] = await both((r) => r.findPrograms({ category: 'english' }));
    expect(mF.map((x) => x.code)).toEqual(['ENG-101']);
    expect(pF.map((x) => x.code)).toEqual(mF.map((x) => x.code));
  });

  test('unique program code + name(ci) rejected on both backends', async () => {
    await expect(repo.impls.mongo.createProgram({ code: 'ENG-101', name: 'Other' })).rejects.toBeDefined();
    await expect(repo.impls.pg.createProgram({ code: 'ENG-101', name: 'Other' })).rejects.toBeDefined();
    await expect(repo.impls.mongo.createProgram({ code: 'NEW-1', name: 'english 101' })).rejects.toBeDefined(); // ci dup name
    await expect(repo.impls.pg.createProgram({ code: 'NEW-2', name: 'ENGLISH 101' })).rejects.toBeDefined();
  });

  test('updateProgramById: scalar + jsonb policy — identical', async () => {
    const upd = await Promise.all([
      repo.impls.mongo.updateProgramById(id.mP2, { status: 'archived', capacityPolicy: { maxParticipants: 5 } }),
      repo.impls.pg.updateProgramById(id.pP2, { status: 'archived', capacityPolicy: { maxParticipants: 5 } }),
    ]);
    expect(pproj(upd[0])).toMatchObject({ status: 'archived', capacityPolicy: { maxParticipants: 5, maxParticipantsPerSession: null } });
    expect(pproj(upd[1])).toEqual(pproj(upd[0]));
  });

  test('createCohort (raw programId) + findCohortById (full populate) — identical', async () => {
    const [mC, pC] = await both((r) => r.findCohortById(r === repo.impls.pg ? id.pC : id.mC));
    expect(cproj(mC)).toEqual({
      classCode: 'C-100', courseName: 'English 101', totalSessions: 8, status: 'Ongoing',
      customFields: {}, teacherIds: [hex(701)], program: { code: 'ENG-101', name: 'English 101' },
    });
    expect(cproj(pC)).toEqual(cproj(mC));
  });

  test('cohort counts + booked-sessions + monthly completions — identical', async () => {
    const cid = (r) => (r === repo.impls.pg ? id.pC : id.mC);
    const pid = (r) => (r === repo.impls.pg ? id.pP : id.mP);
    const [mT, pT] = await both((r) => r.countTeamsByCohort(cid(r)));
    expect(mT).toBe(1); expect(pT).toBe(1); // deleted team excluded
    const [mS, pS] = await both((r) => r.countSchedulesByCohort(cid(r)));
    expect(mS).toBe(3); expect(pS).toBe(3); // includes cancelled (no soft-delete on Schedule)
    const [mB, pB] = await both((r) => r.countSessionsByCohortIds([cid(r)]));
    expect(mB[String(cid(repo.impls.mongo))]).toBe(2); // scheduled only
    expect(pB[String(cid(repo.impls.pg))]).toBe(2);
    const [mM, pM] = await both((r) => r.monthlyCompletions(pid(r), new Date(Date.UTC(2026, 0, 1))));
    const sortM = (rows) => rows.map((x) => ({ y: x._id.y, m: x._id.m, count: x.count })).sort((a, b) => a.m - b.m);
    expect(sortM(mM)).toEqual([{ y: 2026, m: 1, count: 2 }, { y: 2026, m: 2, count: 1 }]);
    expect(sortM(pM)).toEqual(sortM(mM));
  });

  test('cohort archive (close enrollments + soft-delete) + restore + Ongoing guard — identical', async () => {
    const cid = (r) => (r === repo.impls.pg ? id.pC : id.mC);
    // Ongoing guard: a 2nd Ongoing cohort with the same classCode is rejected
    await expect(repo.impls.mongo.createCohort({ classCode: 'C-100', courseName: 'Dup', status: 'Ongoing' })).rejects.toBeDefined();
    await expect(repo.impls.pg.createCohort({ classCode: 'C-100', courseName: 'Dup', status: 'Ongoing' })).rejects.toBeDefined();

    const [mE, pE] = await both((r) => r.closeEnrollmentsByCohort(cid(r), new Date()));
    expect(mE.modifiedCount).toBe(2); expect(pE.modifiedCount).toBe(2); // 2 Active → Dropped

    await both((r) => r.softDeleteCohort(cid(r), new Date()));
    expect(await repo.impls.mongo.findCohortById(id.mC)).toBeNull(); // hidden
    expect(await repo.impls.pg.findCohortById(id.pC)).toBeNull();
    const [mD, pD] = await both((r) => r.findDeletedCohorts());
    expect(mD.map((c) => c.classCode)).toContain('C-100');
    expect(pD.map((c) => c.classCode)).toContain('C-100');

    await both((r) => r.restoreCohortById(cid(r)));
    expect(await repo.impls.mongo.findCohortById(id.mC)).toBeTruthy(); // back
    expect(await repo.impls.pg.findCohortById(id.pC)).toBeTruthy();
  });
});
