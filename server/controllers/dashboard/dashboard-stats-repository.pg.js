const { query } = require('../../config/pg');

// dashboard-stats-repository — POSTGRES impl (Phase 3 Wave-F, mig 031).
// Same interface as ./dashboard-stats-repository.mongo — the 14-query admin
// analytics bundle rewritten to SQL with the EXACT Mongo aggregation output
// shapes (the controller's PHASE-2 composition is untouched).
//
// Fidelity notes the parity test pins:
//   • `userFilter` is the controller's plain equality filter — translated to
//     WHERE columns (entranceLevel/currentLevel/dropReason are real columns
//     since mig 031); every users/teams/classes read carries the soft-delete
//     predicate mirroring the Mongoose find/aggregate/distinct hooks
//     (attendances/schedules have no soft-delete — same as the models).
//   • Group shapes match Mongo: `_id` keys, ::int counts, nested `statuses`
//     json arrays; the two single-group pipelines (1: attendance totals,
//     13: level progression) return [] when NO rows matched — a Mongo $group
//     over empty input emits no docs, while a bare SQL aggregate emits one.
//   • Session "done" mirrors the aggregation's $lt semantics: a NULL/missing
//     end_time sorts BELOW a date in Mongo → counts as done → `end_time IS
//     NULL OR end_time < now`.
//   • Drop-reason split: ' — ' separator → split_part(..., 2) ⇄ $arrayElemAt 1
//     (classification: part 1 ⇄ element 0); no separator → whole string.

const FILTER_COLS = {
  role: 'role',
  department: 'department',
  position: 'position',
  entranceLevel: 'entrance_level',
  currentLevel: 'current_level',
  status: 'status',
};

// Controller filter → WHERE fragment + params (equality-only by design).
// `omit` mirrors a subtle Mongo behavior the parity test caught: pipelines
// spread the filter THEN add their own predicate on the same key
// (`{ ...userFilter, department: { $ne: '' } }`) — the spread's key is
// CLOBBERED, so e.g. the department breakdown ignores an active department
// filter. The SQL twin must drop those keys, not AND them.
const userWhere = (userFilter, omit = [], startIndex = 1) => {
  const parts = ['is_deleted = false'];
  const params = [];
  let i = startIndex;
  for (const [key, col] of Object.entries(FILTER_COLS)) {
    if (userFilter[key] !== undefined && !omit.includes(key)) {
      parts.push(`${col} = $${i}`);
      params.push(userFilter[key]);
      i += 1;
    }
  }
  return { where: parts.join(' AND '), params, next: i };
};

const getFilterDistincts = async () => {
  const distinct = async (col, excludeEmpty) => {
    const { rows } = await query(
      `SELECT DISTINCT ${col} AS v FROM users
        WHERE role = 'Participant' AND is_deleted = false
          ${excludeEmpty ? `AND ${col} <> ''` : ''}`
    );
    return rows.map((r) => r.v);
  };
  const [departments, positions, entranceLevels, currentLevels, statuses] = await Promise.all([
    distinct('department', true),
    distinct('position', true),
    distinct('entrance_level', true),
    distinct('current_level', true),
    distinct('status', false),
  ]);
  return { departments, positions, entranceLevels, currentLevels, statuses };
};

const findFilteredUserIds = async (userFilter) => {
  const { where, params } = userWhere(userFilter);
  const { rows } = await query(`SELECT id FROM users WHERE ${where}`, params);
  return rows.map((r) => r.id);
};

// Mongo $group over zero input emits no docs — mirror for the two
// single-group pipelines so the settled shapes match exactly.
const emptyWhenNoRows = (row, totalKey) =>
  Number(row[totalKey]) === 0 ? [] : [row];

const runStatsAggregations = ({ userFilter, filteredUserIds, now, thirtyDaysAgo }) => {
  const uf = () => userWhere(userFilter); // fresh param numbering per query

  // 0: User status counts (filtered)
  const q0 = async () => {
    const { where, params } = uf();
    const { rows } = await query(
      `SELECT status AS "_id", count(*)::int AS count FROM users WHERE ${where} GROUP BY status`,
      params
    );
    return rows;
  };

  // 1: Attendance stats (filtered by user set)
  const q1 = async () => {
    const { rows } = await query(
      `SELECT NULL AS "_id", count(*)::int AS total,
              coalesce(sum(CASE WHEN status IN ('P','L') THEN 1 ELSE 0 END), 0)::int AS present
         FROM attendances
        ${filteredUserIds ? 'WHERE user_id = ANY($1)' : ''}`,
      filteredUserIds ? [filteredUserIds.map(String)] : []
    );
    return emptyWhenNoRows(rows[0], 'total');
  };

  // 2: Recently active user IDs (for at-risk calc)
  const q2 = async () => {
    const params = [thirtyDaysAgo];
    if (filteredUserIds) params.push(filteredUserIds.map(String));
    const { rows } = await query(
      `SELECT DISTINCT user_id FROM attendances
        WHERE created_at >= $1 ${filteredUserIds ? 'AND user_id = ANY($2)' : ''}`,
      params
    );
    return rows.map((r) => r.user_id);
  };

  // 3: Teams with class info (live teams; deleted/missing class → null)
  const q3 = async () => {
    const { rows } = await query(
      `SELECT t.id, c.id AS class_id, c.course_name, c.status AS class_status,
              coalesce(array_agg(tm.user_id) FILTER (WHERE tm.user_id IS NOT NULL), '{}') AS members
         FROM teams t
         LEFT JOIN classes c ON c.id = t.class_id AND c.is_deleted = false
         LEFT JOIN team_members tm ON tm.team_id = t.id
        WHERE t.is_deleted = false
        GROUP BY t.id, c.id, c.course_name, c.status`
    );
    return rows.map((r) => ({
      _id: r.id,
      members: r.members,
      classId: r.class_id
        ? { _id: r.class_id, courseName: r.course_name, status: r.class_status }
        : null,
    }));
  };

  // 4: All filtered participants
  const q4 = async () => {
    const { where, params } = uf();
    const { rows } = await query(`SELECT id, status FROM users WHERE ${where}`, params);
    return rows.map((r) => ({ _id: r.id, status: r.status }));
  };

  // 5/6: drop reason/classification — shared shape, different split part.
  // `status` omitted: the pipeline's own $in clobbers any status filter.
  const dropAgg = async (partIndex, limit) => {
    const { where, params, next } = userWhere(userFilter, ['status']);
    const { rows } = await query(
      `SELECT CASE WHEN position(' — ' IN drop_reason) > 0
                   THEN split_part(drop_reason, ' — ', ${partIndex})
                   ELSE drop_reason END AS "_id",
              count(*)::int AS count
         FROM users
        WHERE ${where} AND status = ANY($${next}) AND drop_reason <> ''
        GROUP BY 1
        ORDER BY count DESC
        ${limit ? `LIMIT ${limit}` : ''}`,
      [...params, ['Inactive', 'Dropped']]
    );
    return rows;
  };
  const q5 = () => dropAgg(2, 10); // reason  = after the separator  ⇄ $arrayElemAt 1
  const q6 = () => dropAgg(1, 0);  // classification = before it     ⇄ $arrayElemAt 0

  // 7: All classes (live), classCode order
  const q7 = async () => {
    const { rows } = await query(
      `SELECT id, class_code, course_name, total_sessions, status, program_id
         FROM classes WHERE is_deleted = false ORDER BY class_code ASC`
    );
    return rows.map((r) => ({
      _id: r.id,
      classCode: r.class_code,
      courseName: r.course_name,
      totalSessions: r.total_sessions == null ? null : Number(r.total_sessions),
      status: r.status,
      programId: r.program_id,
    }));
  };

  // 8: Schedule counts by class — live sessions only
  const q8 = async () => {
    const { rows } = await query(
      `SELECT class_id AS "_id", count(*)::int AS total,
              sum(CASE WHEN end_time IS NULL OR end_time < $1 THEN 1 ELSE 0 END)::int AS done
         FROM schedules WHERE status = 'scheduled' GROUP BY class_id`,
      [now]
    );
    return rows;
  };

  // 9/10: two-level breakdown — shared shape over a dimension column.
  // The dimension's own filter key is clobbered by the pipeline's $ne:'' .
  const dimensionBreakdown = async (col, omitKey) => {
    const { where, params } = userWhere(userFilter, [omitKey]);
    const { rows } = await query(
      `SELECT ${col} AS "_id",
              json_agg(json_build_object('status', status, 'count', c)) AS statuses,
              sum(c)::int AS total
         FROM (SELECT ${col}, status, count(*)::int AS c
                 FROM users WHERE ${where} AND ${col} <> ''
                GROUP BY ${col}, status) sub
        GROUP BY ${col}
        ORDER BY total DESC`,
      params
    );
    return rows;
  };
  const q9 = () => dimensionBreakdown('department', 'department');
  const q10 = () => dimensionBreakdown('position', 'position');

  // 11/12: level counts — shared shape (own key clobbered, same as 9/10).
  const levelCounts = async (col, omitKey) => {
    const { where, params } = userWhere(userFilter, [omitKey]);
    const { rows } = await query(
      `SELECT ${col} AS "_id", count(*)::int AS count
         FROM users WHERE ${where} AND ${col} <> ''
        GROUP BY ${col} ORDER BY count DESC`,
      params
    );
    return rows;
  };
  const q11 = () => levelCounts('entrance_level', 'entranceLevel');
  const q12 = () => levelCounts('current_level', 'currentLevel');

  // 13: Level progression (both level keys clobbered by the $ne:'' pair)
  const q13 = async () => {
    const { where, params } = userWhere(userFilter, ['entranceLevel', 'currentLevel']);
    const { rows } = await query(
      `SELECT NULL AS "_id", count(*)::int AS total,
              coalesce(sum(CASE WHEN entrance_level <> current_level THEN 1 ELSE 0 END), 0)::int AS progressed,
              coalesce(sum(CASE WHEN entrance_level = current_level THEN 1 ELSE 0 END), 0)::int AS stayed
         FROM users
        WHERE ${where} AND entrance_level <> '' AND current_level <> ''`,
      params
    );
    return emptyWhenNoRows(rows[0], 'total');
  };

  return Promise.allSettled([
    q0(), q1(), q2(), q3(), q4(), q5(), q6(), q7(), q8(), q9(), q10(), q11(), q12(), q13(),
  ]);
};

module.exports = { getFilterDistincts, findFilteredUserIds, runStatsAggregations };
