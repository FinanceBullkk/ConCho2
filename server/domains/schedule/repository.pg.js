const { query } = require('../../config/pg');
const { COHORT_SCHEDULING_MODES } = require('../_shared/scheduling-modes');

// ──────────────────────────────────────────────────────────
// schedule/repository — POSTGRES impl, slice S1 (PURE READS only).
// Same interface as ./repository.mongo for the no-`session` read methods; the
// session-aware writes (collision/cancel/room-lock/waitlist/mode/capacity) land
// in slice S3 and fall back to mongo via the selector's mongo ⊕ pg merge.
//
// Fidelity notes the parity test pins (Mongo ⇔ SQL):
//   • populate('classId'/'bookedTeamId'/'leaderId'/'enrolledUsers'/
//     'sessionInstructorIds') → batch embed; Class/Team/User soft-delete hooks →
//     a deleted ref drops to null (array populates drop + preserve order).
//   • schedules.enrolled_users / session_instructor_ids are text[]; a scalar
//     Mongo array-match (`enrolledUsers: userId`, `sessionInstructorIds:{$in}`)
//     → `$id = ANY(col)` / `col && $ids` (overlap).
//   • LIVE-only reads filter status='scheduled'; durable-cancelled rows are history.
//   • the Schedule extras (externalTrainer/vendorId/sessionTypeId/agenda/materials/
//     customFields/googleEventId/remindersSentAt) ride in schedules.meta jsonb →
//     spread back as top-level keys (core columns win on collision).
// ──────────────────────────────────────────────────────────

const ids = (a) => (a || []).map(String);
const num = (v) => (v == null ? null : Number(v));

// ── slice S3a: transaction handle + dup-key mapping ───────
// The txn methods below join the caller's Unit-of-Work via tx.client (BEGIN/
// COMMIT on a checked-out client); a non-tx call falls back to the pool. PG's
// 23505 (unique violation) is re-thrown as a Mongo-style { code: 11000 } so the
// room-lock policy's isDuplicateKeyError (err.code === 11000) stays unchanged.
const crypto = require('crypto');
const exec = (tx, text, params) => (tx && tx.client ? tx.client.query(text, params) : query(text, params));
const newId = () => crypto.randomBytes(12).toString('hex');
const duplicateError = () => { const e = new Error('duplicate key value (slot/room already taken)'); e.code = 11000; return e; };

const baseSchedule = (r) => ({
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

// ── batch ref embeds (soft-delete-aware, drop-to-null) ────
const embedClasses = async (rows, withTotal = false) => {
  const cids = [...new Set(rows.map((r) => r.class_id).filter(Boolean))];
  if (!cids.length) return new Map();
  const cols = withTotal ? 'id, class_code, course_name, total_sessions' : 'id, class_code, course_name';
  const { rows: cs } = await query(`SELECT ${cols} FROM classes WHERE id = ANY($1) AND is_deleted = false`, [cids]);
  return new Map(cs.map((c) => [c.id, withTotal
    ? { _id: c.id, classCode: c.class_code, courseName: c.course_name, totalSessions: num(c.total_sessions) }
    : { _id: c.id, classCode: c.class_code, courseName: c.course_name }]));
};

const embedTeams = async (rows) => {
  const tids = [...new Set(rows.map((r) => r.booked_team_id).filter(Boolean))];
  if (!tids.length) return new Map();
  const { rows: ts } = await query(`SELECT id, name FROM teams WHERE id = ANY($1) AND is_deleted = false`, [tids]);
  return new Map(ts.map((t) => [t.id, { _id: t.id, name: t.name }]));
};

const USER_COLS = { empCode: 'emp_code', name: 'name', department: 'department', status: 'status', email: 'email' };
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

// ── Mongo-filter → SQL translator (bounded to the keys queries.js builds) ──
// Handles: classId, status, enrolledUsers (scalar→ANY), startTime {$gte,$lte},
// and $or [{classId:{$in}}, {sessionInstructorIds: scalar}] (calendar teacher scope).
const scheduleWhere = (filter = {}) => {
  const conds = [];
  const args = [];
  const add = (sql, val) => { args.push(val); conds.push(sql.replace('$?', `$${args.length}`)); };
  if (filter.classId) add('class_id = $?', String(filter.classId));
  if (filter.status) add('status = $?', filter.status);
  if (filter.enrolledUsers) add('$? = ANY(enrolled_users)', String(filter.enrolledUsers));
  if (filter.startTime) {
    if (filter.startTime.$gte) add('start_time >= $?', new Date(filter.startTime.$gte).toISOString());
    if (filter.startTime.$lte) add('start_time <= $?', new Date(filter.startTime.$lte).toISOString());
  }
  if (Array.isArray(filter.$or)) {
    const ors = [];
    for (const clause of filter.$or) {
      if (clause.classId && Array.isArray(clause.classId.$in)) {
        args.push(clause.classId.$in.map(String)); ors.push(`class_id = ANY($${args.length})`);
      } else if (clause.sessionInstructorIds) {
        args.push(String(clause.sessionInstructorIds)); ors.push(`$${args.length} = ANY(session_instructor_ids)`);
      }
    }
    if (ors.length) conds.push(`(${ors.join(' OR ')})`);
  }
  return { where: conds.length ? conds.join(' AND ') : 'true', args };
};

// ── Schedule reads ────────────────────────────────────────
const findScheduleById = async (id) => {
  const { rows } = await query(`SELECT * FROM schedules WHERE id = $1`, [String(id)]);
  if (!rows[0]) return null;
  const s = rows[0];
  const [classMap, teamMap, userMap] = await Promise.all([
    embedClasses([s]), embedTeams([s]),
    fetchUsers(s.enrolled_users, ['empCode', 'name', 'department', 'status']),
  ]);
  const out = baseSchedule(s);
  out.classId = s.class_id ? (classMap.get(s.class_id) || null) : null;
  out.bookedTeamId = s.booked_team_id ? (teamMap.get(s.booked_team_id) || null) : null;
  out.enrolledUsers = orderedEmbed(s.enrolled_users, userMap);
  return out;
};

const findScheduleByIdRaw = async (id) => {
  const { rows } = await query(`SELECT * FROM schedules WHERE id = $1`, [String(id)]);
  return rows[0] ? baseSchedule(rows[0]) : null;
};

const findScheduleByIdLean = findScheduleByIdRaw;

// Sheets-sync pre-load (Phase 5 B5-reads): ALL live schedules, minimal shape.
// SELECT * + baseSchedule keeps the id/array/capacity coercions in one place;
// the row count is bounded (live sessions only) and sync is admin-triggered.
const findLiveSchedulesForSync = async () => {
  const { rows } = await query(`SELECT * FROM schedules WHERE status = 'scheduled'`);
  return rows.map(baseSchedule);
};

// ── Post-commit re-fetch reads (read-path completion) ─────
// Twins of the scheduleService booking/cancel re-fetches. Same embed shape as
// findScheduleById but projection-scoped to each call's legacy populate.

// bookSlot / bookCohortSlot / adminCreate response: classId(classCode courseName)
// + bookedTeamId(name) + enrolledUsers(empCode name). googleEventId/meetLink ride
// the meta spread / meet_link column in baseSchedule (booking response needs them).
const findScheduleForResponse = async (id) => {
  const { rows } = await query(`SELECT * FROM schedules WHERE id = $1`, [String(id)]);
  if (!rows[0]) return null;
  const s = rows[0];
  const [classMap, teamMap, userMap] = await Promise.all([
    embedClasses([s]), embedTeams([s]),
    fetchUsers(s.enrolled_users, ['empCode', 'name']),
  ]);
  const out = baseSchedule(s);
  out.classId = s.class_id ? (classMap.get(s.class_id) || null) : null;
  out.bookedTeamId = s.booked_team_id ? (teamMap.get(s.booked_team_id) || null) : null;
  out.enrolledUsers = orderedEmbed(s.enrolled_users, userMap);
  // The Mongo twin is the one HYDRATED re-fetch (res.json runs toJSON with
  // virtuals) — so the booking response carries the derived enrolledCount.
  // Lean reads must NOT get this key (their Mongo twins lack the virtual).
  out.enrolledCount = (s.enrolled_users || []).length;
  return out;
};

// cancelSlot load: classId(classCode courseName) + enrolledUsers(name email);
// bookedTeamId stays the RAW id (baseSchedule default) — leader-auth loads the
// team via findTeamLeaderId.
const findScheduleForCancellation = async (id) => {
  const { rows } = await query(`SELECT * FROM schedules WHERE id = $1`, [String(id)]);
  if (!rows[0]) return null;
  const s = rows[0];
  const [classMap, userMap] = await Promise.all([
    embedClasses([s]),
    fetchUsers(s.enrolled_users, ['name', 'email']),
  ]);
  const out = baseSchedule(s);
  out.classId = s.class_id ? (classMap.get(s.class_id) || null) : null;
  out.enrolledUsers = orderedEmbed(s.enrolled_users, userMap);
  return out;
};

const findAvailabilitySchedules = async ({ classId, fromDate }) => {
  const args = [new Date(fromDate).toISOString()];
  let extra = '';
  if (classId) { args.push(String(classId)); extra = `AND class_id = $${args.length}`; }
  const { rows } = await query(
    `SELECT * FROM schedules WHERE start_time >= $1 AND status = 'scheduled' ${extra} ORDER BY start_time ASC, id ASC`, args);
  const [classMap, teamMap] = await Promise.all([embedClasses(rows), embedTeams(rows)]);
  return rows.map((s) => {
    const out = baseSchedule(s);
    out.classId = s.class_id ? (classMap.get(s.class_id) || null) : null;
    out.bookedTeamId = s.booked_team_id ? (teamMap.get(s.booked_team_id) || null) : null;
    return out;
  });
};

const findSchedulesPage = async (filter, { skip, limit }) => {
  const { where, args } = scheduleWhere(filter);
  args.push(limit, skip);
  const { rows } = await query(
    `SELECT * FROM schedules WHERE ${where} ORDER BY start_time ASC, id ASC LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
  const [classMap, teamMap, userMap] = await Promise.all([
    embedClasses(rows, true), embedTeams(rows),
    fetchUsers(rows.flatMap((r) => r.enrolled_users || []), ['empCode', 'name', 'department']),
  ]);
  return rows.map((s) => {
    const out = baseSchedule(s);
    out.classId = s.class_id ? (classMap.get(s.class_id) || null) : null;
    out.bookedTeamId = s.booked_team_id ? (teamMap.get(s.booked_team_id) || null) : null;
    out.enrolledUsers = orderedEmbed(s.enrolled_users, userMap);
    return out;
  });
};

const countSchedules = async (filter) => {
  const { where, args } = scheduleWhere(filter);
  const { rows } = await query(`SELECT count(*)::int AS n FROM schedules WHERE ${where}`, args);
  return rows[0].n;
};

const findTeamsByMember = async (userId) => {
  // Team.find({members:userId}) → team_members junction; populate('leaderId').
  const { rows } = await query(
    `SELECT t.id, t.class_id, t.name, t.leader_id
       FROM teams t JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = $1 AND t.is_deleted = false`, [String(userId)]);
  const leaderMap = await fetchUsers(rows.map((r) => r.leader_id).filter(Boolean), ['name', 'empCode', 'email', 'department']);
  return rows.map((t) => ({
    _id: t.id, classId: t.class_id || null, name: t.name,
    leaderId: t.leader_id ? (leaderMap.get(t.leader_id) || null) : null,
  }));
};

const findUpcomingForClasses = async (classIds, fromDate, limit) => {
  const { rows } = await query(
    `SELECT * FROM schedules
      WHERE class_id = ANY($1) AND start_time >= $2 AND status = 'scheduled'
      ORDER BY start_time ASC, id ASC LIMIT $3`,
    [ids(classIds), new Date(fromDate).toISOString(), limit]);
  const [classMap, teamMap] = await Promise.all([embedClasses(rows, true), embedTeams(rows)]);
  return rows.map((s) => {
    const out = baseSchedule(s);
    out.classId = s.class_id ? (classMap.get(s.class_id) || null) : null;
    out.bookedTeamId = s.booked_team_id ? (teamMap.get(s.booked_team_id) || null) : null;
    return out;
  });
};

const findCalendarSchedules = async (filter) => {
  // The method adds status='scheduled' on top of the passed filter.
  const { where, args } = scheduleWhere({ ...filter, status: 'scheduled' });
  const { rows } = await query(`SELECT * FROM schedules WHERE ${where} ORDER BY start_time ASC, id ASC`, args);
  const [classMap, teamMap] = await Promise.all([embedClasses(rows, true), embedTeams(rows)]);
  return rows.map((s) => {
    const out = baseSchedule(s); // enrolledUsers stays as id[] (not populated here)
    out.classId = s.class_id ? (classMap.get(s.class_id) || null) : null;
    out.bookedTeamId = s.booked_team_id ? (teamMap.get(s.booked_team_id) || null) : null;
    return out;
  });
};

const findScheduledByClassIdsOrdered = async (classIds) => {
  const { rows } = await query(
    `SELECT id, class_id, start_time FROM schedules
      WHERE class_id = ANY($1) AND status = 'scheduled' ORDER BY start_time ASC, id ASC`, [ids(classIds)]);
  return rows.map((r) => ({ _id: r.id, classId: r.class_id, startTime: r.start_time }));
};

const findScheduleForCalendarSync = async (id) => {
  const { rows } = await query(`SELECT * FROM schedules WHERE id = $1`, [String(id)]);
  if (!rows[0]) return null;
  const s = rows[0];
  const [classMap, teamMap, enrMap, instrMap] = await Promise.all([
    embedClasses([s]), embedTeams([s]),
    fetchUsers(s.enrolled_users, ['empCode', 'name', 'email']),
    fetchUsers(s.session_instructor_ids, ['empCode', 'name', 'email']),
  ]);
  const out = baseSchedule(s);
  out.classId = s.class_id ? (classMap.get(s.class_id) || null) : null;
  out.bookedTeamId = s.booked_team_id ? (teamMap.get(s.booked_team_id) || null) : null;
  out.enrolledUsers = orderedEmbed(s.enrolled_users, enrMap);
  out.sessionInstructorIds = orderedEmbed(s.session_instructor_ids, instrMap);
  return out;
};

const findScheduleClassLabel = async (id) => {
  const { rows } = await query(`SELECT id, class_id FROM schedules WHERE id = $1`, [String(id)]);
  if (!rows[0]) return null;
  const classMap = await embedClasses([rows[0]]);
  return { _id: rows[0].id, classId: rows[0].class_id ? (classMap.get(rows[0].class_id) || null) : null };
};

const findUsersForEmail = async (userIds) => {
  const list = ids(userIds);
  if (!list.length) return [];
  const { rows } = await query(`SELECT id, name, email FROM users WHERE id = ANY($1) AND is_deleted = false`, [list]);
  return rows.map((r) => ({ _id: r.id, name: r.name, email: r.email }));
};

const aggregateAttendanceCounts = async (scheduleIds) => {
  const list = ids(scheduleIds);
  if (!list.length) return [];
  const { rows } = await query(
    `SELECT schedule_id AS _id, count(*)::int AS count FROM attendances
      WHERE schedule_id = ANY($1) GROUP BY schedule_id`, [list]);
  return rows.map((r) => ({ _id: r._id, count: r.count }));
};

// ── Trainers / instructors ────────────────────────────────
const findValidInstructorIds = async (instructorIds) => {
  if (!Array.isArray(instructorIds) || instructorIds.length === 0) return [];
  const { rows } = await query(
    `SELECT id FROM users
      WHERE id = ANY($1) AND role = ANY($2) AND status IS DISTINCT FROM 'Dropped' AND is_deleted = false`,
    [ids(instructorIds), ['Teacher', 'Admin']]);
  return rows.map((r) => r.id);
};

const findInstructorConflict = async (instructorIds, start, end, excludeId) => {
  if (!instructorIds || instructorIds.length === 0) return null;
  const args = [ids(instructorIds), new Date(end).toISOString(), new Date(start).toISOString()];
  let excl = '';
  if (excludeId) { args.push(String(excludeId)); excl = `AND id <> $${args.length}`; }
  // sessionInstructorIds {$in} on an array = overlap (&&); time-overlap; live only.
  const { rows } = await query(
    `SELECT id, class_id, start_time, end_time, session_instructor_ids FROM schedules
      WHERE session_instructor_ids && $1 AND start_time < $2 AND end_time > $3 AND status = 'scheduled' ${excl}
      LIMIT 1`, args);
  const r = rows[0];
  return r ? {
    _id: r.id, classId: r.class_id, startTime: r.start_time, endTime: r.end_time,
    sessionInstructorIds: ids(r.session_instructor_ids),
  } : null;
};

// ── Teacher scope / scheduling-world / facilitator reads ──
const findTeacherScopedClassIds = async (teacherId) => {
  // own classes OR legacy empty teacher_ids (graceful migration).
  const { rows } = await query(
    `SELECT id FROM classes WHERE is_deleted = false AND ($1 = ANY(teacher_ids) OR cardinality(teacher_ids) = 0 OR teacher_ids IS NULL)`,
    [String(teacherId)]);
  return rows.map((r) => ({ _id: r.id }));
};

const findCohortModeClassIds = async () => {
  const { rows } = await query(
    `SELECT id FROM classes
      WHERE is_deleted = false
        AND program_id IN (SELECT id FROM learning_programs WHERE scheduling_mode = ANY($1))`,
    [COHORT_SCHEDULING_MODES]);
  return rows.map((r) => r.id);
};

const findClassForFacilitator = async (classId) => {
  const { rows } = await query(`SELECT id, program_id, teacher_ids FROM classes WHERE id = $1 AND is_deleted = false`, [String(classId)]);
  const c = rows[0];
  return c ? { _id: c.id, programId: c.program_id || null, teacherIds: ids(c.teacher_ids) } : null;
};

const findProgramFacilitatorPolicy = async (programId) => {
  const { rows } = await query(`SELECT id, facilitator_policy FROM learning_programs WHERE id = $1`, [String(programId)]);
  return rows[0] ? { _id: rows[0].id, facilitatorPolicy: rows[0].facilitator_policy || undefined } : null;
};

const findClassProgramId = async (cohortId) => {
  const { rows } = await query(`SELECT id, program_id FROM classes WHERE id = $1 AND is_deleted = false`, [String(cohortId)]);
  return rows[0] ? { _id: rows[0].id, programId: rows[0].program_id || null } : null;
};

const findProgramVisibility = async (programId) => {
  const { rows } = await query(`SELECT id, facilitator_policy FROM learning_programs WHERE id = $1`, [String(programId)]);
  if (!rows[0]) return null;
  const vis = rows[0].facilitator_policy && rows[0].facilitator_policy.visibility;
  return { _id: rows[0].id, facilitatorPolicy: vis === undefined ? undefined : { visibility: vis } };
};

const findClassesProgramIds = async (cohortIds) => {
  const list = ids(cohortIds);
  if (!list.length) return [];
  const { rows } = await query(`SELECT id, program_id FROM classes WHERE id = ANY($1) AND is_deleted = false`, [list]);
  return rows.map((r) => ({ _id: r.id, programId: r.program_id || null }));
};

const findAssignedOnlyPrograms = async (programIds) => {
  const list = ids(programIds);
  if (!list.length) return [];
  const { rows } = await query(
    `SELECT id FROM learning_programs WHERE id = ANY($1) AND facilitator_policy->>'visibility' = 'assigned_only'`, [list]);
  return rows.map((r) => ({ _id: r.id }));
};

// ── Settings ──────────────────────────────────────────────
const findAllowedTimeSlotsSetting = async () => {
  const { rows } = await query(`SELECT id, key, value, description, created_at, updated_at FROM settings WHERE key = 'ALLOWED_TIME_SLOTS' LIMIT 1`);
  const r = rows[0];
  return r ? {
    _id: r.id, key: r.key, value: r.value,
    description: r.description == null ? '' : r.description,
    createdAt: r.created_at, updatedAt: r.updated_at,
  } : null;
};

// ──────────────────────────────────────────────────────────
// slice S3a — booking/cancel/room-lock/waitlist/mode/capacity TXN methods.
// Dual-backend twins of the session-aware mongo methods, threaded through tx.
// (updateScheduleById generic field-mapper + findTeamById opts-session land in
// slice S3b with the scheduleService orchestration cutover.)
// ──────────────────────────────────────────────────────────

// Only LIVE rows collide: time-overlap + status='scheduled' (mirrors the
// partial-unique). Caller checks truthiness only → minimal { _id } shape.
const findScheduleForCollision = async (classId, start, end, excludeId, tx) => {
  const args = [String(classId), new Date(end).toISOString(), new Date(start).toISOString()];
  let excl = '';
  if (excludeId) { args.push(String(excludeId)); excl = `AND id <> $${args.length}`; }
  const { rows } = await exec(tx,
    `SELECT id FROM schedules WHERE class_id = $1 AND start_time < $2 AND end_time > $3 AND status = 'scheduled' ${excl} LIMIT 1`, args);
  return rows[0] ? { _id: rows[0].id } : null;
};

// Cancelled sessions don't consume the team's weekly quota (status='scheduled').
const countSchedulesForTeamInWeek = async (teamId, weekStart, weekEnd, excludeId, tx) => {
  const args = [String(teamId), new Date(weekStart).toISOString(), new Date(weekEnd).toISOString()];
  let excl = '';
  if (excludeId) { args.push(String(excludeId)); excl = `AND id <> $${args.length}`; }
  const { rows } = await exec(tx,
    `SELECT count(*)::int AS n FROM schedules
      WHERE booked_team_id = $1 AND start_time >= $2 AND start_time <= $3 AND status = 'scheduled' ${excl}`, args);
  return rows[0].n;
};

// Class.programId → LearningProgram.capacityPolicy; {} for a program-less (or
// soft-deleted) class — the "open until populated" fallback.
const findClassCapacityPolicy = async (classId, tx) => {
  if (!classId) return {};
  const { rows } = await exec(tx, `SELECT program_id FROM classes WHERE id = $1 AND is_deleted = false`, [String(classId)]);
  if (!rows[0] || !rows[0].program_id) return {};
  const { rows: pr } = await exec(tx, `SELECT capacity_policy FROM learning_programs WHERE id = $1`, [String(rows[0].program_id)]);
  return (pr[0] && pr[0].capacity_policy) || {};
};

// Class.programId → LearningProgram.schedulingMode; 'leader_booking' fallback.
const findClassSchedulingMode = async (classId, tx) => {
  if (!classId) return 'leader_booking';
  const { rows } = await exec(tx, `SELECT program_id FROM classes WHERE id = $1 AND is_deleted = false`, [String(classId)]);
  if (!rows[0] || !rows[0].program_id) return 'leader_booking';
  const { rows: pr } = await exec(tx, `SELECT scheduling_mode FROM learning_programs WHERE id = $1`, [String(rows[0].program_id)]);
  return (pr[0] && pr[0].scheduling_mode) || 'leader_booking';
};

// Attendance.exists shape: { _id } | null (caller uses truthiness).
const attendanceExistsForSchedule = async (scheduleId, tx) => {
  const { rows } = await exec(tx, `SELECT id FROM attendances WHERE schedule_id = $1 LIMIT 1`, [String(scheduleId)]);
  return rows[0] ? { _id: rows[0].id } : null;
};

// Durable cancel: conditional flip (one winner; loser → null → 409). roomId
// nulled in the same write (caller drops the ledger row in the same tx — B3).
const cancelScheduleById = async (id, { cancelledBy = null, cancelReason = '' } = {}, tx) => {
  const { rows } = await exec(tx,
    `UPDATE schedules
        SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3, room_id = NULL, updated_at = now()
      WHERE id = $1 AND status = 'scheduled' RETURNING *`,
    [String(id), cancelledBy == null ? null : String(cancelledBy), cancelReason || '']);
  return rows[0] ? baseSchedule(rows[0]) : null;
};

// Booking team load (slice S3b-1). lock:true → SELECT … FOR UPDATE row-locks the
// team row so concurrent same-team bookings serialize (the PG analogue of Mongo's
// findByIdAndUpdate {updatedAt} write trick); the blocked txn then re-reads the
// weekly-cap count AFTER the winner commits (READ COMMITTED). members are
// soft-delete-dropped (u.is_deleted=false).
const loadTeamForBooking = async (teamId, tx, { lock = false } = {}) => {
  const { rows } = await exec(tx,
    `SELECT id, class_id, leader_id FROM teams WHERE id = $1 AND is_deleted = false ${lock ? 'FOR UPDATE' : ''}`,
    [String(teamId)]);
  const t = rows[0];
  if (!t) return null;
  const { rows: mem } = await exec(tx,
    `SELECT u.id, u.status FROM team_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1 AND u.is_deleted = false`, [String(teamId)]);
  return {
    _id: t.id, classId: t.class_id || null, leaderId: t.leader_id || null,
    members: mem.map((m) => ({ _id: m.id, status: m.status })),
  };
};

// ── Waitlist release (release-resources) ──────────────────
const findWaitingEntries = async (scheduleIds, tx) => {
  const list = ids(scheduleIds);
  if (!list.length) return [];
  const { rows } = await exec(tx,
    `SELECT id, user_id FROM waitlist_entries WHERE schedule_id = ANY($1) AND status = 'waiting'`, [list]);
  return rows.map((r) => ({ _id: r.id, userId: r.user_id }));
};

const cancelWaitingEntries = async (scheduleIds, tx) => {
  const list = ids(scheduleIds);
  if (!list.length) return { modifiedCount: 0 };
  const res = await exec(tx,
    `UPDATE waitlist_entries SET status = 'cancelled', updated_at = now() WHERE schedule_id = ANY($1) AND status = 'waiting'`, [list]);
  return { modifiedCount: res.rowCount };
};

// ── Room-lock ledger (room-lock-policy) ───────────────────
const findRoomForLock = async (roomId, tx) => {
  const { rows } = await exec(tx, `SELECT id, office_id, is_active FROM rooms WHERE id = $1 AND is_deleted = false`, [String(roomId)]);
  const r = rows[0];
  return r ? { _id: r.id, officeId: r.office_id || null, isActive: r.is_active } : null;
};

// THE room lock: unique (room_id,start_time) → 23505 → { code:11000 } → 409.
const createRoomBooking = async ({ roomId, scheduleId, classId, startTime }, tx) => {
  try {
    const { rows } = await exec(tx,
      `INSERT INTO room_bookings(id, room_id, schedule_id, class_id, start_time) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [newId(), String(roomId), String(scheduleId), String(classId), new Date(startTime).toISOString()]);
    return [{ _id: rows[0].id }]; // mongo create([...]) returns an array; caller ignores
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
};

const setScheduleRoom = async (scheduleId, roomId, tx) => {
  const res = await exec(tx, `UPDATE schedules SET room_id = $2, updated_at = now() WHERE id = $1`,
    [String(scheduleId), roomId == null ? null : String(roomId)]);
  return { modifiedCount: res.rowCount };
};

const deleteRoomBookings = async (scheduleIds, tx) => {
  const list = ids(scheduleIds);
  if (!list.length) return { deletedCount: 0 };
  const res = await exec(tx, `DELETE FROM room_bookings WHERE schedule_id = ANY($1)`, [list]);
  return { deletedCount: res.rowCount };
};

// ── slice S3b-2: the last 2 deferred methods (generic update + team-by-id) ──
// updateScheduleById = the field-mapped UPDATE twin of insertSession: core fields
// → columns, column-less extras (agenda/materials/customFields/externalTrainer/…)
// merge into meta jsonb. Empty data → no-op returning the current row (mirrors
// Mongo findByIdAndUpdate(id, {})). Returns baseSchedule(updated row).
const UPDATE_COLS = {
  classId: 'class_id', bookedTeamId: 'booked_team_id', roomId: 'room_id', roomLink: 'room_link', topic: 'topic',
  // meet_link is a REAL column (mig 020) — without this mapping the calendar
  // writeback (A3) would land in meta while baseSchedule reads the column,
  // silently dropping the Meet link on every PG read.
  meetLink: 'meet_link',
};
const UPDATE_DATE_COLS = { startTime: 'start_time', endTime: 'end_time' };
const UPDATE_ARRAY_COLS = { enrolledUsers: 'enrolled_users', sessionInstructorIds: 'session_instructor_ids' };

const updateScheduleById = async (id, data, tx) => {
  const sets = [];
  const args = [];
  const meta = {};
  const add = (col, val, cast = '') => { args.push(val); sets.push(`${col} = $${args.length}${cast}`); };
  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined) continue;
    if (UPDATE_COLS[k]) add(UPDATE_COLS[k], v == null ? null : String(v));
    else if (UPDATE_DATE_COLS[k]) add(UPDATE_DATE_COLS[k], v == null ? null : new Date(v).toISOString());
    else if (UPDATE_ARRAY_COLS[k]) add(UPDATE_ARRAY_COLS[k], (v || []).map(String), '::text[]');
    else if (k === 'capacity') add('capacity', v == null ? null : Number(v));
    else meta[k] = v;
  }
  if (Object.keys(meta).length) { args.push(JSON.stringify(meta)); sets.push(`meta = COALESCE(meta, '{}'::jsonb) || $${args.length}::jsonb`); }
  if (!sets.length) { // empty update → no-op, return current row
    const { rows } = await exec(tx, `SELECT * FROM schedules WHERE id = $1`, [String(id)]);
    return rows[0] ? baseSchedule(rows[0]) : null;
  }
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await exec(tx, `UPDATE schedules SET ${sets.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
  return rows[0] ? baseSchedule(rows[0]) : null;
};

// Team-by-id with the 2 shapes the schedule domain uses: {select:'classId'} →
// {_id, classId}; {select:'members', populate members} → +members:[{_id,status}].
// tx travels in opts.session (pg exec). Soft-deleted team → null; deleted members dropped.
const findTeamById = async (id, opts = {}) => {
  const tx = opts.session;
  const { rows } = await exec(tx, `SELECT id, class_id FROM teams WHERE id = $1 AND is_deleted = false`, [String(id)]);
  const t = rows[0];
  if (!t) return null;
  const out = { _id: t.id, classId: t.class_id || null };
  if (opts.select && opts.select.includes('members')) {
    const { rows: mem } = await exec(tx,
      `SELECT u.id, u.status FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = $1 AND u.is_deleted = false`,
      [String(id)]);
    out.members = mem.map((m) => ({ _id: m.id, status: m.status }));
  }
  return out;
};

// cancelSlot leader-auth — minimal team-leader lookup. is_deleted predicate
// mirrors the Mongo Team soft-delete pre-find hook.
const findTeamLeaderId = async (teamId) => {
  const { rows } = await query(`SELECT id, leader_id FROM teams WHERE id = $1 AND is_deleted = false`, [String(teamId)]);
  return rows[0] ? { _id: rows[0].id, leaderId: rows[0].leader_id || null } : null;
};

// ── Roster-sync primitives (team member-edit + user auto-release) ──
// PG twins of the Mongo repo methods used by domains/schedule/roster-sync.
// LIVE future schedules only (status='scheduled', start_time >= today).
const findFutureTeamSchedules = async (teamId, today, tx) => {
  const { rows } = await exec(tx,
    `SELECT id, class_id, capacity, enrolled_users FROM schedules
     WHERE start_time >= $1 AND booked_team_id = $2 AND status = 'scheduled'`,
    [new Date(today).toISOString(), String(teamId)]);
  return rows.map((r) => ({
    _id: r.id,
    classId: r.class_id || null,
    capacity: r.capacity == null ? undefined : Number(r.capacity),
    enrolledUsers: ids(r.enrolled_users),
  }));
};

const findFutureUserSchedules = async (userId, today, tx) => {
  const { rows } = await exec(tx,
    `SELECT id, enrolled_users FROM schedules
     WHERE start_time >= $1 AND $2 = ANY(enrolled_users) AND status = 'scheduled'`,
    [new Date(today).toISOString(), String(userId)]);
  return rows.map((r) => ({ _id: r.id, enrolledUsers: ids(r.enrolled_users) }));
};

// Array twin of $pull removed + $push added on enrolled_users text[]: strip any
// id in removeIds (array_agg over the survivors), then append addIds. The
// orchestrator only passes present-to-remove / absent-to-add ids (no dups).
const applyRosterDelta = async (scheduleId, removeIds, addIds, tx) => {
  await exec(tx,
    `UPDATE schedules
     SET enrolled_users = (
       COALESCE(
         (SELECT array_agg(u) FROM unnest(COALESCE(enrolled_users, '{}'::text[])) AS u
          WHERE u <> ALL($2::text[])),
         '{}'::text[]
       ) || $3::text[]
     ), updated_at = now()
     WHERE id = $1`,
    [String(scheduleId), removeIds.map(String), addIds.map(String)]);
};

const findEmptyScheduleIds = async (scheduleIds, tx) => {
  if (!scheduleIds.length) return [];
  const { rows } = await exec(tx,
    `SELECT id FROM schedules
     WHERE id = ANY($1::text[]) AND cardinality(COALESCE(enrolled_users, '{}'::text[])) = 0`,
    [scheduleIds.map(String)]);
  return rows.map((r) => r.id);
};

const deleteSchedulesByIds = async (scheduleIds, tx) => {
  if (!scheduleIds.length) return;
  await exec(tx, `DELETE FROM schedules WHERE id = ANY($1::text[])`, [scheduleIds.map(String)]);
};

// ── Dropped-user roster pull (Phase 5 slice 4, B2-tail) ─────────────────────
// Twin of the Mongo $pull-$in across future live rosters. `enrolled_users &&`
// keeps the UPDATE to affected rows only; tx-aware via exec.
const pullUsersFromFutureSchedules = async (userIds, tx) => {
  if (!userIds || userIds.length === 0) return { modifiedCount: 0 };
  const { rowCount } = await exec(tx,
    `UPDATE schedules
        SET enrolled_users = COALESCE(
              (SELECT array_agg(u) FROM unnest(enrolled_users) AS u WHERE u <> ALL($1::text[])),
              '{}'::text[]
            ), updated_at = now()
      WHERE start_time > now() AND status = 'scheduled' AND enrolled_users && $1::text[]`,
    [userIds.map(String)]);
  return { modifiedCount: rowCount };
};

// ── Reminder claim/stamp (Phase 5 slice 4, B7 — mig 034) ───────────────────
// Twin of the Mongo atomic bulk claim. reminders_sent_at IS NULL covers both
// the Mongo "$exists:false" (legacy rows) and explicit null (rolled back).
const claimUpcomingReminders = async (now, windowEnd, claimStamp) => {
  const { rowCount } = await query(
    `UPDATE schedules SET reminders_sent_at = $3, updated_at = now()
      WHERE start_time >= $1 AND start_time <= $2
        AND status = 'scheduled' AND reminders_sent_at IS NULL`,
    [new Date(now).toISOString(), new Date(windowEnd).toISOString(), new Date(claimStamp).toISOString()]);
  return { acknowledged: true, matchedCount: rowCount, modifiedCount: rowCount };
};

// Exact-stamp re-fetch + the email-template embeds (class label, recipient
// name/email — soft-deleted refs drop like the hook-filtered populate).
const findClaimedForReminder = async (claimStamp) => {
  const { rows } = await query(
    `SELECT * FROM schedules WHERE reminders_sent_at = $1`,
    [new Date(claimStamp).toISOString()]);
  if (!rows.length) return [];
  const [classMap, userMap] = await Promise.all([
    embedClasses(rows),
    fetchUsers([...new Set(rows.flatMap((r) => r.enrolled_users || []))], ['name', 'email']),
  ]);
  return rows.map((s) => {
    const out = baseSchedule(s);
    out.classId = s.class_id ? (classMap.get(s.class_id) || null) : null;
    out.enrolledUsers = orderedEmbed(s.enrolled_users, userMap);
    return out;
  });
};

const rollbackReminderClaim = async (scheduleIds) => {
  const { rowCount } = await query(
    `UPDATE schedules SET reminders_sent_at = NULL, updated_at = now() WHERE id = ANY($1::text[])`,
    [scheduleIds.map(String)]);
  return { acknowledged: true, matchedCount: rowCount, modifiedCount: rowCount };
};

module.exports = {
  updateScheduleById,
  findTeamById,
  findTeamLeaderId,
  findFutureTeamSchedules,
  findFutureUserSchedules,
  applyRosterDelta,
  pullUsersFromFutureSchedules,
  claimUpcomingReminders,
  findClaimedForReminder,
  rollbackReminderClaim,
  findEmptyScheduleIds,
  deleteSchedulesByIds,
  findScheduleForCollision,
  countSchedulesForTeamInWeek,
  findClassCapacityPolicy,
  findClassSchedulingMode,
  attendanceExistsForSchedule,
  cancelScheduleById,
  findWaitingEntries,
  cancelWaitingEntries,
  findRoomForLock,
  createRoomBooking,
  setScheduleRoom,
  deleteRoomBookings,
  loadTeamForBooking,
  findScheduleById,
  findScheduleByIdRaw,
  findScheduleForResponse,
  findScheduleForCancellation,
  findScheduleByIdLean,
  findScheduledByClassIdsOrdered,
  findScheduleForCalendarSync,
  findLiveSchedulesForSync,
  findScheduleClassLabel,
  findUsersForEmail,
  findAllowedTimeSlotsSetting,
  findClassForFacilitator,
  findProgramFacilitatorPolicy,
  findClassProgramId,
  findProgramVisibility,
  findClassesProgramIds,
  findAssignedOnlyPrograms,
  findInstructorConflict,
  findCohortModeClassIds,
  findValidInstructorIds,
  findAvailabilitySchedules,
  findSchedulesPage,
  countSchedules,
  findTeamsByMember,
  findUpcomingForClasses,
  findCalendarSchedules,
  findTeacherScopedClassIds,
  aggregateAttendanceCounts,
};
