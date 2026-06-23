/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — learning/dashboard/repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Batched dashboard aggregations (org-wide + cohort-scoped). Runs only when a
 * Postgres URL is present; SKIPS otherwise. Each method asserts Mongo==PG; key
 * traps get absolute checks: ATTENDED_STATUSES (P|L), cohortScope, $ifNull
 * department, completionPolicy jsonb predicate, soft-delete filters.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/learning/dashboard/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const sortById = (a) => norm(a).sort((x, y) => String(x._id).localeCompare(String(y._id)));

const NOW = day(50);
const P1 = hex(1511); const P2 = hex(1512); const P3 = hex(1513);
const C1 = hex(1521); const C2 = hex(1522);
const S1 = hex(1531); const S2 = hex(1532); const S3 = hex(1533); const S4 = hex(1534);
const U1 = hex(1541); const U2 = hex(1542); const U3 = hex(1543); const U4 = hex(1544); const U5 = hex(1545); const UD = hex(1546); const UW = hex(1547);
const D1 = hex(1551); const R1 = hex(1561); const AR1 = hex(1571);

describePg('PG-parity: learning/dashboard/repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('LearningProgram')).insertMany([
      { _id: oid(P1), name: 'Prog 1', status: 'active', completionPolicy: { attendanceThresholdPercent: 50, requiresAssessment: false, requiresFeedback: false } },
      { _id: oid(P2), name: 'Prog 2', status: 'active' },
      { _id: oid(P3), name: 'Prog 3', status: 'archived' },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'C1', courseName: 'Course 1', isDeleted: false },
      { _id: oid(C2), classCode: 'C2', courseName: 'Course 2', isDeleted: false },
    ]);
    const sch = (id, cls, start, end) => ({ _id: oid(id), classId: oid(cls), status: 'scheduled', startTime: day(start), endTime: day(end), enrolledUsers: [] });
    await db.collection(coll('Schedule')).insertMany([sch(S1, C1, 60, 60), sch(S2, C1, 52, 52), sch(S3, C1, 10, 20), sch(S4, C2, 55, 55)]);
    const att = (id, u, s, st) => ({ _id: oid(id), userId: oid(u), scheduleId: oid(s), status: st, createdAt: day(5) });
    await db.collection(coll('Attendance')).insertMany([att(hex(1581), U1, S1, 'P'), att(hex(1582), U2, S1, 'A'), att(hex(1583), U1, S2, 'L')]);
    const cert = (id, u, prog, cohort, status, vu, del = false) => ({
      _id: oid(id), userId: oid(u), programId: oid(prog), cohortId: oid(cohort), status, isDeleted: del,
      validUntil: vu == null ? null : day(vu), learnerName: `L-${id.slice(-3)}`, programName: 'Prog 1',
      certificateNumber: `C-${id.slice(-3)}`, verificationCode: `v-${id.slice(-3)}`, issuedAt: day(5),
    });
    await db.collection(coll('Certificate')).insertMany([
      cert(hex(1591), U1, P1, C1, 'Issued', 45), cert(hex(1592), U2, P1, C1, 'Issued', 70),
      cert(hex(1593), U3, P2, C2, 'Issued', 105), cert(hex(1594), U1, P1, C2, 'Issued', null),
      cert(hex(1595), U2, P1, C1, 'Revoked', 70), cert(hex(1596), U1, P1, C1, 'Issued', 70, true),
    ]);
    const at = (id, cohort, passed, del = false) => ({ _id: oid(id), assessmentId: oid(hex(1601)), userId: oid(U1), cohortId: oid(cohort), passed, isDeleted: del, scorePercent: 80 });
    await db.collection(coll('AssessmentAttempt')).insertMany([at(hex(1611), C1, true), at(hex(1612), C1, false), at(hex(1613), C2, true)]);
    const fb = (id, cohort, user, prog, rating) => ({ _id: oid(id), cohortId: oid(cohort), programId: prog ? oid(prog) : null, userId: oid(user), rating, isDeleted: false });
    await db.collection(coll('Feedback')).insertMany([fb(hex(1621), C1, U1, P1, 5), fb(hex(1622), C1, U2, P1, 3), fb(hex(1623), C2, U3, P2, 4)]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', role: 'Participant', status: 'Active', department: 'Eng', isDeleted: false },
      { _id: oid(U2), empCode: 'U2', role: 'Participant', status: 'Active', department: 'Eng', isDeleted: false },
      { _id: oid(U3), empCode: 'U3', role: 'Participant', status: 'Active', department: 'Ops', isDeleted: false },
      { _id: oid(U4), empCode: 'U4', role: 'Coordinator', status: 'Active', department: 'Eng', isDeleted: false },
      { _id: oid(U5), empCode: 'U5', role: 'Teacher', status: 'Active', isDeleted: false },
      { _id: oid(UD), empCode: 'U6', role: 'Participant', status: 'Active', department: 'Eng', isDeleted: true },
      { _id: oid(UW), empCode: 'U7', role: 'Participant', status: 'Waiting for class', isDeleted: false },
    ]);
    const enr = (id, u, status, d) => ({ _id: oid(id), userId: oid(u), status, createdAt: day(d) });
    await db.collection(coll('Enrollment')).insertMany([enr(hex(1631), U1, 'Active', 5), enr(hex(1632), U3, 'Completed', 6), enr(hex(1633), U2, 'Dropped', 7)]);
    await db.collection(coll('Department')).insertOne({ _id: oid(D1), name: 'Eng', code: 'ENG', isDeleted: false });
    await db.collection(coll('Role')).insertOne({ _id: oid(R1), key: 'auditor', name: 'Auditor', system: false, capabilities: [], isDeleted: false });
    await db.collection(coll('AutomationRule')).insertOne({ _id: oid(AR1), name: 'Rule', trigger: 'X', conditions: [], actions: [], enabled: false, system: false, isDeleted: false });

    await query('TRUNCATE learning_programs, classes, schedules, attendances, certificates, assessment_attempts, feedbacks, users, enrollments, departments, roles, automation_rules');
    await query(`INSERT INTO learning_programs(id,name,status,completion_policy) VALUES
      ($1,'Prog 1','active','{"attendanceThresholdPercent":50,"requiresAssessment":false,"requiresFeedback":false}'),
      ($2,'Prog 2','active',null),($3,'Prog 3','archived',null)`, [P1, P2, P3]);
    await query(`INSERT INTO classes(id,class_code,course_name,is_deleted) VALUES ($1,'C1','Course 1',false),($2,'C2','Course 2',false)`, [C1, C2]);
    const ipgS = (id, cls, start, end) => query(`INSERT INTO schedules(id,class_id,status,start_time,end_time,enrolled_users) VALUES ($1,$2,'scheduled',$3,$4,ARRAY[]::text[])`, [id, cls, day(start).toISOString(), day(end).toISOString()]);
    await ipgS(S1, C1, 60, 60); await ipgS(S2, C1, 52, 52); await ipgS(S3, C1, 10, 20); await ipgS(S4, C2, 55, 55);
    const ipgA = (id, u, s, st) => query(`INSERT INTO attendances(id,user_id,schedule_id,status,created_at) VALUES ($1,$2,$3,$4,$5)`, [id, u, s, st, day(5).toISOString()]);
    await ipgA(hex(1581), U1, S1, 'P'); await ipgA(hex(1582), U2, S1, 'A'); await ipgA(hex(1583), U1, S2, 'L');
    const ipgC = (id, u, prog, cohort, status, vu, del = false) => query(
      `INSERT INTO certificates(id,user_id,program_id,cohort_id,status,is_deleted,valid_until,learner_name,program_name,certificate_number,verification_code,issued_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Prog 1',$9,$10,$11)`,
      [id, u, prog, cohort, status, del, vu == null ? null : day(vu).toISOString(), `L-${id.slice(-3)}`, `C-${id.slice(-3)}`, `v-${id.slice(-3)}`, day(5).toISOString()]);
    await ipgC(hex(1591), U1, P1, C1, 'Issued', 45); await ipgC(hex(1592), U2, P1, C1, 'Issued', 70);
    await ipgC(hex(1593), U3, P2, C2, 'Issued', 105); await ipgC(hex(1594), U1, P1, C2, 'Issued', null);
    await ipgC(hex(1595), U2, P1, C1, 'Revoked', 70); await ipgC(hex(1596), U1, P1, C1, 'Issued', 70, true);
    const ipgAt = (id, cohort, passed, del = false) => query(`INSERT INTO assessment_attempts(id,assessment_id,user_id,cohort_id,passed,is_deleted,score_percent) VALUES ($1,$2,$3,$4,$5,$6,80)`, [id, hex(1601), U1, cohort, passed, del]);
    await ipgAt(hex(1611), C1, true); await ipgAt(hex(1612), C1, false); await ipgAt(hex(1613), C2, true);
    const ipgF = (id, cohort, user, prog, rating) => query(`INSERT INTO feedbacks(id,cohort_id,program_id,user_id,rating,is_deleted) VALUES ($1,$2,$3,$4,$5,false)`, [id, cohort, prog, user, rating]);
    await ipgF(hex(1621), C1, U1, P1, 5); await ipgF(hex(1622), C1, U2, P1, 3); await ipgF(hex(1623), C2, U3, P2, 4);
    await query(`INSERT INTO users(id,emp_code,role,status,department,is_deleted) VALUES
      ($1,'U1','Participant','Active','Eng',false),($2,'U2','Participant','Active','Eng',false),
      ($3,'U3','Participant','Active','Ops',false),($4,'U4','Coordinator','Active','Eng',false),
      ($5,'U5','Teacher','Active',null,false),($6,'U6','Participant','Active','Eng',true),
      ($7,'U7','Participant','Waiting for class',null,false)`, [U1, U2, U3, U4, U5, UD, UW]);
    await query(`INSERT INTO enrollments(id,user_id,status,created_at) VALUES ($1,$2,'Active',$3),($4,$5,'Completed',$6),($7,$8,'Dropped',$9)`,
      [hex(1631), U1, day(5).toISOString(), hex(1632), U3, day(6).toISOString(), hex(1633), U2, day(7).toISOString()]);
    await query(`INSERT INTO departments(id,name,code,is_deleted) VALUES ($1,'Eng','ENG',false)`, [D1]);
    await query(`INSERT INTO roles(id,key,name,system,capabilities,is_deleted) VALUES ($1,'auditor','Auditor',false,ARRAY[]::text[],false)`, [R1]);
    await query(`INSERT INTO automation_rules(id,name,trigger,conditions,actions,enabled,system,is_deleted) VALUES ($1,'Rule','X','[]','[]',false,false,false)`, [AR1]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('attendanceTotals (org + cohort-scoped, P|L present) — identical', async () => {
    const [m, p] = await both((r) => r.attendanceTotals(null));
    expect(m).toEqual({ totalRecords: 3, presentRecords: 2 }); expect(p).toEqual(m);
    const [mC, pC] = await both((r) => r.attendanceTotals([C1]));
    expect(mC).toEqual({ totalRecords: 3, presentRecords: 2 }); expect(pC).toEqual(mC);
    const [mE, pE] = await both((r) => r.attendanceTotals([C2])); // S4 has no attendance
    expect(mE).toEqual({ totalRecords: 0, presentRecords: 0 }); expect(pE).toEqual(mE);
  });

  test('sessionCounts (org + cohort) — identical', async () => {
    const [m, p] = await both((r) => r.sessionCounts(null, NOW));
    expect(m).toEqual({ upcoming: 3, next7Days: 2, past: 1 }); expect(p).toEqual(m);
    const [mC, pC] = await both((r) => r.sessionCounts([C1], NOW));
    expect(mC).toEqual({ upcoming: 2, next7Days: 1, past: 1 }); expect(pC).toEqual(mC);
  });

  test('certificateExpiryCounts + listExpiringCertificates — identical', async () => {
    const [m, p] = await both((r) => r.certificateExpiryCounts(null, NOW));
    expect(m).toEqual({ expired: 1, expiring30: 1, expiring60: 2 }); expect(p).toEqual(m);
    const [mL, pL] = await both((r) => r.listExpiringCertificates(null, NOW, day(110), 10));
    expect(mL.length).toBe(2); // CT2(70), CT3(105) within horizon, validUntil asc
    expect(norm(pL).map((c) => c.certificateNumber)).toEqual(norm(mL).map((c) => c.certificateNumber));
  });

  test('assessmentTotals + feedbackStats — identical', async () => {
    const [m, p] = await both((r) => r.assessmentTotals(null));
    expect(m).toEqual({ totalAttempts: 3, passedAttempts: 2 }); expect(p).toEqual(m);
    // cohort-scoped aggregate: each backend gets cohort ids in its native form
    // (Mongo aggregate $in does NOT auto-cast string→ObjectId, unlike find/count).
    const [mC, pC] = await Promise.all([
      repo.impls.mongo.assessmentTotals([oid(C1)]),
      repo.impls.pg.assessmentTotals([C1]),
    ]);
    expect(mC).toEqual({ totalAttempts: 2, passedAttempts: 1 }); expect(pC).toEqual(mC);

    const [mF, pF] = await both((r) => r.feedbackStats(null));
    expect(mF.overall).toEqual({ count: 3, avg: 4 });
    expect(norm(pF).overall).toEqual(norm(mF).overall);
    expect(sortById(pF.byProgram)).toEqual(sortById(mF.byProgram));
  });

  test('coverageCounts + listProgramNames — identical', async () => {
    const [m, p] = await both((r) => r.coverageCounts(day(1)));
    expect(m).toEqual({ activeParticipants: 3, engagedParticipants: 3 }); expect(p).toEqual(m);
    const [mN, pN] = await both((r) => r.listProgramNames([P1, P2]));
    expect(sortById(mN)).toEqual([{ _id: P1, name: 'Prog 1' }, { _id: P2, name: 'Prog 2' }].sort((a, b) => a._id.localeCompare(b._id)));
    expect(sortById(pN)).toEqual(sortById(mN));
  });

  test('getSetupSignals + headcountByDepartment + completedUsersByDepartment — identical', async () => {
    const [m, p] = await both((r) => r.getSetupSignals());
    expect(m).toMatchObject({ departments: 1, programs: 2, customRoles: 1, automationRules: 1, policyPrograms: 1, coordinators: 1, activeLearners: 3, pendingEnrollment: 1 });
    expect(norm(p)).toEqual(norm(m));

    const [mH, pH] = await both((r) => r.headcountByDepartment());
    expect(sortById(pH)).toEqual(sortById(mH)); // Eng:3, Ops:1, Unassigned:2 (U5,U7)
    const eng = norm(mH).find((r) => r._id === 'Eng');
    expect(eng.headcount).toBe(3);

    const [mD, pD] = await both((r) => r.completedUsersByDepartment());
    expect(sortById(pD)).toEqual(sortById(mD)); // Eng:2 (U1,U2), Ops:1 (U3)
  });
});
