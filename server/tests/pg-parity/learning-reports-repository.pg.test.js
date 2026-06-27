/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — domains/learning/reports repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The 20-method read surface behind the completion-rollup / compliance /
 * org-export / A5 training-hours reports. Runs only when a Postgres URL is
 * present; SKIPS otherwise. Pins the trap-prone behaviours:
 *   • soft-delete drops (deleted class/user/cert/eval/feedback/attempt excluded;
 *     Evaluation's find-HOOK filters even though the source query omits isDeleted);
 *   • distinct-over-array (Schedule.distinct('enrolledUsers') ⇔ unnest+DISTINCT)
 *     UNION active enrollments;
 *   • nested populate (compliance pathId→programs as full objects; org user
 *     dept+manager) → LEFT JOIN … is_deleted=false (deleted ref → null);
 *   • dueDate UTC day-boundary range; ATTENDED (P/L) filter; programId path
 *     resolution; listActiveCohorts scope ({} vs {_id:{$in}}); cert sort.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/learning/reports/repository'); // registers most models
require('../../models/Department'); // ensure Department registered for populate

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const sortStr = (a) => [...a].map(String).sort();

// Seed ids (shared hex; Mongo casts → ObjectId, PG stores hex text).
const P1 = hex(901); const P2 = hex(902);
const PATH1 = hex(911);
const C1 = hex(921); const C2 = hex(922); const CDEL = hex(923);
const U1 = hex(931); const U2 = hex(932); const U3 = hex(933); const UDEL = hex(934); const MGR = hex(935);
const DENG = hex(941); const DDEL = hex(942);
const S1 = hex(951); const S2 = hex(952); const SC = hex(953); const SOUT = hex(954);
const E1 = hex(961); const E2 = hex(962); const E3 = hex(963);
const AT1 = hex(971); const AT2 = hex(972); const AT3 = hex(973);
const CERT1 = hex(981); const CERT2 = hex(982); const CERT3 = hex(983); const CERTDEL = hex(984);
const EVAL1 = hex(991); const EVALDEL = hex(992);
const FB1 = hex(0xA01); const FBDEL = hex(0xA02);
const ATM1 = hex(0xA11); const ATM2 = hex(0xA12); const ATMDEL = hex(0xA13);
const A1 = hex(0xA21); const A2 = hex(0xA22); const AARCH = hex(0xA23); const ADEL = hex(0xA24);

const D = (s) => `2026-05-${s}T03:00:00.000Z`;
const POLICY = { attendanceThresholdPercent: 80, requiresAssessment: true, requiresFeedback: false };

describePg('PG-parity: domains/learning/reports repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    // ── Mongo seed ──
    await db.collection(coll('LearningProgram')).insertMany([
      { _id: oid(P1), code: 'P-1', name: 'Prog One', category: 'technical', status: 'active', completionPolicy: POLICY, certificateValidityDays: 365 },
      { _id: oid(P2), code: 'P-2', name: 'Prog Two', category: 'onboarding', status: 'active' },
    ]);
    await db.collection(coll('LearningPath')).insertMany([
      { _id: oid(PATH1), code: 'PATH-1', title: 'Path One', status: 'active', programs: [oid(P1), oid(P2)], isDeleted: false },
    ]);
    await db.collection(coll('Department')).insertMany([
      { _id: oid(DENG), code: 'ENG', name: 'Engineering', isDeleted: false },
      { _id: oid(DDEL), code: 'DEL', name: 'Deleted', isDeleted: true },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'C-1', courseName: 'Course1', programId: oid(P1), teacherIds: [oid(U1)], isDeleted: false },
      { _id: oid(C2), classCode: 'C-2', courseName: 'Course2', programId: oid(P2), teacherIds: [], isDeleted: false },
      { _id: oid(CDEL), classCode: 'C-D', courseName: 'CourseD', isDeleted: true },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'E1', name: 'Alice', email: 'a@x.io', department: 'Eng', departmentId: oid(DENG), managerId: oid(MGR), role: 'Participant', isDeleted: false },
      { _id: oid(U2), empCode: 'E2', name: 'Bob', email: 'b@x.io', department: 'Eng', departmentId: oid(DENG), role: 'Participant', isDeleted: false },
      { _id: oid(U3), empCode: 'E3', name: 'Carol', email: 'c@x.io', department: 'Ops', role: 'Participant', isDeleted: false },
      { _id: oid(UDEL), empCode: 'E4', name: 'Dave', role: 'Participant', isDeleted: true },
      { _id: oid(MGR), empCode: 'M1', name: 'Mgr', email: 'm@x.io', role: 'Admin', isDeleted: false },
    ]);
    await db.collection(coll('Schedule')).insertMany([
      { _id: oid(S1), classId: oid(C1), startTime: new Date(D('10')), endTime: new Date(D('10')), status: 'scheduled', enrolledUsers: [oid(U1), oid(U2)] },
      { _id: oid(S2), classId: oid(C1), startTime: new Date(D('15')), endTime: new Date(D('15')), status: 'scheduled', enrolledUsers: [oid(U3)] },
      { _id: oid(SC), classId: oid(C1), startTime: new Date(D('20')), status: 'cancelled', enrolledUsers: [oid(U1)] },
      { _id: oid(SOUT), classId: oid(C2), startTime: new Date('2026-06-10T03:00:00.000Z'), status: 'scheduled', enrolledUsers: [oid(U1)] },
    ]);
    await db.collection(coll('Enrollment')).insertMany([
      { _id: oid(E1), userId: oid(U1), classId: oid(C1), status: 'Active' },
      { _id: oid(E2), userId: oid(U3), classId: oid(C1), status: 'Active' },
      { _id: oid(E3), userId: oid(U2), classId: oid(C1), status: 'Dropped' },
    ]);
    await db.collection(coll('Attendance')).insertMany([
      { _id: oid(AT1), scheduleId: oid(S1), userId: oid(U1), status: 'P' },
      { _id: oid(AT2), scheduleId: oid(S1), userId: oid(U2), status: 'A' },
      { _id: oid(AT3), scheduleId: oid(S2), userId: oid(U3), status: 'L' },
    ]);
    // verificationCode is required:true + unique on the model — set distinct values
    // (raw insertMany bypasses validation, so omitting them yielded null×4 → E11000
    // once the unique index finished building; flaky under the multi-file pg-parity run).
    await db.collection(coll('Certificate')).insertMany([
      { _id: oid(CERT1), userId: oid(U1), cohortId: oid(C1), programId: oid(P1), certificateNumber: 'N1', verificationCode: 'VC1', status: 'Issued', issuedAt: new Date(D('10')), validityDays: 365, isDeleted: false },
      { _id: oid(CERT2), userId: oid(U2), cohortId: oid(C1), programId: oid(P1), certificateNumber: 'N2', verificationCode: 'VC2', status: 'Revoked', issuedAt: new Date(D('11')), isDeleted: false },
      { _id: oid(CERT3), userId: oid(U1), cohortId: oid(C2), programId: oid(P1), certificateNumber: 'N3', verificationCode: 'VC3', status: 'Issued', issuedAt: new Date(D('12')), isDeleted: false },
      { _id: oid(CERTDEL), userId: oid(U3), cohortId: oid(C1), programId: oid(P1), certificateNumber: 'N4', verificationCode: 'VC4', status: 'Issued', issuedAt: new Date(D('13')), isDeleted: true },
    ]);
    await db.collection(coll('Evaluation')).insertMany([
      { _id: oid(EVAL1), classId: oid(C1), userId: oid(U1), isDeleted: false },
      { _id: oid(EVALDEL), classId: oid(C1), userId: oid(U2), isDeleted: true },
    ]);
    await db.collection(coll('Feedback')).insertMany([
      { _id: oid(FB1), cohortId: oid(C1), userId: oid(U1), rating: 5, isDeleted: false },
      { _id: oid(FBDEL), cohortId: oid(C1), userId: oid(U2), rating: 4, isDeleted: true },
    ]);
    await db.collection(coll('AssessmentAttempt')).insertMany([
      { _id: oid(ATM1), assessmentId: oid(hex(0xB01)), cohortId: oid(C1), userId: oid(U1), passed: true, isDeleted: false },
      { _id: oid(ATM2), assessmentId: oid(hex(0xB01)), cohortId: oid(C1), userId: oid(U2), passed: false, isDeleted: false },
      { _id: oid(ATMDEL), assessmentId: oid(hex(0xB01)), cohortId: oid(C1), userId: oid(U3), passed: true, isDeleted: true },
    ]);
    await db.collection(coll('Assignment')).insertMany([
      { _id: oid(A1), title: 'A1', targetType: 'program', programId: oid(P1), dueDate: new Date(D('12')), status: 'active', isDeleted: false, userIds: [oid(U1)], departmentIds: [] },
      { _id: oid(A2), title: 'A2', targetType: 'path', pathId: oid(PATH1), dueDate: new Date(D('20')), status: 'active', isDeleted: false, userIds: [], departmentIds: [] },
      { _id: oid(AARCH), title: 'AARCH', targetType: 'program', programId: oid(P1), dueDate: new Date(D('14')), status: 'archived', isDeleted: false },
      { _id: oid(ADEL), title: 'ADEL', targetType: 'program', programId: oid(P1), dueDate: new Date(D('14')), status: 'active', isDeleted: true },
    ]);

    // ── PG seed ──
    await query('TRUNCATE learning_programs, learning_paths, departments, classes, users, schedules, enrollments, attendances, certificates, evaluations, feedbacks, assessment_attempts, assignments');
    await query(
      `INSERT INTO learning_programs(id,code,name,category,status,completion_policy,certificate_validity_days) VALUES
        ($1,'P-1','Prog One','technical','active',$3::jsonb,365),
        ($2,'P-2','Prog Two','onboarding','active',NULL,NULL)`,
      [P1, P2, JSON.stringify(POLICY)]);
    await query(`INSERT INTO learning_paths(id,code,title,status,programs,is_deleted) VALUES ($1,'PATH-1','Path One','active',ARRAY[$2,$3]::text[],false)`, [PATH1, P1, P2]);
    await query(`INSERT INTO departments(id,code,name,is_deleted) VALUES ($1,'ENG','Engineering',false),($2,'DEL','Deleted',true)`, [DENG, DDEL]);
    await query(
      `INSERT INTO classes(id,class_code,course_name,program_id,teacher_ids,is_deleted) VALUES
        ($1,'C-1','Course1',$4,ARRAY[$6]::text[],false),
        ($2,'C-2','Course2',$5,'{}'::text[],false),
        ($3,'C-D','CourseD',NULL,'{}'::text[],true)`, [C1, C2, CDEL, P1, P2, U1]);
    await query(
      `INSERT INTO users(id,emp_code,name,email,department,department_id,manager_id,role,is_deleted) VALUES
        ($1,'E1','Alice','a@x.io','Eng',$6,$5,'Participant',false),
        ($2,'E2','Bob','b@x.io','Eng',$6,NULL,'Participant',false),
        ($3,'E3','Carol','c@x.io','Ops',NULL,NULL,'Participant',false),
        ($4,'E4','Dave',NULL,NULL,NULL,NULL,'Participant',true),
        ($5,'M1','Mgr','m@x.io',NULL,NULL,NULL,'Admin',false)`, [U1, U2, U3, UDEL, MGR, DENG]);
    await query(
      `INSERT INTO schedules(id,class_id,start_time,end_time,status,enrolled_users) VALUES
        ($1,$5,$9,$9,'scheduled',ARRAY[$6,$7]::text[]),
        ($2,$5,$10,$10,'scheduled',ARRAY[$8]::text[]),
        ($3,$5,$11,NULL,'cancelled',ARRAY[$6]::text[]),
        ($4,$12,$13,NULL,'scheduled',ARRAY[$6]::text[])`,
      [S1, S2, SC, SOUT, C1, U1, U2, U3, D('10'), D('15'), D('20'), C2, '2026-06-10T03:00:00.000Z']);
    await query(
      `INSERT INTO enrollments(id,user_id,class_id,status) VALUES ($1,$4,$7,'Active'),($2,$6,$7,'Active'),($3,$5,$7,'Dropped')`,
      [E1, E2, E3, U1, U2, U3, C1]);
    await query(
      `INSERT INTO attendances(id,schedule_id,user_id,status) VALUES ($1,$4,$6,'P'),($2,$4,$7,'A'),($3,$5,$8,'L')`,
      [AT1, AT2, AT3, S1, S2, U1, U2, U3]);
    await query(
      `INSERT INTO certificates(id,user_id,cohort_id,program_id,certificate_number,status,issued_at,validity_days,is_deleted) VALUES
        ($1,$5,$8,$10,'N1','Issued',$11,365,false),
        ($2,$6,$8,$10,'N2','Revoked',$12,NULL,false),
        ($3,$5,$9,$10,'N3','Issued',$13,NULL,false),
        ($4,$7,$8,$10,'N4','Issued',$14,NULL,true)`,
      [CERT1, CERT2, CERT3, CERTDEL, U1, U2, U3, C1, C2, P1, D('10'), D('11'), D('12'), D('13')]);
    await query(
      `INSERT INTO evaluations(id,class_id,user_id,is_deleted) VALUES ($1,$3,$4,false),($2,$3,$5,true)`,
      [EVAL1, EVALDEL, C1, U1, U2]);
    await query(
      `INSERT INTO feedbacks(id,cohort_id,user_id,rating,is_deleted) VALUES ($1,$3,$4,5,false),($2,$3,$5,4,true)`,
      [FB1, FBDEL, C1, U1, U2]);
    await query(
      `INSERT INTO assessment_attempts(id,assessment_id,cohort_id,user_id,passed,is_deleted) VALUES
        ($1,$7,$4,$5,true,false),($2,$7,$4,$6,false,false),($3,$7,$4,$8,true,true)`,
      [ATM1, ATM2, ATMDEL, C1, U1, U2, hex(0xB01), U3]);
    await query(
      `INSERT INTO assignments(id,title,target_type,program_id,path_id,due_date,status,is_deleted,user_ids,department_ids) VALUES
        ($1,'A1','program',$5,NULL,$7,'active',false,ARRAY[$8]::text[],'{}'::text[]),
        ($2,'A2','path',NULL,$6,$9,'active',false,'{}'::text[],'{}'::text[]),
        ($3,'AARCH','program',$5,NULL,$10,'archived',false,'{}'::text[],'{}'::text[]),
        ($4,'ADEL','program',$5,NULL,$10,'active',true,'{}'::text[],'{}'::text[])`,
      [A1, A2, AARCH, ADEL, P1, PATH1, D('12'), U1, D('20'), D('14')]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  // ── Cohort / program ────────────────────────────────────
  test('findCohort: shape; deleted cohort → null', async () => {
    const proj = (x) => { const n = norm(x); return n == null ? null : { classCode: n.classCode, courseName: n.courseName, programId: n.programId ? String(n.programId) : null, teacherIds: sortStr(n.teacherIds), isDeleted: n.isDeleted }; };
    const [m, p] = await both((r) => r.findCohort(C1));
    expect(proj(m)).toEqual({ classCode: 'C-1', courseName: 'Course1', programId: P1, teacherIds: [U1], isDeleted: false });
    expect(proj(p)).toEqual(proj(m));
    const [md, pd] = await both((r) => r.findCohort(CDEL));
    expect(md).toBeNull(); expect(pd).toBeNull();
  });

  test('listActiveCohorts: {} all live + {_id:$in} scope', async () => {
    const codes = (rows) => sortStr(norm(rows).map((c) => c.classCode));
    const [m, p] = await both((r) => r.listActiveCohorts({}));
    expect(codes(m)).toEqual(['C-1', 'C-2']); // CDEL excluded
    expect(codes(p)).toEqual(codes(m));
    const [ms, ps] = await both((r) => r.listActiveCohorts({ _id: { $in: [C1] } }));
    expect(codes(ms)).toEqual(['C-1']); expect(codes(ps)).toEqual(codes(ms));
  });

  test('listProgramsByIds + findProgramName', async () => {
    const proj = (rows) => Object.fromEntries(norm(rows).map((r) => [r.name, { policy: r.completionPolicy || null, validity: r.certificateValidityDays ?? null }]));
    const [m, p] = await both((r) => r.listProgramsByIds([P1, P2]));
    expect(proj(m)).toEqual({ 'Prog One': { policy: POLICY, validity: 365 }, 'Prog Two': { policy: null, validity: null } });
    expect(proj(p)).toEqual(proj(m));
    const [mn, pn] = await both((r) => r.findProgramName(P1));
    expect(mn).toBe('Prog One'); expect(pn).toBe('Prog One');
    const [mz, pz] = await both((r) => r.findProgramName(null));
    expect(mz).toBe(''); expect(pz).toBe('');
  });

  test('listCohortLearnerIds: roster (scheduled) ∪ active enrollments', async () => {
    const [m, p] = await both((r) => r.listCohortLearnerIds(C1));
    expect(sortStr(m)).toEqual(sortStr([U1, U2, U3])); // S1[U1,U2]+S2[U3] ∪ enr{U1,U3}
    expect(sortStr(p)).toEqual(sortStr(m));
  });

  test('findUsers: soft-deleted excluded', async () => {
    const proj = (rows) => sortStr(norm(rows).map((u) => u.empCode));
    const [m, p] = await both((r) => r.findUsers([U1, U2, UDEL]));
    expect(proj(m)).toEqual(['E1', 'E2']); // UDEL dropped
    expect(proj(p)).toEqual(proj(m));
  });

  // ── Cohort evidence ─────────────────────────────────────
  test('listCohortCertificates / listIssuedCertificates', async () => {
    const nums = (rows) => sortStr(norm(rows).map((c) => c.certificateNumber || `${c.cohortId}:${c.userId}`));
    const [m, p] = await both((r) => r.listCohortCertificates(C1));
    expect(sortStr(norm(m).map((c) => c.certificateNumber))).toEqual(['N1', 'N2']); // CERT3=C2, CERTDEL deleted
    expect(sortStr(norm(p).map((c) => c.certificateNumber))).toEqual(['N1', 'N2']);
    const [mi, pi] = await both((r) => r.listIssuedCertificates({ cohortIds: [C1], userIds: [U1, U2] }));
    expect(norm(mi).length).toBe(1); // only CERT1 (Issued); CERT2 Revoked
    expect(nums(pi)).toEqual(nums(mi));
  });

  test('listCohortSchedules / listCohortEnrollments', async () => {
    const [ms, ps] = await both((r) => r.listCohortSchedules([C1]));
    expect(sortStr(ms.map((s) => s._id))).toEqual(sortStr([S1, S2])); // SC cancelled excluded
    expect(sortStr(ps.map((s) => s._id))).toEqual(sortStr([S1, S2]));
    const [me, pe] = await both((r) => r.listCohortEnrollments([C1]));
    expect(sortStr(norm(me).map((e) => e.userId))).toEqual(sortStr([U1, U3])); // E3 Dropped excluded
    expect(sortStr(norm(pe).map((e) => e.userId))).toEqual(sortStr([U1, U3]));
  });

  test('listAttendedAttendance / listEvaluations / listFeedback / listPassingAttempts', async () => {
    const pairs = (rows, k) => sortStr(norm(rows).map((r) => `${String(r[k] || r.scheduleId)}:${r.userId}`));
    const [ma, pa] = await both((r) => r.listAttendedAttendance({ scheduleIds: [S1, S2], userIds: [U1, U2, U3] }));
    expect(norm(ma).length).toBe(2); // U1@S1(P), U3@S2(L); U2@S1(A) excluded
    expect(pairs(pa, 'scheduleId')).toEqual(pairs(ma, 'scheduleId'));
    const [me, pe] = await both((r) => r.listEvaluations({ cohortIds: [C1], userIds: [U1, U2] }));
    expect(sortStr(norm(me).map((e) => e.userId))).toEqual([U1]); // EVALDEL hook-filtered
    expect(sortStr(norm(pe).map((e) => e.userId))).toEqual([U1]);
    const [mf, pf] = await both((r) => r.listFeedbackSubmissions({ cohortIds: [C1], userIds: [U1, U2] }));
    expect(sortStr(norm(mf).map((f) => f.userId))).toEqual([U1]);
    expect(sortStr(norm(pf).map((f) => f.userId))).toEqual([U1]);
    const [mp, pp] = await both((r) => r.listPassingAttempts({ cohortIds: [C1], userIds: [U1, U2] }));
    expect(sortStr(norm(mp).map((a) => a.userId))).toEqual([U1]); // ATM2 failed, ATMDEL deleted
    expect(sortStr(norm(pp).map((a) => a.userId))).toEqual([U1]);
  });

  // ── Compliance ──────────────────────────────────────────
  test('listComplianceAssignments: active/non-deleted, sort, nested path populate', async () => {
    const titles = (rows) => norm(rows).map((a) => a.title);
    const [m, p] = await both((r) => r.listComplianceAssignments({}));
    expect(titles(m)).toEqual(['A1', 'A2']); // AARCH archived, ADEL deleted; dueDate asc
    expect(titles(p)).toEqual(titles(m));
    // A2 path populate → programs as full objects (codes)
    const a2m = norm(m).find((a) => a.title === 'A2');
    const a2p = norm(p).find((a) => a.title === 'A2');
    expect(a2m.pathId.programs.map((x) => x.code)).toEqual(['P-1', 'P-2']);
    expect(a2p.pathId.programs.map((x) => x.code)).toEqual(['P-1', 'P-2']);
    expect(a2p.pathId.code).toBe('PATH-1');
    // A1 program populate
    const a1p = norm(p).find((a) => a.title === 'A1');
    expect(a1p.programId.code).toBe('P-1');
  });

  test('listComplianceAssignments: programId (incl. path-containing) + dueDate range', async () => {
    const titles = (rows) => sortStr(norm(rows).map((a) => a.title));
    const [m, p] = await both((r) => r.listComplianceAssignments({ programId: P1 }));
    expect(titles(m)).toEqual(['A1', 'A2']); // A1 direct + A2 via PATH1 (contains P1)
    expect(titles(p)).toEqual(titles(m));
    const [md, pd] = await both((r) => r.listComplianceAssignments({ dueFrom: '2026-05-01', dueTo: '2026-05-15' }));
    expect(norm(md).map((a) => a.title)).toEqual(['A1']); // A2 due 05-20 out of range
    expect(norm(pd).map((a) => a.title)).toEqual(['A1']);
  });

  // ── Org export + program certs ──────────────────────────
  test('findOrgUsers: dept + manager populate (deleted ref → null)', async () => {
    const proj = (rows) => Object.fromEntries(norm(rows).map((u) => [u.empCode, {
      dept: u.departmentId ? u.departmentId.code : null,
      mgr: u.managerId ? u.managerId.empCode : null,
    }]));
    const [m, p] = await both((r) => r.findOrgUsers([U1, U2, U3]));
    expect(proj(m)).toEqual({ E1: { dept: 'ENG', mgr: 'M1' }, E2: { dept: 'ENG', mgr: null }, E3: { dept: null, mgr: null } });
    expect(proj(p)).toEqual(proj(m));
  });

  test('listProgramCertificates: sort issued_at desc, includes Revoked', async () => {
    const nums = (rows) => norm(rows).map((c) => c.certificateNumber);
    const [m, p] = await both((r) => r.listProgramCertificates([U1, U2], [P1]));
    expect(nums(m)).toEqual(['N3', 'N2', 'N1']); // 05-12, 05-11, 05-10 desc; Revoked N2 kept; CERTDEL out
    expect(nums(p)).toEqual(nums(m));
  });

  // ── A5 training-hours ───────────────────────────────────
  test('listSchedulesInRange / listAttendedByScheduleIds / listParticipantsForHours', async () => {
    const [ms, ps] = await both((r) => r.listSchedulesInRange({ from: '2026-05-01T00:00:00.000Z', to: '2026-05-31T23:59:59.999Z' }));
    expect(sortStr(ms.map((s) => s._id))).toEqual(sortStr([S1, S2])); // SC cancelled, SOUT out-of-range
    expect(sortStr(ps.map((s) => s._id))).toEqual(sortStr([S1, S2]));
    const [ma, pa] = await both((r) => r.listAttendedByScheduleIds([S1, S2]));
    expect(norm(ma).length).toBe(2); // U1@S1(P), U3@S2(L)
    expect(sortStr(norm(pa).map((a) => `${a.scheduleId}:${a.userId}`))).toEqual(sortStr(norm(ma).map((a) => `${a.scheduleId}:${a.userId}`)));
    const [mp, pp] = await both((r) => r.listParticipantsForHours({}));
    expect(sortStr(norm(mp).map((u) => u.empCode))).toEqual(['E1', 'E2', 'E3']); // Participants, not MGR/UDEL
    expect(sortStr(norm(pp).map((u) => u.empCode))).toEqual(['E1', 'E2', 'E3']);
    const [mpd, ppd] = await both((r) => r.listParticipantsForHours({ departmentId: DENG }));
    expect(sortStr(norm(mpd).map((u) => u.empCode))).toEqual(['E1', 'E2']); // E3 no dept
    expect(sortStr(norm(ppd).map((u) => u.empCode))).toEqual(['E1', 'E2']);
  });
});
