const crypto = require('crypto');
const { query } = require('../../../config/pg');

// ──────────────────────────────────────────────────────────
// Waitlist repository — POSTGRES impl (Phase 3 Wave-D slice S2).
// ──────────────────────────────────────────────────────────
// Same interface as ./repository.mongo. Reads + the two simple writes
// (createEntry / withdrawMyEntry) on the waitlist_entries table (migration 027).
// No cross-table transaction here — the in-tx FIFO promotion + release land in
// S3/S4. The selector (./repository) routes by DB_BACKEND; default mongo.
//
// Fidelity the parity test pins (Mongo ⇔ SQL):
//   • createEntry: the partial-unique uq_waitlist_live ON (schedule_id,user_id)
//     WHERE status='waiting' is the double-join guard; 23505 → Mongo-style
//     { code: 11000 } so the use-case's `err.code === 11000` → 409 is unchanged.
//   • status-lifecycle, NO soft-delete — rows are history; withdraw flips status.
//   • populate('userId') / nested populate(scheduleId→class/office/room): a
//     soft-deleted ref drops to null (Class/Team/Office/Room have is_deleted;
//     User too). Schedule has NO soft-delete (status-based) — always embeds.
//   • FIFO order = created_at ASC; positionOf counts older WAITING rows only.
//   • ids returned as strings (Mongo ObjectId → hex); idEq/idOf consumers coerce.
// ──────────────────────────────────────────────────────────

// ObjectId-shaped id for new rows (24 hex) — uniform with migrated Mongo ids.
const newId = () => crypto.randomBytes(12).toString('hex');

// PG 23505 → Mongo-style duplicate-key error so use-cases stay backend-agnostic.
const duplicateError = () => {
  const e = new Error('duplicate key value (already on this waitlist)');
  e.code = 11000;
  return e;
};

// scheduleId may arrive raw (string) OR populated ({_id,...}) — mirror Mongoose's
// ObjectId cast which extracts _id from a document value (positionOf via listMine).
const idOf = (v) => (v && typeof v === 'object' && v._id != null ? String(v._id) : String(v));

const mapEntry = (r) => ({
  _id: r.id,
  scheduleId: r.schedule_id,
  classId: r.class_id,
  userId: r.user_id,
  status: r.status,
  promotedAt: r.promoted_at || null,
  joinedBy: r.joined_by || null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ── batch user embed (soft-delete-aware, drop-to-null) ────
const USER_COLS = { empCode: 'emp_code', name: 'name', department: 'department', email: 'email' };
const fetchUsers = async (idList, fields) => {
  const uniq = [...new Set((idList || []).map(String))];
  if (!uniq.length) return new Map();
  const cols = ['id', ...fields.map((f) => USER_COLS[f])].join(', ');
  const { rows } = await query(`SELECT ${cols} FROM users WHERE id = ANY($1) AND is_deleted = false`, [uniq]);
  return new Map(rows.map((r) => {
    const o = { _id: r.id };
    for (const f of fields) o[f] = r[USER_COLS[f]];
    return [r.id, o];
  }));
};

// ── Schedule / Team / Enrollment / Class reads (join preconditions) ──
const findScheduleForJoin = async (id) => {
  const { rows } = await query(
    `SELECT id, status, start_time, class_id, booked_team_id, capacity, enrolled_users
       FROM schedules WHERE id = $1`,
    [String(id)],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    _id: r.id,
    status: r.status,
    startTime: r.start_time,
    classId: r.class_id || null,
    bookedTeamId: r.booked_team_id || null,
    capacity: r.capacity == null ? undefined : Number(r.capacity),
    enrolledUsers: (r.enrolled_users || []).map(String),
  };
};

// Team.findById applies the soft-delete hook → a deleted team reads as null.
const findTeamMembers = async (teamId) => {
  const { rows } = await query(`SELECT id FROM teams WHERE id = $1 AND is_deleted = false`, [String(teamId)]);
  if (!rows[0]) return null;
  const { rows: mem } = await query(`SELECT user_id FROM team_members WHERE team_id = $1`, [String(teamId)]);
  return { _id: teamId, members: mem.map((m) => m.user_id) };
};

// Enrollment has NO soft-delete — plain status/team_id predicate.
const hasActiveCohortEnrollment = async (classId, userId) => {
  const { rows } = await query(
    `SELECT 1 FROM enrollments
      WHERE class_id = $1 AND user_id = $2 AND team_id IS NULL AND status = 'Active' LIMIT 1`,
    [String(classId), String(userId)],
  );
  return rows.length > 0;
};

const isTeacherAllowedForClass = async (classId, teacherId) => {
  const { rows } = await query(`SELECT teacher_ids FROM classes WHERE id = $1 AND is_deleted = false`, [String(classId)]);
  if (!rows[0]) return false;
  const tids = (rows[0].teacher_ids || []).map(String);
  if (tids.length === 0) return true; // open until populated
  return tids.some((t) => t === String(teacherId));
};

// ── Waitlist writes (simple — no cross-table tx) ──────────
const createEntry = async ({ scheduleId, classId, userId, joinedBy }) => {
  try {
    const { rows } = await query(
      `INSERT INTO waitlist_entries(id, schedule_id, class_id, user_id, status, joined_by)
       VALUES ($1, $2, $3, $4, 'waiting', $5) RETURNING *`,
      [newId(), String(scheduleId), String(classId), String(userId), joinedBy == null ? null : String(joinedBy)],
    );
    return mapEntry(rows[0]);
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
};

const withdrawMyEntry = async (scheduleId, userId) => {
  const { rows } = await query(
    `UPDATE waitlist_entries SET status = 'withdrawn', updated_at = now()
      WHERE schedule_id = $1 AND user_id = $2 AND status = 'waiting' RETURNING *`,
    [String(scheduleId), String(userId)],
  );
  return rows[0] ? mapEntry(rows[0]) : null;
};

// ── Waitlist reads ────────────────────────────────────────
const findMyWaitingEntry = async (scheduleId, userId) => {
  const { rows } = await query(
    `SELECT * FROM waitlist_entries
      WHERE schedule_id = $1 AND user_id = $2 AND status = 'waiting' LIMIT 1`,
    [String(scheduleId), String(userId)],
  );
  return rows[0] ? mapEntry(rows[0]) : null;
};

const positionOf = async (entry) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM waitlist_entries
      WHERE schedule_id = $1 AND status = 'waiting' AND created_at < $2`,
    [idOf(entry.scheduleId), new Date(entry.createdAt).toISOString()],
  );
  return 1 + rows[0].n;
};

const listEntriesForSchedule = async (scheduleId) => {
  const { rows } = await query(
    `SELECT * FROM waitlist_entries WHERE schedule_id = $1 ORDER BY created_at ASC, id ASC`,
    [String(scheduleId)],
  );
  const userMap = await fetchUsers(rows.map((r) => r.user_id), ['empCode', 'name', 'department']);
  return rows.map((r) => ({
    ...mapEntry(r),
    userId: r.user_id ? (userMap.get(r.user_id) || null) : null,
  }));
};

// nested embeds for listMyWaitingEntries (soft-delete-aware drop-to-null)
const embedSchedules = async (scheduleIds) => {
  const sids = [...new Set(scheduleIds.filter(Boolean))];
  if (!sids.length) return new Map();
  const { rows: scheds } = await query(
    `SELECT id, start_time, end_time, class_id, office_id, room_id, status
       FROM schedules WHERE id = ANY($1)`,
    [sids],
  );
  const cids = [...new Set(scheds.map((s) => s.class_id).filter(Boolean))];
  const oids = [...new Set(scheds.map((s) => s.office_id).filter(Boolean))];
  const rids = [...new Set(scheds.map((s) => s.room_id).filter(Boolean))];
  const [classMap, officeMap, roomMap] = await Promise.all([
    cids.length
      ? query(`SELECT id, class_code, course_name FROM classes WHERE id = ANY($1) AND is_deleted = false`, [cids])
        .then(({ rows }) => new Map(rows.map((c) => [c.id, { _id: c.id, classCode: c.class_code, courseName: c.course_name }])))
      : new Map(),
    oids.length
      ? query(`SELECT id, name, code FROM offices WHERE id = ANY($1) AND is_deleted = false`, [oids])
        .then(({ rows }) => new Map(rows.map((o) => [o.id, { _id: o.id, name: o.name, code: o.code }])))
      : new Map(),
    rids.length
      ? query(`SELECT id, name, code FROM rooms WHERE id = ANY($1) AND is_deleted = false`, [rids])
        .then(({ rows }) => new Map(rows.map((rm) => [rm.id, { _id: rm.id, name: rm.name, code: rm.code }])))
      : new Map(),
  ]);
  return new Map(scheds.map((s) => [s.id, {
    _id: s.id,
    startTime: s.start_time,
    endTime: s.end_time,
    classId: s.class_id ? (classMap.get(s.class_id) || null) : null,
    officeId: s.office_id ? (officeMap.get(s.office_id) || null) : null,
    roomId: s.room_id ? (roomMap.get(s.room_id) || null) : null,
    status: s.status,
  }]));
};

const listMyWaitingEntries = async (userId) => {
  const { rows } = await query(
    `SELECT * FROM waitlist_entries WHERE user_id = $1 AND status = 'waiting' ORDER BY created_at ASC, id ASC`,
    [String(userId)],
  );
  if (!rows.length) return [];
  const schedMap = await embedSchedules(rows.map((r) => r.schedule_id));
  return rows.map((r) => ({
    ...mapEntry(r),
    scheduleId: r.schedule_id ? (schedMap.get(r.schedule_id) || null) : null,
  }));
};

module.exports = {
  findScheduleForJoin,
  findTeamMembers,
  hasActiveCohortEnrollment,
  isTeacherAllowedForClass,
  createEntry,
  findMyWaitingEntry,
  positionOf,
  withdrawMyEntry,
  listEntriesForSchedule,
  listMyWaitingEntries,
};
