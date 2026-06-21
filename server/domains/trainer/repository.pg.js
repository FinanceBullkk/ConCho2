const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// trainer/repository — POSTGRES impl. Same interface as ./repository.mongo.
// TrainerProfile CRUD over trainer_profiles (migration 007) + user pickers +
// Schedule load/availability reads.
//
// Fidelity to the Mongoose models the parity test pins:
//   • TrainerProfile has a soft-delete pre('find') hook + isDeleted select:false →
//     reads filter is_deleted=false explicitly; returned shapes omit isDeleted.
//   • upsertProfile = setDefaultsOnInsert upsert → INSERT … ON CONFLICT(user_id)
//     DO UPDATE (only the provided fields); omitted fields take model defaults.
//   • subdoc arrays availability/ratings = jsonb; canDeliver = text[].
//   • findTrainerCandidates uses status {$ne:'Dropped'} which MATCHES null in Mongo
//     → `status IS DISTINCT FROM 'Dropped'` (not `<> 'Dropped'`, which drops nulls).
//   • User has a soft-delete hook → the user reads filter is_deleted=false.
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const iso = (d) => (d == null ? null : new Date(d).toISOString());

const profileRow = (r) => (r == null ? null : {
  _id: r.id,
  userId: r.user_id,
  canDeliver: (r.can_deliver || []).map(String),
  availability: r.availability || [],
  ratings: r.ratings || [],
  note: r.note || '',
  status: r.status,
  createdBy: r.created_by || null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ── TrainerProfile CRUD ───────────────────────────────────
const TP_COL = { canDeliver: 'can_deliver', availability: 'availability', ratings: 'ratings', note: 'note', status: 'status', createdBy: 'created_by' };
const TP_DEFAULT = { canDeliver: [], availability: [], ratings: [], note: '', status: 'active', createdBy: null };
const tpVal = (k, v) => {
  if (k === 'canDeliver') return (v || []).map(String);
  if (k === 'availability' || k === 'ratings') return JSON.stringify(v || []);
  if (k === 'createdBy') return v == null ? null : String(v);
  if (k === 'note') return v == null ? '' : String(v);
  return v;
};

const upsertProfile = async (userId, data) => {
  const keys = Object.keys(TP_COL);
  const cols = ['id', 'user_id', ...keys.map((k) => TP_COL[k])];
  const vals = [newId(), String(userId), ...keys.map((k) => (hasOwn(data, k) ? tpVal(k, data[k]) : tpVal(k, TP_DEFAULT[k])))];
  const updates = keys.filter((k) => hasOwn(data, k)).map((k) => `${TP_COL[k]} = EXCLUDED.${TP_COL[k]}`);
  updates.push('updated_at = now()');
  const ph = cols.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(
    `INSERT INTO trainer_profiles(${cols.join(',')}) VALUES (${ph})
     ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')} RETURNING *`,
    vals,
  );
  return profileRow(rows[0]);
};

const findProfileByUserId = async (userId) => {
  const { rows } = await query(`SELECT * FROM trainer_profiles WHERE user_id = $1 AND is_deleted = false`, [String(userId)]);
  return rows[0] ? profileRow(rows[0]) : null;
};

const listProfiles = async (filter = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (filter.status) { args.push(filter.status); conds.push(`status = $${args.length}`); }
  if (filter.canDeliver) { args.push(String(filter.canDeliver)); conds.push(`$${args.length} = ANY(can_deliver)`); }
  const { rows } = await query(
    `SELECT * FROM trainer_profiles WHERE ${conds.join(' AND ')} ORDER BY status ASC, updated_at DESC LIMIT 500`, args);
  return rows.map(profileRow);
};

const softDeleteProfile = async (userId) => {
  const { rows } = await query(
    `UPDATE trainer_profiles SET is_deleted = true, deleted_at = now(), status = 'archived', updated_at = now()
      WHERE user_id = $1 AND is_deleted = false RETURNING *`, [String(userId)]);
  return rows[0] ? profileRow(rows[0]) : null;
};

const pushRating = async (userId, rating) => {
  const { rows } = await query(
    `UPDATE trainer_profiles SET ratings = ratings || $2::jsonb, updated_at = now()
      WHERE user_id = $1 AND is_deleted = false RETURNING *`,
    [String(userId), JSON.stringify([rating])]);
  return rows[0] ? profileRow(rows[0]) : null;
};

// ── User lookups ──────────────────────────────────────────
const findUsersByIds = async (ids) => {
  if (!ids || !ids.length) return [];
  const { rows } = await query(
    `SELECT id, emp_code, name, department, role, status FROM users WHERE id = ANY($1) AND is_deleted = false`,
    [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, empCode: r.emp_code, name: r.name, department: r.department, role: r.role, status: r.status }));
};

const findTrainerCandidates = async () => {
  const { rows } = await query(
    `SELECT id, emp_code, name, department, role FROM users
      WHERE role = ANY(ARRAY['Teacher','Admin']) AND status IS DISTINCT FROM 'Dropped' AND is_deleted = false
      ORDER BY name ASC`);
  return rows.map((r) => ({ _id: r.id, empCode: r.emp_code, name: r.name, department: r.department, role: r.role }));
};

// ── Schedule reads ────────────────────────────────────────
const sessionsForTrainer = async (userId, { from, to } = {}) => {
  const conds = ['$1 = ANY(session_instructor_ids)', "status = 'scheduled'"];
  const args = [String(userId)];
  if (from) { args.push(iso(from)); conds.push(`start_time >= $${args.length}`); }
  if (to) { args.push(iso(to)); conds.push(`start_time <= $${args.length}`); }
  const { rows } = await query(
    `SELECT id, class_id, topic, start_time, end_time, office_id, room_id FROM schedules
      WHERE ${conds.join(' AND ')} ORDER BY start_time ASC LIMIT 500`, args);
  return rows.map((r) => ({
    _id: r.id, classId: r.class_id, topic: r.topic, startTime: r.start_time, endTime: r.end_time,
    officeId: r.office_id, roomId: r.room_id,
  }));
};

const busyInstructorIds = async (instructorIds, start, end) => {
  if (!instructorIds || !instructorIds.length) return new Set();
  const ids = instructorIds.map(String);
  const { rows } = await query(
    `SELECT session_instructor_ids FROM schedules
      WHERE session_instructor_ids && $1 AND start_time < $2 AND end_time > $3 AND status = 'scheduled'`,
    [ids, iso(end), iso(start)],
  );
  const wanted = new Set(ids);
  const busy = new Set();
  for (const r of rows) {
    for (const id of (r.session_instructor_ids || [])) {
      const s = String(id);
      if (wanted.has(s)) busy.add(s);
    }
  }
  return busy;
};

module.exports = {
  upsertProfile,
  findProfileByUserId,
  listProfiles,
  softDeleteProfile,
  pushRating,
  findUsersByIds,
  findTrainerCandidates,
  sessionsForTrainer,
  busyInstructorIds,
};
