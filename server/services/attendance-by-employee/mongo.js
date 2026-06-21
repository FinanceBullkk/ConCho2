// Per-employee attendance rollup — MONGO impl (Phase 3 Wave-A port).
// Reuses the REAL production query (domains/attendance analyticsByEmployee).
// Admin actor ⇒ no Teacher scoping; large limit ⇒ all employees.
const { analyticsByEmployee } = require('../../domains/attendance/analytics');

const getEmployeeAttendanceRollup = async () => {
  const { data } = await analyticsByEmployee(undefined, { page: 1, limit: 1_000_000, skip: 0 }, { role: 'Admin' });
  return data.map((e) => ({
    empCode: e.empCode,
    name: e.name,
    department: e.department,
    total: e.totalSessions,
    present: e.present,
    absent: e.absent,
    late: e.late,
    excused: e.excused,
    rate: e.attendanceRate,
  }));
};

module.exports = { getEmployeeAttendanceRollup };
