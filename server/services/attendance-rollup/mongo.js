// Per-team attendance rollup — MONGO impl (Phase 3 Wave-A port).
// Reuses the REAL production query (domains/attendance analyticsByTeam) so the
// parity test proves the PG SQL matches live behaviour, not a re-implementation.
// Admin actor ⇒ no Teacher scoping; large limit ⇒ all teams.
const { analyticsByTeam } = require('../../domains/attendance/analytics');
// Pin the MONGO repository impl explicitly — on the DB_BACKEND=postgres lane the
// attendance selector resolves to pg, and this wrapper must stay the Mongo side
// of the parity comparison.
const { impls } = require('../../domains/attendance/repository');

const getTeamAttendanceRollup = async () => {
  const { data } = await analyticsByTeam({ page: 1, limit: 1_000_000, skip: 0 }, { role: 'Admin' }, { repo: impls.mongo });
  return data.map((t) => ({
    teamId: String(t._id),
    name: t.name,
    memberCount: t.memberCount,
    total: t.stats.totalSessions,
    present: t.stats.present,
    absent: t.stats.absent,
    late: t.stats.late,
    excused: t.stats.excused,
    rate: t.stats.attendanceRate,
  }));
};

module.exports = { getTeamAttendanceRollup };
