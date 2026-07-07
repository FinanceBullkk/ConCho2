const { query } = require('../../config/pg');

// attendance-export-repository — POSTGRES impl (Phase 3 Wave-F PR-2).
// Same SEMANTIC interface as ./attendance-export-repository.mongo. The Mongo
// multi-$lookup pipeline becomes one SQL join; the claim/mark/count methods are
// direct UPDATE/COUNT twins.
//
// Fidelity notes the parity test pins (Mongo ⇔ SQL):
//   • schedule + user joins are INNER (Mongo `$unwind` without preserveNull) —
//     an orphaned attendance (missing schedule) or a soft-deleted user DROPS
//     the row entirely (DATA-009).
//   • class + team joins are LEFT with is_deleted=false at the join (Mongo
//     preserveNullAndEmptyArrays: a missing/soft-deleted class keeps the row
//     without a class label; teamName falls back to 'N/A').
//   • Mongo's $project omits `classCode`/`courseName`/`exportedAt` keys when
//     the source is absent (it does NOT emit null) — mirrored so a deep-equal
//     against the Mongo row holds key-for-key.
//   • durationMinutes = (endTime − startTime) in ms / 60000 ⇔ EXTRACT(EPOCH)/60.
//   • sort: startTime ASC, empCode ASC (both NOT NULL on their tables; NULLS
//     FIRST kept explicit for Mongo BSON-order parity discipline).
//   • claim/mark return { modifiedCount } like the Mongoose updateMany result;
//     Mongoose bumps updatedAt on update ops (timestamps: true) → updated_at=now().

const exportRow = (r) => {
  const row = {
    _id: r.id,
    empCode: r.emp_code,
    userName: r.user_name,
    department: r.department,
    userRole: r.user_role,
    teamName: r.team_name == null ? 'N/A' : r.team_name,
    startTime: r.start_time,
    endTime: r.end_time,
    durationMinutes: r.duration_minutes == null ? null : Number(r.duration_minutes),
    roomLink: r.room_link == null ? '' : r.room_link,
    status: r.status,
    remark: r.remark,
    attendanceDate: r.created_at,
    syncStatus: r.sync_status,
  };
  if (r.c_id != null) {
    row.classCode = r.class_code;
    row.courseName = r.course_name;
  }
  if (r.exported_at != null) row.exportedAt = r.exported_at;
  return row;
};

// Shared WHERE builder for the export-row query (status/batch + lesson-date range).
const buildConds = ({ from, to, includeExported = false, batchId } = {}) => {
  const conds = [];
  const args = [];
  if (batchId) { args.push(String(batchId)); conds.push(`a.export_batch_id = $${args.length}`); }
  else if (!includeExported) { conds.push(`a.sync_status = 'PENDING'`); }
  if (from) { args.push(new Date(from).toISOString()); conds.push(`s.start_time >= $${args.length}`); }
  if (to) { args.push(new Date(to).toISOString()); conds.push(`s.start_time <= $${args.length}`); }
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', args };
};

// The full 4-join export rows (Excel + JSON preview).
const findExportRows = async (opts = {}) => {
  const { where, args } = buildConds(opts);
  const { rows } = await query(
    `SELECT a.id, a.status, a.remark, a.sync_status, a.exported_at, a.created_at,
            u.emp_code, u.name AS user_name, u.department, u.role AS user_role,
            c.id AS c_id, c.class_code, c.course_name,
            t.name AS team_name,
            s.start_time, s.end_time, s.room_link,
            EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60 AS duration_minutes
       FROM attendances a
       JOIN schedules s ON s.id = a.schedule_id
       JOIN users u     ON u.id = a.user_id           AND u.is_deleted = false
       LEFT JOIN classes c ON c.id = s.class_id       AND c.is_deleted = false
       LEFT JOIN teams t   ON t.id = s.booked_team_id AND t.is_deleted = false
      ${where}
      ORDER BY s.start_time ASC NULLS FIRST, u.emp_code ASC NULLS FIRST`,
    args,
  );
  return rows.map(exportRow);
};

// The pre-claim id scan: PENDING records whose SCHEDULE date falls in range.
// (Only the schedule join — mirrors the Mongo idPipeline exactly.)
const findPendingIdsInRange = async ({ from, to } = {}) => {
  const conds = [`a.sync_status = 'PENDING'`];
  const args = [];
  if (from) { args.push(new Date(from).toISOString()); conds.push(`s.start_time >= $${args.length}`); }
  if (to) { args.push(new Date(to).toISOString()); conds.push(`s.start_time <= $${args.length}`); }
  const { rows } = await query(
    `SELECT a.id FROM attendances a
       JOIN schedules s ON s.id = a.schedule_id
      WHERE ${conds.join(' AND ')}`,
    args,
  );
  return rows.map((r) => r.id);
};

// Truly-exportable PENDING count — same joins as the export rows (the INNER
// schedule+user joins drop orphans; the LEFT class/team joins never drop rows).
const countExportablePending = async () => {
  const { rows } = await query(
    `SELECT count(*)::int AS n
       FROM attendances a
       JOIN schedules s ON s.id = a.schedule_id
       JOIN users u     ON u.id = a.user_id AND u.is_deleted = false
      WHERE a.sync_status = 'PENDING'`,
  );
  return rows[0].n;
};

// P2-08 atomic claim: only rows still PENDING flip to EXPORTING + batch id, so
// concurrent exporters get disjoint sets (the loser matches 0 rows).
const claimBatch = async (ids, batchId) => {
  const { rowCount } = await query(
    `UPDATE attendances
        SET sync_status = 'EXPORTING', export_batch_id = $2, updated_at = now()
      WHERE id = ANY($1::text[]) AND sync_status = 'PENDING'`,
    [(ids || []).map(String), String(batchId)],
  );
  return { modifiedCount: rowCount };
};

const markExported = async (batchId) => {
  const { rowCount } = await query(
    `UPDATE attendances
        SET sync_status = 'EXPORTED', exported_at = now(), updated_at = now()
      WHERE export_batch_id = $1`,
    [String(batchId)],
  );
  return { modifiedCount: rowCount };
};

const countByStatus = async (status) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM attendances WHERE sync_status = $1`, [String(status)]);
  return rows[0].n;
};

// Most recent exported row (for the "last export" KPI).
const findLastExported = async () => {
  const { rows } = await query(
    `SELECT exported_at FROM attendances
      WHERE sync_status = 'EXPORTED' AND exported_at IS NOT NULL
      ORDER BY exported_at DESC LIMIT 1`,
  );
  return rows[0] ? { exportedAt: rows[0].exported_at } : null;
};

const countExportedInWindow = async (start, end) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM attendances
      WHERE sync_status = 'EXPORTED' AND exported_at >= $1 AND exported_at <= $2`,
    [new Date(start).toISOString(), new Date(end).toISOString()],
  );
  return rows[0].n;
};

module.exports = {
  findExportRows,
  findPendingIdsInRange,
  countExportablePending,
  claimBatch,
  markExported,
  countByStatus,
  findLastExported,
  countExportedInWindow,
};
