const { query } = require('../config/pg');

// ──────────────────────────────────────────────────────────
// Teacher visible-class scope (PG-only runtime — Wave K D2d-0)
// ──────────────────────────────────────────────────────────
// The set of classes a Teacher may see, per the graceful-migration binding rule
// (policy/classBinding): a class BOUND to the teacher (teacher_ids contains their
// id) OR an UNBOUND class (empty teacher_ids → legacy permissive). Soft-deleted
// classes are excluded (mirrors the Mongoose soft-delete find hook this replaced).
//
// This used to run `Class.find(...)` via Mongoose — which, after the Postgres
// cutover, read the now-empty Mongo and returned NO classes for every teacher
// (attendance analytics / assessment access / learning dashboard all scope on
// this). Now it reads Postgres directly.

const findTeacherVisibleClassIds = async (teacherId) => {
  const { rows } = await query(
    `SELECT id FROM classes
      WHERE is_deleted = false
        AND (cardinality(coalesce(teacher_ids, '{}')) = 0 OR $1 = ANY(teacher_ids))`,
    [String(teacherId)],
  );
  return rows.map((row) => row.id);
};

// Scope filter for repository reads that accept a Mongo-shaped `{_id:{$in}}`
// (the PG repos translate it): {} for Admin/Coordinator, class-id set for Teacher.
const classScopeForActor = async (actor) => {
  if (actor?.role !== 'Teacher') return {};
  const ids = await findTeacherVisibleClassIds(actor._id);
  return { _id: { $in: ids } };
};

module.exports = {
  findTeacherVisibleClassIds,
  classScopeForActor,
};
