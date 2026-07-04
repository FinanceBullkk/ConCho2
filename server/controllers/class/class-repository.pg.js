const { query } = require('../../config/pg');
const learning = require('../../domains/learning/repository').impls.pg;
const Class = require('../../models/Class');

// class-repository — POSTGRES impl (Phase 3 Wave-F). Same interface as
// ./class-repository.mongo.
//
// The cohort WRITE surface (create/update/Ongoing-conflict) DELEGATES to the
// parity-proven `domains/learning/repository` pg impl (port #12) instead of
// duplicating its full Class column mapping — one write path, no drift.
//
// Fidelity notes the parity test pins:
//   • the two hydrated readers return plain rows with a NON-ENUMERABLE
//     `toObject()` (the update handler diffs `existing.toObject()` vs
//     `updated.toObject()` — the helper must not show up in audit diffs);
//   • `findClasses` filter is equality-only (status/classCode — the
//     class-queries controller builds it) + classCode,courseName sort +
//     page/limit window, live rows only;
//   • enrollmentExists mirrors Mongo `.exists` (ANY status, dropped included
//     — Enrollment has no soft-delete hook): truthy {_id} | null;
//   • schedules have no soft-delete — status='scheduled' is the live guard.

const withToObject = (row) => {
  if (!row) return null;
  Object.defineProperty(row, 'toObject', {
    value() { return { ...this }; },
    enumerable: false,
  });
  return row;
};

/** The COURSE_SESSIONS setting value map ({ courseName: sessions }) or {}. */
const courseSessionsMap = async () => {
  const { rows } = await query(`SELECT value FROM settings WHERE key = 'COURSE_SESSIONS'`);
  return rows[0] ? rows[0].value : {};
};

// ── Mutations (delegated to the proven learning cohort write path) ──────────

const findOngoingByClassCode = async (classCode, excludeId = null) => {
  if (excludeId) return learning.findOngoingCohortConflict(classCode, excludeId);
  const { rows } = await query(
    `SELECT id FROM classes WHERE class_code = $1 AND status = 'Ongoing' AND is_deleted = false LIMIT 1`,
    [classCode]
  );
  return rows[0] ? { _id: rows[0].id } : null;
};

const createClassDoc = async (data) => withToObject(await learning.createCohort(data));

const findClassDocById = async (id) => withToObject(await fetchClassRow(id));

// Mirrors the Mongo path's runValidators: an invalid status enum rejects with
// a ValidationError instead of silently landing (same single-source-of-truth
// enumValues trick as the audit port).
const STATUS_ENUM = new Set(Class.schema.path('status').enumValues);
const updateClassById = async (id, body) => {
  if (body.status !== undefined && !STATUS_ENUM.has(body.status)) {
    throw Object.assign(
      new Error(`Validation failed: status: ${body.status} is not a valid class status`),
      { name: 'ValidationError' },
    );
  }
  return withToObject(await learning.updateCohortById(id, body));
};

// ── Reads ──────────────────────────────────────────────────

const CLASS_FILTER_COLS = { status: 'status', classCode: 'class_code' };

const classRow = (r) => (r == null ? null : {
  _id: r.id,
  classCode: r.class_code,
  courseName: r.course_name,
  programId: r.program_id || null,
  totalSessions: r.total_sessions == null ? null : Number(r.total_sessions),
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function fetchClassRow(id) {
  const { rows } = await query(
    `SELECT * FROM classes WHERE id = $1 AND is_deleted = false`,
    [String(id)]
  );
  return classRow(rows[0]);
}

const findClasses = async (filter, { page, limit }) => {
  const parts = ['is_deleted = false'];
  const params = [];
  for (const [key, col] of Object.entries(CLASS_FILTER_COLS)) {
    if (filter[key] !== undefined) {
      params.push(filter[key]);
      parts.push(`${col} = $${params.length}`);
    }
  }
  params.push(limit, (page - 1) * limit);
  const { rows } = await query(
    `SELECT * FROM classes WHERE ${parts.join(' AND ')}
      ORDER BY class_code ASC, course_name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows.map(classRow);
};

/** Per-class LIVE booked-session counts (cancelled rows freed their slot). */
const aggregateBookedSessionCounts = async (classIds) => {
  const { rows } = await query(
    `SELECT class_id AS "_id", count(*)::int AS "bookedSessions"
       FROM schedules WHERE class_id = ANY($1) AND status = 'scheduled'
      GROUP BY class_id`,
    [classIds.map(String)]
  );
  return rows;
};

const findClassLeanById = (id) => fetchClassRow(id);

const findTeamIdsForClass = async (classId) => {
  const { rows } = await query(
    `SELECT id FROM teams WHERE class_id = $1 AND is_deleted = false`,
    [String(classId)]
  );
  return rows.map((r) => r.id);
};

const enrollmentExists = async (userId, teamIds) => {
  const { rows } = await query(
    `SELECT id FROM enrollments WHERE user_id = $1 AND team_id = ANY($2) LIMIT 1`,
    [String(userId), teamIds.map(String)]
  );
  return rows[0] ? { _id: rows[0].id } : null;
};

const countBookedSessions = async (classId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM schedules WHERE class_id = $1 AND status = 'scheduled'`,
    [String(classId)]
  );
  return rows[0].n;
};

module.exports = {
  courseSessionsMap,
  findOngoingByClassCode,
  createClassDoc,
  findClassDocById,
  updateClassById,
  findClasses,
  aggregateBookedSessionCounts,
  findClassLeanById,
  findTeamIdsForClass,
  enrollmentExists,
  countBookedSessions,
};
