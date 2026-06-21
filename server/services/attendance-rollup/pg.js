// Per-team attendance rollup — POSTGRES impl (Phase 3 Wave-A port).
// Same semantic interface as ./mongo. ONE indexed group-by replaces the Mongo
// fetch-teams + group-attendance-by-user + JS rollup (the PERF-003 hotspot).
// LEFT JOINs keep teams/members with zero attendance (rate 0), matching the
// Mongo JS rollup; soft-deleted teams are excluded by the explicit predicate
// (Team.aggregate's hook equivalent). Sort order mirrors analyticsByTeam.
const { query } = require('../../config/pg');

const getTeamAttendanceRollup = async () => {
  const { rows } = await query(`
    SELECT t.id, t.name,
           count(DISTINCT tm.user_id)                          AS member_count,
           count(a.id)                                         AS total,
           count(a.id) FILTER (WHERE a.status = 'P')           AS present,
           count(a.id) FILTER (WHERE a.status = 'A')           AS absent,
           count(a.id) FILTER (WHERE a.status = 'L')           AS late,
           count(a.id) FILTER (WHERE a.status = 'EL')          AS excused
    FROM teams t
    LEFT JOIN team_members tm ON tm.team_id = t.id
    LEFT JOIN attendances  a  ON a.user_id  = tm.user_id
    WHERE t.is_deleted = false
    GROUP BY t.id, t.name`);

  return rows
    .map((r) => {
      const total = Number(r.total);
      const present = Number(r.present);
      return {
        teamId: r.id,
        name: r.name,
        memberCount: Number(r.member_count),
        total,
        present,
        absent: Number(r.absent),
        late: Number(r.late),
        excused: Number(r.excused),
        rate: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));
};

module.exports = { getTeamAttendanceRollup };
