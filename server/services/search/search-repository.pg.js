const { query } = require('../../config/pg');

/**
 * search-repository.pg.js — POSTGRES impl (Phase 3 Wave-F).
 * Same interface as ./search-repository.mongo.
 *
 * Fidelity notes the parity test pins:
 *   • Mongo's prefer-prefix/substring regex PAIR (^q, q) is a perf optimisation,
 *     not a result-set difference — a substring match is always a superset of a
 *     prefix match, so ONE ILIKE pattern reproduces the identical result set:
 *     `q%` for 1-3 chars, `%q%` for ≥4 chars (mirrors the Mongo length cutoff).
 *   • escapeRegex (Mongo side) neutralises regex metachars (e.g. `(`, `+`) so
 *     they match LITERALLY; those characters are already literal in LIKE/ILIKE
 *     (only `%`, `_`, `\` are special there) — escapeLikeWildcards handles that
 *     smaller set so a literal `%`/`_` in the query can't act as a wildcard.
 *   • populate('classId', ...) / populate('leaderId', ...) ⇔ LEFT JOINs guarded
 *     by is_deleted = false — a soft-deleted/missing ref resolves to null on
 *     both backends (Mongoose's soft-delete find-hook fires during population).
 *     The "found" branch keys off the joined row's OWN id, not a label column,
 *     so a legitimately-null label is never confused with "no match".
 *   • None of the 5 finders sort in the Mongo original — relying on natural
 *     (insertion) order. ORDER BY id reproduces that deterministically on both
 *     backends when seed ids are inserted in the same order as their intended
 *     natural order (the parity test's seeding convention).
 *   • Team.members (array-of-refs) ⇔ the team_members join table; returned as
 *     a plain array of user-id strings via ARRAY(SELECT ...), same shape as the
 *     unpopulated Mongo `members` field.
 */

const escapeLikeWildcards = (str) => str.replace(/[%_\\]/g, '\\$&');
const buildIlikePattern = (q) => {
  const esc = escapeLikeWildcards(q);
  return q.length >= 4 ? `%${esc}%` : `${esc}%`;
};
// `cols ILIKE $n` OR'd across every candidate column, reusing one bound param.
const orIlike = (paramIdx, cols) => `(${cols.map((c) => `${c} ILIKE $${paramIdx}`).join(' OR ')})`;

// Users — role decides the scope: Admin = all; Teacher = Participants only
// (tightens info leak); Participant = own record only.
const findUsers = async ({ q, role, userId, limit }) => {
  const pattern = buildIlikePattern(q);
  const args = [pattern];
  const conds = ['is_deleted = false', orIlike(1, ['emp_code', 'name', 'department', 'email'])];
  if (role === 'Teacher') {
    conds.push(`role = 'Participant'`);
  } else if (role !== 'Admin') {
    args.push(String(userId));
    conds.push(`id = $${args.length}`);
  }
  args.push(limit);
  const { rows } = await query(
    `SELECT id, emp_code, name, department, email, role, status FROM users
      WHERE ${conds.join(' AND ')}
      ORDER BY id LIMIT $${args.length}`,
    args,
  );
  return rows.map((r) => ({
    _id: r.id, empCode: r.emp_code, name: r.name, department: r.department,
    email: r.email, role: r.role, status: r.status,
  }));
};

// Teams — Participants only see teams they belong to.
const findTeams = async ({ q, role, userId, limit }) => {
  const pattern = buildIlikePattern(q);
  const args = [pattern];
  const conds = ['t.is_deleted = false', orIlike(1, ['t.name'])];
  if (role === 'Participant') {
    args.push(String(userId));
    conds.push(`EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $${args.length})`);
  }
  args.push(limit);
  const { rows } = await query(
    `SELECT t.id, t.name, t.class_id, t.leader_id,
            c.id AS c_id, c.class_code AS c_class_code, c.course_name AS c_course_name,
            u.id AS u_id, u.emp_code AS u_emp_code, u.name AS u_name,
            ARRAY(SELECT user_id FROM team_members WHERE team_id = t.id) AS member_ids
       FROM teams t
       LEFT JOIN classes c ON c.id = t.class_id AND c.is_deleted = false
       LEFT JOIN users u ON u.id = t.leader_id AND u.is_deleted = false
      WHERE ${conds.join(' AND ')}
      ORDER BY t.id LIMIT $${args.length}`,
    args,
  );
  return rows.map((r) => ({
    _id: r.id,
    name: r.name,
    classId: r.c_id == null ? null : { _id: r.c_id, classCode: r.c_class_code, courseName: r.c_course_name },
    leaderId: r.u_id == null ? null : { _id: r.u_id, empCode: r.u_emp_code, name: r.u_name },
    members: r.member_ids || [],
  }));
};

const findClasses = async ({ q, limit }) => {
  const pattern = buildIlikePattern(q);
  const { rows } = await query(
    `SELECT id, class_code, course_name, status, total_sessions FROM classes
      WHERE is_deleted = false AND ${orIlike(1, ['class_code', 'course_name'])}
      ORDER BY id LIMIT $2`,
    [pattern, limit],
  );
  return rows.map((r) => ({
    _id: r.id, classCode: r.class_code, courseName: r.course_name, status: r.status,
    totalSessions: r.total_sessions == null ? null : Number(r.total_sessions),
  }));
};

const findPrograms = async ({ q, limit }) => {
  const pattern = buildIlikePattern(q);
  const { rows } = await query(
    `SELECT id, code, name, status FROM learning_programs
      WHERE is_deleted = false AND ${orIlike(1, ['name', 'code'])}
      ORDER BY id LIMIT $2`,
    [pattern, limit],
  );
  return rows.map((r) => ({ _id: r.id, code: r.code, name: r.name, status: r.status }));
};

const findDepartments = async ({ q, limit }) => {
  const pattern = buildIlikePattern(q);
  const { rows } = await query(
    `SELECT id, name, code FROM departments
      WHERE is_deleted = false AND ${orIlike(1, ['name', 'code'])}
      ORDER BY id LIMIT $2`,
    [pattern, limit],
  );
  return rows.map((r) => ({ _id: r.id, name: r.name, code: r.code }));
};

// Class ids of the teams a participant belongs to — used to narrow class results.
const findMemberClassIds = async (userId) => {
  const { rows } = await query(
    `SELECT DISTINCT t.class_id FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = $1 AND t.is_deleted = false`,
    [String(userId)],
  );
  return rows.map((r) => r.class_id).filter(Boolean);
};

module.exports = { findUsers, findTeams, findClasses, findPrograms, findDepartments, findMemberClassIds };
