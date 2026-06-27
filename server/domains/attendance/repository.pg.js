const crypto = require('crypto');
const mongoose = require('mongoose');
const { query } = require('../../config/pg');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// attendance/repository — POSTGRES impl (Phase 3 Wave-B dual-backend port).
// Same interface as ./repository.mongo; ./repository resolves by DB_BACKEND.
// Attendance never soft-deletes (T16: no is_deleted on attendances / schedules).
//
// Fidelity notes the parity test pins (Mongo ⇔ SQL):
//   • populate('userId') / nested populate('classId') run a User/Class find →
//     the soft-delete pre('find') hook fires → a deleted ref drops to NULL.
//     Mirrored by LEFT JOIN … AND ref.is_deleted = false. Schedule has NO
//     soft-delete hook → its populate embeds regardless (T16).
//   • findClassById = Class.findById = findOne → soft-delete hook → deleted class
//     returns null (AND is_deleted = false).
//   • aggregateByEmployee attendanceRate = Mongo $round (HALF-TO-EVEN). PG numeric
//     round() is half-away — so the rate uses round(double precision) on a ×1000
//     scale ÷10 (single-arg round = banker's), matching $round on .x5 ties.
//   • $sort {attendanceRate:-1, empCode:1} — empCode tiebreak is Mongo BINARY
//     (byte) order, NOT PG collation → sorted in JS with a binary cmp.
//   • bulkWriteAttendance mirrors Mongo bulkWrite counts exactly: matched =
//     existing rows hit by the filter, modified = those whose status/remark/photo
//     actually changed, upserted = new inserts.
//   • bumpUsersLastActive $max → GREATEST (PG GREATEST ignores NULL → a first
//     stamp on a never-active user still sets it; never moves backward).
//   • aggregateMyStats: Mongo $group on zero matches → [] (not a zero row).
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
// Mongo binary (byte) sort order — NOT PG locale collation.
const cmp = (x, y) => ((x || '') < (y || '') ? -1 : (x || '') > (y || '') ? 1 : 0);

// Extract scheduleId scope from a Mongo-shaped match ({} | {scheduleId:{$in:[…]}})
// — scope.js builds this backend-neutrally (its ids come from THIS backend's
// distinctScheduledIdsForClasses, so they are text here).
const scopeScheduleIds = (match = {}) => {
  const s = match.scheduleId;
  return s && Array.isArray(s.$in) ? s.$in.map(String) : null;
};

const COUNT_COLS = `
  count(a.id)::int                                AS "totalSessions",
  count(a.id) FILTER (WHERE a.status = 'P')::int  AS present,
  count(a.id) FILTER (WHERE a.status = 'A')::int  AS absent,
  count(a.id) FILTER (WHERE a.status = 'L')::int  AS late,
  count(a.id) FILTER (WHERE a.status = 'EL')::int AS excused`;

// ── Schedule / Class reads ────────────────────────────────

const findScheduleForAuthz = async (scheduleId) => {
  const { rows } = await query(
    `SELECT id, class_id, session_instructor_ids FROM schedules WHERE id = $1`, [String(scheduleId)]);
  const r = rows[0];
  return r ? {
    _id: r.id, classId: r.class_id,
    sessionInstructorIds: (r.session_instructor_ids || []).map(String),
  } : null;
};

// marking.bulkMark reads startTime + enrolledUsers; assertFacilitatorAssigned
// reads classId + sessionInstructorIds + externalTrainer (the latter in meta).
const findScheduleDocById = async (scheduleId) => {
  const { rows } = await query(
    `SELECT id, class_id, start_time, end_time, status, enrolled_users, session_instructor_ids, meta
       FROM schedules WHERE id = $1`, [String(scheduleId)]);
  const r = rows[0];
  if (!r) return null;
  return {
    _id: r.id, classId: r.class_id, startTime: r.start_time, endTime: r.end_time,
    status: r.status,
    enrolledUsers: (r.enrolled_users || []).map(String),
    sessionInstructorIds: (r.session_instructor_ids || []).map(String),
    externalTrainer: (r.meta && r.meta.externalTrainer) || undefined,
  };
};

const findClassById = async (classId) => {
  // Class.findById = findOne → soft-delete hook → is_deleted = false.
  const { rows } = await query(
    `SELECT id, class_code, course_name, program_id, total_sessions, status, custom_fields, teacher_ids,
            created_at, updated_at
       FROM classes WHERE id = $1 AND is_deleted = false`, [String(classId)]);
  const c = rows[0];
  return c ? {
    _id: c.id, classCode: c.class_code, courseName: c.course_name,
    programId: c.program_id || null,
    totalSessions: c.total_sessions == null ? null : Number(c.total_sessions),
    status: c.status, customFields: c.custom_fields || {},
    teacherIds: (c.teacher_ids || []).map(String),
    createdAt: c.created_at, updatedAt: c.updated_at,
  } : null;
};

const distinctScheduledIdsForClasses = async (classIds) => {
  const ids = (classIds || []).map(String);
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT id FROM schedules WHERE class_id = ANY($1) AND status = 'scheduled'`, [ids]);
  return rows.map((r) => r.id);
};

const findScheduledForClass = async (classId) => {
  const { rows } = await query(
    `SELECT id, start_time, end_time FROM schedules
      WHERE class_id = $1 AND status = 'scheduled'
      ORDER BY start_time ASC, id ASC`, [String(classId)]);
  return rows.map((r) => ({ _id: r.id, startTime: r.start_time, endTime: r.end_time }));
};

// ── Attendance reads / writes ─────────────────────────────

const attendanceRow = (a, userObj) => ({
  _id: a.id, scheduleId: a.schedule_id, userId: userObj,
  status: a.status,
  remark: a.remark == null ? '' : a.remark,
  photoUrl: a.photo_url == null ? '' : a.photo_url,
  syncStatus: a.sync_status, exportBatchId: a.export_batch_id || null,
  exportedAt: a.exported_at || null,
  createdAt: a.created_at, updatedAt: a.updated_at,
});

const findAttendanceBySchedule = async (scheduleId) => {
  // populate('userId','empCode name department') → User soft-delete hook → a
  // deleted user embeds as null (the attendance row itself still appears).
  const { rows } = await query(
    `SELECT a.*, u.id AS u_id, u.emp_code AS u_emp_code, u.name AS u_name, u.department AS u_department
       FROM attendances a
       LEFT JOIN users u ON u.id = a.user_id AND u.is_deleted = false
      WHERE a.schedule_id = $1
      ORDER BY a.created_at ASC, a.id ASC`, [String(scheduleId)]);
  return rows.map((a) => attendanceRow(
    a,
    a.u_id ? { _id: a.u_id, empCode: a.u_emp_code, name: a.u_name, department: a.u_department } : null,
  ));
};

const findAttendanceByUser = async (userId, scopeMatch = {}) => {
  // populate scheduleId (Schedule: no soft-delete hook → always embeds) with a
  // nested populate classId (Class soft-delete hook → deleted class → null).
  const scheduleIds = scopeScheduleIds(scopeMatch);
  const args = [String(userId)];
  let scopeSql = '';
  if (scheduleIds) { args.push(scheduleIds); scopeSql = `AND a.schedule_id = ANY($${args.length})`; }
  const { rows } = await query(
    `SELECT a.*,
            s.id AS s_id, s.class_id AS s_class_id, s.start_time AS s_start_time, s.end_time AS s_end_time,
            s.status AS s_status, s.enrolled_users AS s_enrolled_users,
            s.session_instructor_ids AS s_session_instructor_ids,
            c.id AS c_id, c.class_code AS c_class_code, c.course_name AS c_course_name
       FROM attendances a
       LEFT JOIN schedules s ON s.id = a.schedule_id
       LEFT JOIN classes   c ON c.id = s.class_id AND c.is_deleted = false
      WHERE a.user_id = $1 ${scopeSql}
      ORDER BY a.created_at DESC, a.id DESC`, args);
  return rows.map((a) => {
    const rec = attendanceRow(a, a.user_id); // userId NOT populated here (mirrors Mongo)
    rec.scheduleId = a.s_id ? {
      _id: a.s_id,
      classId: a.c_id ? { _id: a.c_id, classCode: a.c_class_code, courseName: a.c_course_name } : null,
      startTime: a.s_start_time, endTime: a.s_end_time, status: a.s_status,
      enrolledUsers: (a.s_enrolled_users || []).map(String),
      sessionInstructorIds: (a.s_session_instructor_ids || []).map(String),
    } : null;
    return rec;
  });
};

const findAttendanceForSchedules = async (scheduleIds) => {
  const ids = (scheduleIds || []).map(String);
  if (!ids.length) return [];
  // populate('userId','empCode name') → deleted users embed as null (filtered by
  // analyticsByClass which keeps only r.userId).
  const { rows } = await query(
    `SELECT a.id, a.schedule_id, a.status,
            u.id AS u_id, u.emp_code AS u_emp_code, u.name AS u_name
       FROM attendances a
       LEFT JOIN users u ON u.id = a.user_id AND u.is_deleted = false
      WHERE a.schedule_id = ANY($1)`, [ids]);
  return rows.map((r) => ({
    _id: r.id, scheduleId: r.schedule_id, status: r.status,
    userId: r.u_id ? { _id: r.u_id, empCode: r.u_emp_code, name: r.u_name } : null,
  }));
};

// Mongo bulkWrite of updateOne+upsert ops ({filter:{scheduleId,userId}, update:{$set},
// upsert:true}). INSERT … ON CONFLICT DO UPDATE mirrors the upsert; `xmax = 0`
// distinguishes a fresh insert (upserted) from a conflict (matched). Mongoose
// bumps `updatedAt` via timestamps on EVERY matched updateOne → modifiedCount
// always equals matchedCount (even a no-op re-mark), so the conflict branch
// always updates + counts modified.
const bulkWriteAttendance = async (operations) => {
  let matchedCount = 0; let modifiedCount = 0; let upsertedCount = 0;
  for (const op of operations || []) {
    const { filter, update } = op.updateOne;
    const set = update.$set || {};
    const sId = String(filter.scheduleId);
    const uId = String(filter.userId);
    const status = set.status;
    const remark = set.remark == null ? '' : set.remark;
    const photoUrl = set.photoUrl == null ? '' : set.photoUrl;
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await query(
      `INSERT INTO attendances(id, schedule_id, user_id, status, remark, photo_url, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (schedule_id, user_id) DO UPDATE
         SET status = EXCLUDED.status, remark = EXCLUDED.remark, photo_url = EXCLUDED.photo_url, updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [newId(), sId, uId, status, remark, photoUrl]);
    if (rows[0].inserted) upsertedCount += 1;
    else { matchedCount += 1; modifiedCount += 1; }
  }
  return { matchedCount, modifiedCount, upsertedCount };
};

// PERF-008: $max lastActiveAt → GREATEST (ignores NULL in PG → first stamp sticks;
// never moves backward when an older session is re-marked).
const bumpUsersLastActive = async (userIds, startTime) => {
  const ids = (userIds || []).map(String);
  if (!ids.length) return null;
  await query(
    `UPDATE users SET last_active_at = GREATEST(last_active_at, $1::timestamptz), updated_at = now()
      WHERE id = ANY($2)`,
    [new Date(startTime).toISOString(), ids]);
  return null;
};

// ── Analytics aggregations (data-shaping; rollups stay in ./analytics) ──

const aggregateByEmployee = async (baseMatch, filterUserId, { skip = 0, limit = 100 } = {}) => {
  if (filterUserId && !mongoose.Types.ObjectId.isValid(filterUserId)) {
    throw new ServiceError('Invalid userId format');
  }
  const scheduleIds = scopeScheduleIds(baseMatch);
  const args = [];
  const conds = ['u.is_deleted = false'];
  if (scheduleIds) { args.push(scheduleIds); conds.push(`a.schedule_id = ANY($${args.length})`); }
  if (filterUserId) { args.push(String(filterUserId)); conds.push(`a.user_id = $${args.length}`); }

  // attendanceRate via round(double precision) on ×1000 scale ÷10 = HALF-TO-EVEN
  // (banker's), matching Mongo $round; PG round(numeric,1) would be half-away.
  const { rows } = await query(
    `SELECT u.id AS _id, u.emp_code AS "empCode", u.name, u.department, ${COUNT_COLS},
            CASE WHEN count(a.id) > 0
                 THEN round((count(a.id) FILTER (WHERE a.status = 'P')::double precision / count(a.id) * 1000)) / 10
                 ELSE 0 END AS "attendanceRate"
       FROM attendances a
       JOIN users u ON u.id = a.user_id AND u.is_deleted = false
      WHERE ${conds.join(' AND ')}
      GROUP BY u.id, u.emp_code, u.name, u.department`, args);

  const all = rows.map((r) => ({
    _id: r._id, empCode: r.empCode, name: r.name, department: r.department,
    totalSessions: r.totalSessions, present: r.present, absent: r.absent,
    late: r.late, excused: r.excused, attendanceRate: Number(r.attendanceRate),
  }));
  // $sort {attendanceRate:-1, empCode:1} — empCode binary order.
  all.sort((a, b) => b.attendanceRate - a.attendanceRate || cmp(a.empCode, b.empCode));

  return { data: all.slice(skip, skip + limit), total: all.length };
};

const aggregateTeamsForAnalytics = async (scopedClassIds) => {
  const args = [];
  let scopeSql = '';
  if (scopedClassIds) { args.push(scopedClassIds.map(String)); scopeSql = `AND t.class_id = ANY($${args.length})`; }
  // Team.aggregate soft-delete hook → is_deleted = false. members live in the
  // team_members junction (groups port convention) → array_agg back to an array.
  const { rows } = await query(
    `SELECT t.id, t.name,
            coalesce(array_remove(array_agg(tm.user_id ORDER BY tm.user_id), NULL), '{}') AS members
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
      WHERE t.is_deleted = false ${scopeSql}
      GROUP BY t.id, t.name`, args);
  return rows.map((r) => ({ _id: r.id, name: r.name, members: (r.members || []).map(String) }));
};

const aggregateAttendanceCountsByUser = async (memberIdStrings, scheduleIds = null) => {
  const members = (memberIdStrings || []).map(String);
  if (!members.length) return [];
  const args = [members];
  let scopeSql = '';
  if (scheduleIds) { args.push(scheduleIds.map(String)); scopeSql = `AND a.schedule_id = ANY($${args.length})`; }
  const { rows } = await query(
    `SELECT a.user_id AS _id,
            count(*)::int AS total,
            count(*) FILTER (WHERE a.status = 'P')::int  AS present,
            count(*) FILTER (WHERE a.status = 'A')::int  AS absent,
            count(*) FILTER (WHERE a.status = 'L')::int  AS late,
            count(*) FILTER (WHERE a.status = 'EL')::int AS excused
       FROM attendances a
      WHERE a.user_id = ANY($1) ${scopeSql}
      GROUP BY a.user_id`, args);
  return rows.map((r) => ({
    _id: r._id, total: r.total, present: r.present, absent: r.absent, late: r.late, excused: r.excused,
  }));
};

const aggregateMyStats = async (userId) => {
  const { rows } = await query(
    `SELECT ${COUNT_COLS} FROM attendances a WHERE a.user_id = $1`, [String(userId)]);
  const r = rows[0];
  if (!r || r.totalSessions === 0) return []; // Mongo $group on zero matches → []
  return [{
    _id: null, totalSessions: r.totalSessions, present: r.present,
    absent: r.absent, late: r.late, excused: r.excused,
  }];
};

module.exports = {
  findScheduleForAuthz,
  findScheduleDocById,
  findClassById,
  distinctScheduledIdsForClasses,
  findScheduledForClass,
  findAttendanceBySchedule,
  findAttendanceByUser,
  findAttendanceForSchedules,
  bulkWriteAttendance,
  bumpUsersLastActive,
  aggregateByEmployee,
  aggregateTeamsForAnalytics,
  aggregateAttendanceCountsByUser,
  aggregateMyStats,
};
