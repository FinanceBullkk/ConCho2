// Per-class attendance roster — MONGO impl (Phase 3 Wave-A port).
// Reuses the REAL production query (domains/attendance analyticsByClass) so the
// parity test proves the PG SQL matches live behaviour, not a re-implementation.
// Normalises the populated/Date-shaped result to a backend-agnostic shape:
//   { schedules:[{id,startTime,endTime}], roster:[{empCode,name,total,present,rate,sessions}] }
// (ISO timestamps + a scheduleId→status map), so the PG impl can return the
// identical structure and the parity test is a plain deep-equal.
const { analyticsByClass } = require('../../domains/attendance/analytics');
// Pin the MONGO repository impl explicitly — on the DB_BACKEND=postgres lane the
// attendance selector resolves to pg, and this wrapper must stay the Mongo side
// of the parity comparison.
const { impls } = require('../../domains/attendance/repository');

const iso = (d) => (d ? new Date(d).toISOString() : null);

// Same JS rounding analyticsByClass uses (toFixed → half-up-ish), computed on
// BOTH backends from the sessions-derived present/total → identical results.
// (NOT Mongo $round, so no banker's-rounding divergence like the by-employee port.)
const rateOf = (present, total) => (total > 0 ? parseFloat(((present / total) * 100).toFixed(1)) : 0);

const getClassAttendance = async (classId) => {
  const { schedules, roster } = await analyticsByClass(classId, { repo: impls.mongo });

  return {
    schedules: schedules
      .map((s) => ({ id: String(s._id), startTime: iso(s.startTime), endTime: iso(s.endTime) }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
    roster: roster
      .map((r) => {
        const sessions = Object.fromEntries(Object.entries(r.sessions).map(([k, v]) => [String(k), v]));
        const total = Object.keys(sessions).length;
        const present = Object.values(sessions).filter((st) => st === 'P').length;
        return { empCode: r.user.empCode, name: r.user.name, total, present, rate: rateOf(present, total), sessions };
      })
      .sort((a, b) => (a.empCode || '').localeCompare(b.empCode || '')),
  };
};

module.exports = { getClassAttendance };
