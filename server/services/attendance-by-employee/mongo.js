// Per-employee attendance rollup — MONGO impl (Phase 3 Wave-A port).
// Reuses the REAL production query (domains/attendance analyticsByEmployee).
// Admin actor ⇒ no Teacher scoping; large limit ⇒ all employees.
const { analyticsByEmployee } = require('../../domains/attendance/analytics');
// Pin the MONGO repository impl explicitly — on the DB_BACKEND=postgres lane the
// attendance selector resolves to pg, and this wrapper must stay the Mongo side
// of the parity comparison.
const { impls } = require('../../domains/attendance/repository');

const getEmployeeAttendanceRollup = async () => {
  const { data } = await analyticsByEmployee(undefined, { page: 1, limit: 1_000_000, skip: 0 }, { role: 'Admin' }, { repo: impls.mongo });
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
