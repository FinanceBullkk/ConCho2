// Per-employee attendance rollup — POSTGRES impl (Phase 3 Wave-A port).
// Same semantic interface as ./mongo. Group attendances by user, joining users
// with an EXPLICIT soft-delete predicate (is_deleted = false) — the SQL
// equivalent of the Mongo $lookup-with-isDeleted that the analytics query uses
// (DATA-009): a soft-deleted user's attendance drops out, in both backends.
const { query } = require('../../config/pg');

const getEmployeeAttendanceRollup = async () => {
  // rate is rounded in SQL with round(double precision) — round-half-to-EVEN
  // (banker's), matching Mongo's $round used by analyticsByEmployee. (JS
  // Math.round is half-UP, which diverges on .x5 ties e.g. 6.25 → 6.2 vs 6.3.)
  const { rows } = await query(`
    SELECT u.emp_code, u.name, u.department,
           count(a.id)                                AS total,
           count(a.id) FILTER (WHERE a.status = 'P')  AS present,
           count(a.id) FILTER (WHERE a.status = 'A')  AS absent,
           count(a.id) FILTER (WHERE a.status = 'L')  AS late,
           count(a.id) FILTER (WHERE a.status = 'EL') AS excused,
           CASE WHEN count(a.id) > 0
                THEN round((count(a.id) FILTER (WHERE a.status = 'P')::double precision / count(a.id) * 1000)) / 10
                ELSE 0 END                            AS rate
    FROM attendances a
    JOIN users u ON u.id = a.user_id AND u.is_deleted = false
    GROUP BY u.id, u.emp_code, u.name, u.department`);

  return rows
    .map((r) => ({
      empCode: r.emp_code,
      name: r.name,
      department: r.department,
      total: Number(r.total),
      present: Number(r.present),
      absent: Number(r.absent),
      late: Number(r.late),
      excused: Number(r.excused),
      rate: Number(r.rate),
    }))
    .sort((a, b) => b.rate - a.rate || (a.empCode || '').localeCompare(b.empCode || ''));
};

module.exports = { getEmployeeAttendanceRollup };
