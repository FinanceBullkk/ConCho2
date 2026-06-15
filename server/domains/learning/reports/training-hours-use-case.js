const repository = require('./repository');

// ──────────────────────────────────────────────────────────
// A5 — Training-hours report (Modernization Horizon 1)
// ──────────────────────────────────────────────────────────
// Audit-ready training hours per employee (for labour-law minimums), rolled up
// by user or department over a date window. Pure reporting — no new model:
//   hours(user) = Σ over attended (P/L) sessions of (session duration),
//   duration from Schedule.startTime/endTime already stored.
// Gated by report.read; participants are listed even with 0 hours so gaps show.
// ──────────────────────────────────────────────────────────

// Parse from/to into a UTC window. Defaults to the last 90 days.
const parseWindow = ({ from, to } = {}) => {
  const end = to ? new Date(to) : new Date();
  if (isNaN(end.getTime())) throw new Error('Invalid "to" date');
  end.setUTCHours(23, 59, 59, 999);

  let start;
  if (from) {
    start = new Date(from);
    if (isNaN(start.getTime())) throw new Error('Invalid "from" date');
  } else {
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 90);
  }
  start.setUTCHours(0, 0, 0, 0);
  return { from: start, to: end };
};

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {{ from?, to?, groupBy?: 'user'|'department', departmentId? }} query
 * @returns {Promise<{ range, groupBy, rows, totals }>}
 */
const buildTrainingHoursReport = async ({ from, to, groupBy = 'user', departmentId } = {}) => {
  const range = parseWindow({ from, to });

  // Session durations in the window.
  const schedules = await repository.listSchedulesInRange(range);
  const durationBySchedule = new Map();
  for (const s of schedules) {
    const hours = Math.max(0, (new Date(s.endTime) - new Date(s.startTime)) / 3600000);
    durationBySchedule.set(String(s._id), hours);
  }

  // Attended rows → per-user hour tally.
  const attended = await repository.listAttendedByScheduleIds(schedules.map((s) => s._id));
  const tally = new Map(); // userId → { hours, sessions }
  for (const a of attended) {
    const hours = durationBySchedule.get(String(a.scheduleId)) || 0;
    const cur = tally.get(String(a.userId)) || { hours: 0, sessions: 0 };
    cur.hours += hours;
    cur.sessions += 1;
    tally.set(String(a.userId), cur);
  }

  // Participants (optionally department-scoped) — 0-hours employees included.
  const participants = await repository.listParticipantsForHours({ departmentId });
  const deptName = (u) => u.departmentId?.name || u.department || 'Unassigned';

  const perUser = participants.map((u) => {
    const t = tally.get(String(u._id)) || { hours: 0, sessions: 0 };
    return {
      userId: u._id,
      empCode: u.empCode,
      name: u.name,
      department: deptName(u),
      sessions: t.sessions,
      hours: round2(t.hours),
    };
  });

  const totals = {
    employees: perUser.length,
    sessions: perUser.reduce((s, r) => s + r.sessions, 0),
    hours: round2(perUser.reduce((s, r) => s + r.hours, 0)),
  };

  if (groupBy === 'department') {
    const byDept = new Map();
    for (const r of perUser) {
      const cur = byDept.get(r.department) || { department: r.department, employees: 0, withHours: 0, sessions: 0, hours: 0 };
      cur.employees += 1;
      cur.sessions += r.sessions;
      cur.hours += r.hours;
      if (r.hours > 0) cur.withHours += 1;
      byDept.set(r.department, cur);
    }
    const rows = [...byDept.values()]
      .map((d) => ({ ...d, hours: round2(d.hours), avgHours: d.employees ? round2(d.hours / d.employees) : 0 }))
      .sort((a, b) => b.hours - a.hours);
    return { range, groupBy, rows, totals };
  }

  const rows = perUser.sort((a, b) => b.hours - a.hours);
  return { range, groupBy, rows, totals };
};

module.exports = { buildTrainingHoursReport };
