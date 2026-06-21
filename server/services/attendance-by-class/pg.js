// Per-class attendance roster — POSTGRES impl (Phase 3 Wave-A port).
// Same semantic interface as ./mongo. Two indexed reads mirror the Mongo
// findScheduledForClass + findAttendanceForSchedules(populate userId):
//   1. the class's live (status='scheduled') sessions, ordered;
//   2. attendance for those sessions, joined to users with an EXPLICIT
//      soft-delete predicate (is_deleted = false) — the SQL equivalent of the
//      User soft-delete pre('find') hook that fires inside Mongoose populate
//      (DATA-009): a soft-deleted user's attendance drops out of BOTH backends.
// The class JOIN keeps other classes' / cancelled sessions' attendance out.
const { query } = require('../../config/pg');

const iso = (d) => (d ? new Date(d).toISOString() : null);
const rateOf = (present, total) => (total > 0 ? parseFloat(((present / total) * 100).toFixed(1)) : 0);

const getClassAttendance = async (classId) => {
  const { rows: sched } = await query(
    `SELECT id, start_time, end_time
       FROM schedules
      WHERE class_id = $1 AND status = 'scheduled'
      ORDER BY start_time ASC, id ASC`,
    [classId],
  );

  const { rows: att } = await query(
    `SELECT a.schedule_id, a.status, u.emp_code, u.name
       FROM attendances a
       JOIN schedules s ON s.id = a.schedule_id AND s.class_id = $1 AND s.status = 'scheduled'
       JOIN users     u ON u.id = a.user_id     AND u.is_deleted = false`,
    [classId],
  );

  // Roll up per employee in JS — mirrors the Mongo userMap build (one entry per
  // active user; sessions is a scheduleId→status map). Active emp_codes are
  // unique (partial unique index), so keying by emp_code is safe.
  const byEmp = new Map();
  for (const r of att) {
    let e = byEmp.get(r.emp_code);
    if (!e) { e = { empCode: r.emp_code, name: r.name, sessions: {} }; byEmp.set(r.emp_code, e); }
    e.sessions[r.schedule_id] = r.status;
  }

  const roster = [...byEmp.values()]
    .map((e) => {
      const total = Object.keys(e.sessions).length;
      const present = Object.values(e.sessions).filter((st) => st === 'P').length;
      return { empCode: e.empCode, name: e.name, total, present, rate: rateOf(present, total), sessions: e.sessions };
    })
    .sort((a, b) => (a.empCode || '').localeCompare(b.empCode || ''));

  return {
    schedules: sched.map((s) => ({ id: s.id, startTime: iso(s.start_time), endTime: iso(s.end_time) })),
    roster,
  };
};

module.exports = { getClassAttendance };
