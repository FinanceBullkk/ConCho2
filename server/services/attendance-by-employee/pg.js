// Per-employee attendance rollup — POSTGRES impl (Phase 3 Wave-A port).
// Same semantic interface as ./mongo. Group attendances by user, joining users
// with an EXPLICIT soft-delete predicate (is_deleted = false) — the SQL
// equivalent of the Mongo $lookup-with-isDeleted that the analytics query uses
// (DATA-009): a soft-deleted user's attendance drops out, in both backends.
const { query } = require('../../config/pg');

const getEmployeeAttendanceRollup = async () => {
  const { rows } = await query(`
    SELECT u.emp_code, u.name, u.department,
           count(a.id)                                AS total,
           count(a.id) FILTER (WHERE a.status = 'P')  AS present,
           count(a.id) FILTER (WHERE a.status = 'A')  AS absent,
           count(a.id) FILTER (WHERE a.status = 'L')  AS late,
           count(a.id) FILTER (WHERE a.status = 'EL') AS excused
    FROM attendances a
    JOIN users u ON u.id = a.user_id AND u.is_deleted = false
    GROUP BY u.id, u.emp_code, u.name, u.department`);

  return rows
    .map((r) => {
      const total = Number(r.total);
      const present = Number(r.present);
      return {
        empCode: r.emp_code,
        name: r.name,
        department: r.department,
        total,
        present,
        absent: Number(r.absent),
        late: Number(r.late),
        excused: Number(r.excused),
        rate: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.rate - a.rate || (a.empCode || '').localeCompare(b.empCode || ''));
};

module.exports = { getEmployeeAttendanceRollup };
