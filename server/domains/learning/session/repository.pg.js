const { query } = require('../../../config/pg');
const { attachSessionNumbers } = require('../../schedule/session-order');

// ──────────────────────────────────────────────────────────
// learning/session/repository — POSTGRES impl (Phase 3 Wave-D, the last repo
// port). Same interface as ./repository.mongo. READ-ONLY: session writes go
// through scheduleService (already dual-backend) — this is the list/detail
// hydration + the booking-adapter context lookups.
//
// Fidelity notes the parity test pins (Mongo ⇔ SQL):
//   • populateSessionQuery → batch embeds. Class/Team/User/Office/Room ALL
//     have soft-delete find-hooks → a deleted ref drops to null (array
//     populates drop the row + preserve order). LearningProgram + Enrollment
//     have NO hook/column → never hidden.
//   • nested populate classId.programId → the FULL program object (2nd query),
//     mapped like learning/repository.pg.js programRow — keep in sync.
//   • PERF-016: the LIST roster embeds `_id` only — but STILL resolves the
//     refs (a soft-deleted user drops from the array, same as populate).
//   • Schedule extras (externalTrainer/agenda/materials/…) ride schedules.meta
//     jsonb → spread back as top-level keys (core columns win) — same mapping
//     as domains/schedule/repository.pg.js baseSchedule; keep in sync.
//   • `.lean({virtuals:true})` in the Mongo impl is a documented NO-OP
//     (BUG-003 — mongoose-lean-virtuals not installed) → no virtuals here.
//   • attachSessionNumbers is shared (domains/schedule/session-order) and
//     orders via the schedule repo SELECTOR — dual-backend already.
// ──────────────────────────────────────────────────────────

const ids = (a) => (a || []).map(String);
const num = (v) => (v == null ? null : Number(v));

// schedules row → session shape (twin of schedule/repository.pg.js baseSchedule).
const baseSession = (r) => ({
  ...(r.meta || {}), // extras (externalTrainer/vendorId/…) — core columns override below
  _id: r.id,
  classId: r.class_id || null,
  bookedTeamId: r.booked_team_id || null,
  officeId: r.office_id || null,
  startTime: r.start_time,
  endTime: r.end_time,
  roomLink: r.room_link == null ? '' : r.room_link,
  roomId: r.room_id || null,
  sessionInstructorIds: ids(r.session_instructor_ids),
  topic: r.topic == null ? '' : r.topic,
  meetLink: r.meet_link == null ? '' : r.meet_link,
  enrolledUsers: ids(r.enrolled_users),
  capacity: r.capacity == null ? undefined : Number(r.capacity),
  status: r.status,
  cancelledAt: r.cancelled_at || null,
  cancelledBy: r.cancelled_by || null,
  cancelReason: r.cancel_reason == null ? '' : r.cancel_reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// learning_programs row → the FULL populated program (twin of
// learning/repository.pg.js programRow — keep in sync).
const D_COMPLETION = { attendanceThresholdPercent: 0, requiresAssessment: false, requiresFeedback: false };
const D_CAPACITY = { maxParticipants: null, maxParticipantsPerSession: null };
const D_FACILITATOR = { assignmentRequired: false, visibility: 'all_facilitators' };
const D_RECERTIFY = { autoAssign: false };

const programRow = (r) => (r == null ? null : {
  _id: r.id, code: r.code, name: r.name, description: r.description || '',
  category: r.category,
  defaultSessionCount: r.default_session_count == null ? null : Number(r.default_session_count),
  deliveryMode: r.delivery_mode, schedulingMode: r.scheduling_mode,
  completionPolicy: r.completion_policy || D_COMPLETION,
  certificateValidityDays: r.certificate_validity_days == null ? null : Number(r.certificate_validity_days),
  capacityPolicy: r.capacity_policy || D_CAPACITY,
  facilitatorPolicy: r.facilitator_policy || D_FACILITATOR,
  recertifyPolicy: r.recertify_policy || D_RECERTIFY,
  customFields: r.custom_fields || {},
  prerequisitePrograms: (r.prerequisite_programs || []).map(String),
  status: r.status, legacyCourseName: r.legacy_course_name || '',
  createdAt: r.created_at, updatedAt: r.updated_at,
});

// ── batch ref embeds (soft-delete-aware, drop-to-null) ────
// populate('classId', 'classCode courseName programId totalSessions status
// teacherIds createdAt updatedAt') + nested populate('programId') → FULL program.
const embedCohorts = async (rows) => {
  const cids = [...new Set(rows.map((r) => r.class_id).filter(Boolean))];
  if (!cids.length) return new Map();
  const { rows: cs } = await query(
    `SELECT id, class_code, course_name, program_id, total_sessions, status, teacher_ids, created_at, updated_at
       FROM classes WHERE id = ANY($1) AND is_deleted = false`, [cids]);
  const pids = [...new Set(cs.map((c) => c.program_id).filter(Boolean))];
  let progMap = new Map();
  if (pids.length) {
    const { rows: ps } = await query(`SELECT * FROM learning_programs WHERE id = ANY($1)`, [pids]);
    progMap = new Map(ps.map((p) => [p.id, programRow(p)]));
  }
  return new Map(cs.map((c) => [c.id, {
    _id: c.id, classCode: c.class_code, courseName: c.course_name,
    programId: c.program_id ? (progMap.get(c.program_id) || null) : null,
    totalSessions: num(c.total_sessions), status: c.status,
    teacherIds: ids(c.teacher_ids),
    createdAt: c.created_at, updatedAt: c.updated_at,
  }]));
};

const embedTeams = async (rows) => {
  const tids = [...new Set(rows.map((r) => r.booked_team_id).filter(Boolean))];
  if (!tids.length) return new Map();
  const { rows: ts } = await query(
    `SELECT id, name, leader_id, class_id FROM teams WHERE id = ANY($1) AND is_deleted = false`, [tids]);
  return new Map(ts.map((t) => [t.id, {
    _id: t.id, name: t.name, leaderId: t.leader_id || null, classId: t.class_id || null,
  }]));
};

const embedOffices = async (rows) => {
  const oids = [...new Set(rows.map((r) => r.office_id).filter(Boolean))];
  if (!oids.length) return new Map();
  const { rows: os } = await query(`SELECT id, name, code FROM offices WHERE id = ANY($1) AND is_deleted = false`, [oids]);
  return new Map(os.map((o) => [o.id, { _id: o.id, name: o.name, code: o.code }]));
};

const embedRooms = async (rows) => {
  const rids = [...new Set(rows.map((r) => r.room_id).filter(Boolean))];
  if (!rids.length) return new Map();
  const { rows: rs } = await query(`SELECT id, name, code FROM rooms WHERE id = ANY($1) AND is_deleted = false`, [rids]);
  return new Map(rs.map((r) => [r.id, { _id: r.id, name: r.name, code: r.code }]));
};

// fields=[] → ids-only rows ({_id}) that still soft-delete-drop (PERF-016 roster).
const USER_COLS = { empCode: 'emp_code', name: 'name', department: 'department', status: 'status' };
const fetchUsers = async (idList, fields) => {
  const uniq = [...new Set(ids(idList))];
  if (!uniq.length) return new Map();
  const cols = ['id', ...fields.map((f) => USER_COLS[f])].join(', ');
  const { rows } = await query(`SELECT ${cols} FROM users WHERE id = ANY($1) AND is_deleted = false`, [uniq]);
  return new Map(rows.map((r) => {
    const o = { _id: r.id };
    for (const f of fields) o[f] = r[USER_COLS[f]];
    return [r.id, o];
  }));
};
const orderedEmbed = (idArr, map) => ids(idArr).map((id) => map.get(id)).filter(Boolean);

// ── Mongo-filter → SQL translator (bounded to the keys use-cases.buildFilter
// builds): classId/bookedTeamId/status/sessionInstructorIds scalars, startTime
// {$gte,$lte}, and the role-widening $or of {enrolledUsers: scalar} |
// {classId:{$in}} | {bookedTeamId:{$in}} | {sessionInstructorIds: scalar}.
const sessionWhere = (filter = {}) => {
  const conds = [];
  const args = [];
  const add = (sql, val) => { args.push(val); conds.push(sql.replace('$?', `$${args.length}`)); };
  if (filter.classId) add('class_id = $?', String(filter.classId));
  if (filter.bookedTeamId) add('booked_team_id = $?', String(filter.bookedTeamId));
  if (filter.status) add('status = $?', filter.status);
  if (filter.sessionInstructorIds) add('$? = ANY(session_instructor_ids)', String(filter.sessionInstructorIds));
  if (filter.startTime) {
    if (filter.startTime.$gte) add('start_time >= $?', new Date(filter.startTime.$gte).toISOString());
    if (filter.startTime.$lte) add('start_time <= $?', new Date(filter.startTime.$lte).toISOString());
  }
  if (Array.isArray(filter.$or)) {
    const ors = [];
    for (const clause of filter.$or) {
      if (clause.enrolledUsers) {
        args.push(String(clause.enrolledUsers)); ors.push(`$${args.length} = ANY(enrolled_users)`);
      } else if (clause.classId && Array.isArray(clause.classId.$in)) {
        args.push(clause.classId.$in.map(String)); ors.push(`class_id = ANY($${args.length})`);
      } else if (clause.bookedTeamId && Array.isArray(clause.bookedTeamId.$in)) {
        args.push(clause.bookedTeamId.$in.map(String)); ors.push(`booked_team_id = ANY($${args.length})`);
      } else if (clause.sessionInstructorIds) {
        args.push(String(clause.sessionInstructorIds)); ors.push(`$${args.length} = ANY(session_instructor_ids)`);
      }
    }
    if (ors.length) conds.push(`(${ors.join(' OR ')})`);
  }
  return { where: conds.length ? conds.join(' AND ') : 'true', args };
};

const hydrate = (s, m, rosterMap) => {
  const out = baseSession(s);
  out.classId = s.class_id ? (m.cohorts.get(s.class_id) || null) : null;
  out.bookedTeamId = s.booked_team_id ? (m.teams.get(s.booked_team_id) || null) : null;
  out.officeId = s.office_id ? (m.offices.get(s.office_id) || null) : null;
  out.roomId = s.room_id ? (m.rooms.get(s.room_id) || null) : null;
  out.sessionInstructorIds = orderedEmbed(s.session_instructor_ids, m.instructors);
  out.enrolledUsers = orderedEmbed(s.enrolled_users, rosterMap);
  return out;
};

const embedAll = async (rows) => {
  const [cohorts, teams, offices, rooms, instructors] = await Promise.all([
    embedCohorts(rows), embedTeams(rows), embedOffices(rows), embedRooms(rows),
    fetchUsers(rows.flatMap((r) => r.session_instructor_ids || []), ['empCode', 'name']),
  ]);
  return { cohorts, teams, offices, rooms, instructors };
};

// PERF-014: reads read-THROUGH the session-order cache (attachSessionNumbers);
// only write paths invalidate — same contract as the Mongo impl.
const findSessions = async (filter, { skip, limit }) => {
  const { where, args } = sessionWhere(filter);
  const [{ rows }, { rows: cnt }] = await Promise.all([
    query(
      `SELECT * FROM schedules WHERE ${where} ORDER BY start_time ASC, id ASC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, skip]),
    query(`SELECT count(*)::int AS n FROM schedules WHERE ${where}`, args),
  ]);
  const [maps, rosterMap] = await Promise.all([
    embedAll(rows),
    fetchUsers(rows.flatMap((r) => r.enrolled_users || []), []), // ids-only (PERF-016)
  ]);
  const sessions = rows.map((s) => hydrate(s, maps, rosterMap));
  await attachSessionNumbers(sessions);
  return { sessions, total: cnt[0].n };
};

const findSessionById = async (id) => {
  const { rows } = await query(`SELECT * FROM schedules WHERE id = $1`, [String(id)]);
  if (!rows[0]) return null;
  const [maps, rosterMap] = await Promise.all([
    embedAll(rows),
    fetchUsers(rows[0].enrolled_users, ['empCode', 'name', 'department', 'status']), // full roster (detail)
  ]);
  const session = hydrate(rows[0], maps, rosterMap);
  const [withNumber] = await attachSessionNumbers([session]);
  return withNumber;
};

// Class soft-delete hook → is_deleted=false. Returns plain id values
// (Mongo: ObjectIds; here text) — callers stringify.
const findCohortIdsByTeacher = async (teacherId) => {
  const { rows } = await query(
    `SELECT id FROM classes WHERE $1 = ANY(teacher_ids) AND is_deleted = false`, [String(teacherId)]);
  return rows.map((r) => r.id);
};

// Class(cohort).programId -> LearningProgram.schedulingMode; 'leader_booking'
// fallback for a program-less cohort; deleted/missing cohort → cohortId null.
const findSchedulingContextByCohort = async (cohortId) => {
  const fallback = { schedulingMode: 'leader_booking', programId: null, cohortId };
  const { rows } = await query(`SELECT program_id FROM classes WHERE id = $1 AND is_deleted = false`, [String(cohortId)]);
  if (!rows[0]) return { ...fallback, cohortId: null };
  if (!rows[0].program_id) return fallback;
  const { rows: pr } = await query(`SELECT scheduling_mode FROM learning_programs WHERE id = $1`, [rows[0].program_id]);
  return {
    schedulingMode: (pr[0] && pr[0].scheduling_mode) || 'leader_booking',
    programId: rows[0].program_id,
    cohortId,
  };
};

// Office.findOne({_id, isDeleted:false}).lean() — isDeleted/deletedAt are
// select:false ⇔ omitted (established row-shape convention).
const findOfficeById = async (officeId) => {
  const { rows } = await query(
    `SELECT id, name, code, address, timezone, created_at, updated_at
       FROM offices WHERE id = $1 AND is_deleted = false`, [String(officeId)]);
  const o = rows[0];
  return o ? {
    _id: o.id, name: o.name, code: o.code,
    address: o.address == null ? '' : o.address,
    timezone: o.timezone == null ? '' : o.timezone,
    createdAt: o.created_at, updatedAt: o.updated_at,
  } : null;
};

// Active cohort-based enrollments (team_id NULL). Enrollment has NO soft-delete.
const findActiveCohortLearnerIds = async (cohortId) => {
  const { rows } = await query(
    `SELECT user_id FROM enrollments WHERE class_id = $1 AND team_id IS NULL AND status = 'Active'`,
    [String(cohortId)]);
  return rows.map((r) => r.user_id);
};

// distinct('classId') — Enrollment has no find-hook, nothing to mirror.
const findActiveCohortIdsForLearner = async (userId) => {
  const { rows } = await query(
    `SELECT DISTINCT class_id FROM enrollments
      WHERE user_id = $1 AND team_id IS NULL AND status = 'Active' AND class_id IS NOT NULL`,
    [String(userId)]);
  return rows.map((r) => r.class_id);
};

// Team.find({members, isDeleted:{$ne:true}}).distinct('_id') — members live in
// the team_members junction; the explicit isDeleted filter ⇔ is_deleted=false.
const findTeamIdsForMember = async (userId) => {
  const { rows } = await query(
    `SELECT DISTINCT t.id FROM teams t JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = $1 AND t.is_deleted = false`, [String(userId)]);
  return rows.map((r) => r.id);
};

// Program per-session caps for a set of cohorts → Map(String(cohortId) →
// maxParticipantsPerSession | null). Class hook applies; programs never hidden.
const findCapacityPoliciesByCohortIds = async (cohortIds) => {
  if (!cohortIds.length) return new Map();
  const { rows: cs } = await query(
    `SELECT id, program_id FROM classes WHERE id = ANY($1) AND is_deleted = false`,
    [ids(cohortIds)]);
  const pids = [...new Set(cs.map((c) => c.program_id).filter(Boolean))];
  const { rows: ps } = pids.length
    ? await query(`SELECT id, capacity_policy FROM learning_programs WHERE id = ANY($1)`, [pids])
    : { rows: [] };
  const programCap = new Map(ps.map((p) => [p.id, (p.capacity_policy && p.capacity_policy.maxParticipantsPerSession) ?? null]));
  return new Map(cs.map((c) => [
    String(c.id),
    c.program_id ? (programCap.get(c.program_id) ?? null) : null,
  ]));
};

module.exports = {
  findSessions,
  findSessionById,
  findCohortIdsByTeacher,
  findSchedulingContextByCohort,
  findActiveCohortLearnerIds,
  findActiveCohortIdsForLearner,
  findTeamIdsForMember,
  findCapacityPoliciesByCohortIds,
  findOfficeById,
};
