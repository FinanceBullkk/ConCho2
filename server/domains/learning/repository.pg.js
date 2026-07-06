const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// learning/repository — POSTGRES impl (programs + cohorts). Same interface as
// ./repository.mongo.
//
// Fidelity notes the parity test pins:
//   • LearningProgram has NO isDeleted (lifecycle = `status`); unique `code` +
//     unique `name` case-insensitive (Mongo collation strength:2 → lower(name)).
//   • policy sub-objects + customFields → jsonb (defaults merged on write);
//     prerequisitePrograms / teacherIds → text[].
//   • Class has a soft-delete hook → cohort reads filter is_deleted=false;
//     populate('programId') → the FULL program object embedded (a 2nd query).
//   • TRANSACTION methods (closeEnrollmentsByCohort/softDeleteCohort) take a
//     `session` they IGNORE here — the use-case currently mints a Mongoose
//     session; cross-method atomicity is deferred to the dual-backend
//     transaction abstraction (Wave-D). Each method's own effect matches Mongo.
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const cmp = (x, y) => ((x || '') < (y || '') ? -1 : (x || '') > (y || '') ? 1 : 0);

// Mongoose-Query-lite over an eager PG read. The programs/cohorts use-cases were
// written against the Mongo repo (which returns chainable Queries) and chain
// `.skip().limit().lean().sort()` on the read result. This PG impl resolves to
// plain arrays/objects, so those chained calls would throw (`.skip is not a
// function` → 500). Wrap a read in a thenable that supports the same chain and
// applies skip/limit in memory (program/cohort catalogs are small). Awaiting it —
// chained or not — resolves to the value; single-doc reads ignore skip/limit.
const chainable = (loader) => {
  let s = 0;
  let l = Infinity;
  const q = {
    skip(n) { s = n || 0; return q; },
    limit(n) { l = (n == null) ? Infinity : n; return q; },
    lean() { return q; },
    sort() { return q; },      // the repo query already ORDERs
    populate() { return q; },  // the repo already embeds the program
    then(onF, onR) {
      return Promise.resolve().then(loader)
        .then((v) => (Array.isArray(v) && (s || l !== Infinity)
          ? v.slice(s, l === Infinity ? undefined : s + l) : v))
        .then(onF, onR);
    },
    catch(onR) { return q.then(undefined, onR); },
  };
  return q;
};

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

// cohort row → shape. With a 2nd arg (even null) programId is the POPULATED program
// object; with one arg it is the raw id (createCohort/update return un-populated).
const cohortRow = (c, ...rest) => {
  if (c == null) return null;
  return {
    _id: c.id, classCode: c.class_code, courseName: c.course_name,
    programId: rest.length ? rest[0] : (c.program_id || null),
    totalSessions: c.total_sessions == null ? null : Number(c.total_sessions),
    status: c.status, customFields: c.custom_fields || {},
    teacherIds: (c.teacher_ids || []).map(String),
    createdAt: c.created_at, updatedAt: c.updated_at,
  };
};

// embed the FULL program per cohort (populate('programId')) via one extra query.
const embedPrograms = async (cohorts) => {
  const pids = [...new Set(cohorts.map((c) => c.program_id).filter(Boolean))];
  let progMap = new Map();
  if (pids.length) {
    const { rows } = await query(`SELECT * FROM learning_programs WHERE id = ANY($1)`, [pids]);
    progMap = new Map(rows.map((r) => [r.id, programRow(r)]));
  }
  return cohorts.map((c) => cohortRow(c, c.program_id ? (progMap.get(c.program_id) || null) : null));
};

// ── Programs ──────────────────────────────────────────────
const PROGRAM_COL = {
  code: 'code', name: 'name', description: 'description', category: 'category',
  defaultSessionCount: 'default_session_count', deliveryMode: 'delivery_mode', schedulingMode: 'scheduling_mode',
  completionPolicy: 'completion_policy', certificateValidityDays: 'certificate_validity_days',
  capacityPolicy: 'capacity_policy', facilitatorPolicy: 'facilitator_policy', recertifyPolicy: 'recertify_policy',
  customFields: 'custom_fields', prerequisitePrograms: 'prerequisite_programs', status: 'status', legacyCourseName: 'legacy_course_name',
};
const POLICY_DEFAULT = { completionPolicy: D_COMPLETION, capacityPolicy: D_CAPACITY, facilitatorPolicy: D_FACILITATOR, recertifyPolicy: D_RECERTIFY };
const progVal = (k, v) => {
  if (k === 'code') return v == null ? null : String(v).trim().toUpperCase();
  if (k === 'name' || k === 'description' || k === 'legacyCourseName') return v == null ? v : String(v).trim();
  if (POLICY_DEFAULT[k]) return JSON.stringify({ ...POLICY_DEFAULT[k], ...(v || {}) });
  if (k === 'customFields') return JSON.stringify(v || {});
  if (k === 'prerequisitePrograms') return (v || []).map(String);
  return v;
};
const PROGRAM_INSERT_DEFAULT = {
  description: '', category: 'other', defaultSessionCount: 1, deliveryMode: 'online', schedulingMode: 'admin_scheduled',
  completionPolicy: {}, capacityPolicy: {}, facilitatorPolicy: {}, recertifyPolicy: {}, customFields: {},
  prerequisitePrograms: [], status: 'active', legacyCourseName: '', code: null, certificateValidityDays: null,
};

const createProgram = async (payload) => {
  const keys = Object.keys(PROGRAM_COL);
  const cols = ['id', ...keys.map((k) => PROGRAM_COL[k])];
  const vals = [newId(), ...keys.map((k) => (hasOwn(payload, k) ? progVal(k, payload[k]) : progVal(k, PROGRAM_INSERT_DEFAULT[k])))];
  const ph = cols.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(`INSERT INTO learning_programs(${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals);
  return programRow(rows[0]);
};

const updateProgramById = async (id, payload) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(PROGRAM_COL)) {
    if (hasOwn(payload, k)) { args.push(progVal(k, payload[k])); sets.push(`${col} = $${args.length}`); }
  }
  if (!sets.length) return findProgramById(id);
  sets.push('updated_at = now()');
  args.push(id);
  const { rows } = await query(`UPDATE learning_programs SET ${sets.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
  return rows[0] ? programRow(rows[0]) : null;
};

const findPrograms = (filter = {}) => chainable(async () => {
  const conds = [];
  const args = [];
  if (filter.status) { args.push(filter.status); conds.push(`status = $${args.length}`); }
  if (filter.category) { args.push(filter.category); conds.push(`category = $${args.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(`SELECT * FROM learning_programs ${where}`, args);
  return rows.map(programRow).sort((a, b) => cmp(a.category, b.category) || cmp(a.name, b.name));
});

const findProgramById = (id) => chainable(async () => {
  const { rows } = await query(`SELECT * FROM learning_programs WHERE id = $1`, [id]);
  return rows[0] ? programRow(rows[0]) : null;
});

const findProgramByName = async (name) => {
  const { rows } = await query(`SELECT * FROM learning_programs WHERE lower(name) = lower($1) LIMIT 1`, [name]);
  return rows[0] ? programRow(rows[0]) : null;
};

const findProgramByLegacyCourseName = async (legacyCourseName) => {
  const { rows } = await query(`SELECT * FROM learning_programs WHERE lower(legacy_course_name) = lower($1) LIMIT 1`, [legacyCourseName]);
  return rows[0] ? programRow(rows[0]) : null;
};

// ── Cohorts ───────────────────────────────────────────────
const CLASS_COL = {
  classCode: 'class_code', courseName: 'course_name', programId: 'program_id', totalSessions: 'total_sessions',
  status: 'status', customFields: 'custom_fields', teacherIds: 'teacher_ids', isDeleted: 'is_deleted', deletedAt: 'deleted_at',
};
const classVal = (k, v) => {
  if (k === 'customFields') return JSON.stringify(v || {});
  if (k === 'teacherIds') return (v || []).map(String);
  if (k === 'programId') return v == null ? null : String(v);
  return v;
};

const createCohort = async (payload) => {
  const { rows } = await query(
    `INSERT INTO classes(id,class_code,course_name,program_id,total_sessions,status,custom_fields,teacher_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      newId(), payload.classCode, payload.courseName == null ? null : payload.courseName,
      payload.programId == null ? null : String(payload.programId),
      payload.totalSessions == null ? null : payload.totalSessions,
      payload.status == null ? 'Ongoing' : payload.status,
      JSON.stringify(payload.customFields || {}), (payload.teacherIds || []).map(String),
    ],
  );
  return cohortRow(rows[0]); // un-populated (raw program_id), matching Class.create
};

const updateCohortById = async (id, update) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(CLASS_COL)) {
    if (hasOwn(update, k)) { args.push(classVal(k, update[k])); sets.push(`${col} = $${args.length}`); }
  }
  sets.push('updated_at = now()');
  args.push(id);
  const { rows } = await query(`UPDATE classes SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? cohortRow(rows[0]) : null;
};

const findCohorts = (filter = {}) => chainable(async () => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (filter.status) { args.push(filter.status); conds.push(`status = $${args.length}`); }
  if (filter.programId) { args.push(String(filter.programId)); conds.push(`program_id = $${args.length}`); }
  const { rows } = await query(
    `SELECT * FROM classes WHERE ${conds.join(' AND ')} ORDER BY class_code ASC, course_name ASC`, args);
  return embedPrograms(rows);
});

const findCohortById = (id) => chainable(async () => {
  const { rows } = await query(`SELECT * FROM classes WHERE id = $1 AND is_deleted = false`, [id]);
  if (!rows[0]) return null;
  return (await embedPrograms(rows))[0];
});

const findOngoingCohortConflict = async (classCode, excludeId) => {
  const { rows } = await query(
    `SELECT * FROM classes WHERE class_code = $1 AND status = 'Ongoing' AND is_deleted = false AND id <> $2 LIMIT 1`,
    [classCode, String(excludeId)]);
  return rows[0] ? cohortRow(rows[0]) : null;
};

const countTeamsByCohort = async (cohortId) => {
  const { rows } = await query(`SELECT count(*)::int AS n FROM teams WHERE class_id = $1 AND is_deleted = false`, [String(cohortId)]);
  return rows[0].n;
};

const countSchedulesByCohort = async (cohortId) => {
  const { rows } = await query(`SELECT count(*)::int AS n FROM schedules WHERE class_id = $1`, [String(cohortId)]);
  return rows[0].n;
};

// session IGNORED in PG (see header) — each statement runs on the pool.
const closeEnrollmentsByCohort = async (cohortId, leftAt /* , session */) => {
  const { rowCount } = await query(
    `UPDATE enrollments SET status = 'Dropped', left_at = $2 WHERE class_id = $1 AND status = 'Active'`,
    [String(cohortId), leftAt == null ? null : new Date(leftAt).toISOString()]);
  return { acknowledged: true, matchedCount: rowCount, modifiedCount: rowCount };
};

const softDeleteCohort = async (cohortId, deletedAt /* , session */) => {
  const { rows } = await query(
    `UPDATE classes SET is_deleted = true, deleted_at = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [String(cohortId), deletedAt == null ? new Date().toISOString() : new Date(deletedAt).toISOString()]);
  return rows[0] ? cohortRow(rows[0]) : null;
};

const restoreCohortById = async (cohortId) => {
  const { rows } = await query(
    `UPDATE classes SET is_deleted = false, deleted_at = null, updated_at = now() WHERE id = $1 AND is_deleted = true RETURNING *`,
    [String(cohortId)]);
  return rows[0] ? cohortRow(rows[0]) : null;
};

const findDeletedCohorts = () => chainable(async () => {
  const { rows } = await query(`SELECT * FROM classes WHERE is_deleted = true ORDER BY deleted_at DESC`);
  return embedPrograms(rows);
});

const countSessionsByCohortIds = async (cohortIds) => {
  if (!cohortIds.length) return {};
  const { rows } = await query(
    `SELECT class_id, count(*)::int AS booked FROM schedules
      WHERE class_id = ANY($1) AND status = 'scheduled' GROUP BY class_id`,
    [cohortIds.map(String)]);
  const out = {};
  rows.forEach((r) => { out[String(r.class_id)] = r.booked; });
  return out;
};

const monthlyCompletions = async (programId, since) => {
  const { rows } = await query(
    `SELECT extract(year from issued_at)::int AS y, extract(month from issued_at)::int AS m, count(*)::int AS count
       FROM certificates WHERE program_id = $1 AND is_deleted = false AND issued_at >= $2
      GROUP BY y, m`,
    [String(programId), new Date(since).toISOString()]);
  return rows.map((r) => ({ _id: { y: r.y, m: r.m }, count: r.count }));
};

module.exports = {
  findPrograms,
  findProgramById,
  findProgramByName,
  findProgramByLegacyCourseName,
  createProgram,
  updateProgramById,
  findCohorts,
  findCohortById,
  createCohort,
  updateCohortById,
  findOngoingCohortConflict,
  countTeamsByCohort,
  countSchedulesByCohort,
  closeEnrollmentsByCohort,
  softDeleteCohort,
  restoreCohortById,
  findDeletedCohorts,
  countSessionsByCohortIds,
  monthlyCompletions,
};
