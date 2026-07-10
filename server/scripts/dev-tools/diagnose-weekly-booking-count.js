/**
 * Dev diagnostic (READ-ONLY) — Weekly booking count
 * ─────────────────────────────────────────────────
 * Why: a leader sees only 1 session on the /book grid for the current week
 * but a 2nd booking is rejected with 400. This prints, per team, EXACTLY what
 * the weekly-cap check counts (status:'scheduled' sessions whose startTime is
 * inside the current ISO week) and lists every session so we can spot a
 * counted-but-not-rendered ("hidden") session.
 *
 * It mutates nothing. Run from the server directory:
 *   node scripts/dev-tools/diagnose-weekly-booking-count.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

const Team = require('../../models/Team');
const Schedule = require('../../models/Schedule');

// Reuse the SAME week-bounds + cap the booking path uses, so this mirrors
// production behaviour exactly (no re-implementation drift).
const { getWeekBounds, WEEKLY_TEAM_LIMIT } = require('../../domains/schedule/session-booking-policy');
const { toVN } = require('../../helpers/dayjsConfig');

const fmt = (d) => {
  if (!d) return '—';
  const iso = new Date(d).toISOString();
  let vn = '';
  try { vn = toVN(new Date(d)).format('ddd YYYY-MM-DD HH:mm'); } catch { vn = '(vn?)'; }
  return `${iso}  | VN ${vn}`;
};

(async () => {
  await connectDB();

  // The cap counts the week of the slot being booked. The user is booking the
  // CURRENT week, so anchor on now.
  const { weekStart, weekEnd } = getWeekBounds(new Date());

  console.log('\n════════════════════════════════════════════════════');
  console.log(' WEEKLY BOOKING COUNT DIAGNOSTIC (read-only)');
  console.log('════════════════════════════════════════════════════');
  console.log(`Weekly cap (WEEKLY_TEAM_LIMIT): ${WEEKLY_TEAM_LIMIT}`);
  console.log(`Current ISO week window (UTC):`);
  console.log(`  start: ${fmt(weekStart)}`);
  console.log(`  end:   ${fmt(weekEnd)}`);

  const teams = await Team.find({}).select('_id name leaderId classId').lean();
  console.log(`\nTeams found: ${teams.length}`);

  for (const team of teams) {
    // EVERY schedule for this team (any status, any week) — so a hidden /
    // mis-rendered session is visible here.
    const all = await Schedule.find({ bookedTeamId: team._id })
      .select('_id startTime endTime status classId')
      .sort({ startTime: 1 })
      .lean();

    // What the cap actually counts: status:'scheduled' AND inside this week.
    const countedQuery = {
      bookedTeamId: team._id,
      startTime: { $gte: weekStart, $lte: weekEnd },
      status: 'scheduled',
    };
    const counted = await Schedule.countDocuments(countedQuery);

    console.log('\n────────────────────────────────────────────────────');
    console.log(`TEAM: ${team.name}`);
    console.log(`  _id=${team._id}  leaderId=${team.leaderId}  classId=${team.classId}`);
    console.log(`  >> Counted toward THIS week's cap: ${counted} / ${WEEKLY_TEAM_LIMIT}` +
      (counted >= WEEKLY_TEAM_LIMIT ? '   <-- AT/OVER LIMIT (new booking blocked)' : ''));
    console.log(`  All sessions for this team (${all.length}):`);
    if (all.length === 0) {
      console.log('    (none)');
    }
    for (const s of all) {
      const inWeek = new Date(s.startTime) >= weekStart && new Date(s.startTime) <= weekEnd;
      const isCounted = inWeek && s.status === 'scheduled';
      console.log(
        `    - ${fmt(s.startTime)}  status=${s.status}` +
        `  classId=${s.classId}` +
        `  inThisWeek=${inWeek}  COUNTED=${isCounted}  _id=${s._id}`
      );
    }
  }

  console.log('\n════════════════════════════════════════════════════\n');
  await mongoose.connection.close();
  process.exit(0);
})().catch(async (err) => {
  console.error('Diagnostic failed:', err);
  try { await mongoose.connection.close(); } catch { /* noop */ }
  process.exit(1);
});
