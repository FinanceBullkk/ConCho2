/**
 * Dev diagnostic (READ-ONLY) — Class → Teacher binding coverage
 * ────────────────────────────────────────────────────────────
 * Why: the per-class teacher isolation (policy/classBinding.js) uses an
 * "open until populated" rule — a Class with an EMPTY `teacherIds` is
 * PERMISSIVE (any Teacher may mark attendance / grade / read its reports).
 * The isolation only becomes effective once an admin assigns teachers.
 *
 * This prints, over the LIVE data, how many active classes are bound vs
 * unbound (open), and — the operationally meaningful figure — how many of
 * the unbound classes actually have `scheduled` sessions (so the open door
 * is reachable today, not just dormant history).
 *
 * It mutates nothing. Run from the server directory:
 *   node scripts/dev-tools/diagnose-class-teacher-binding.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

const Class = require('../../models/Class');
const Schedule = require('../../models/Schedule');

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

(async () => {
  await connectDB();

  const ACTIVE = { isDeleted: { $ne: true } };

  // Total active (non-deleted) classes.
  const total = await Class.countDocuments(ACTIVE);

  // Bound = has at least one element in teacherIds (`teacherIds.0` exists).
  const bound = await Class.countDocuments({ ...ACTIVE, 'teacherIds.0': { $exists: true } });
  const unbound = total - bound;

  // Of the UNBOUND classes, which ones have a live (`scheduled`) session —
  // i.e. the open door is actually reachable today, not dormant history.
  const unboundClasses = await Class.find({ ...ACTIVE, 'teacherIds.0': { $exists: false } })
    .select('_id classCode courseName')
    .lean();
  const unboundIds = unboundClasses.map((c) => c._id);

  const unboundIdsWithSessions = unboundIds.length
    ? await Schedule.distinct('classId', { status: 'scheduled', classId: { $in: unboundIds } })
    : [];
  const unboundReachable = unboundIdsWithSessions.length;

  console.log('\n════════════════════════════════════════════════════');
  console.log(' CLASS → TEACHER BINDING COVERAGE (read-only)');
  console.log('════════════════════════════════════════════════════');
  console.log(`Active classes (not deleted):        ${total}`);
  console.log(`  ├─ BOUND (teacherIds set):         ${bound}   (${pct(bound, total)})`);
  console.log(`  └─ UNBOUND (open to any Teacher):  ${unbound}   (${pct(unbound, total)})`);
  console.log(`       └─ of those, with live sessions (reachable open door): ${unboundReachable}`);

  if (unboundReachable > 0) {
    const reachableSet = new Set(unboundIdsWithSessions.map(String));
    const sample = unboundClasses
      .filter((c) => reachableSet.has(String(c._id)))
      .slice(0, 15);
    console.log('\n  Reachable unbound classes (up to 15 shown):');
    for (const c of sample) {
      console.log(`    - ${c.classCode} — ${c.courseName}  (_id=${c._id})`);
    }
    if (unboundReachable > sample.length) {
      console.log(`    … and ${unboundReachable - sample.length} more`);
    }
  }

  console.log('\nInterpretation:');
  console.log('  BOUND   → per-teacher isolation is ACTIVE (only listed teachers).');
  console.log('  UNBOUND → "open until populated": ANY Teacher can act on it.');
  console.log('  To tighten, assign teachers per class (or run scripts/migrate-teacherIds.js).');
  console.log('════════════════════════════════════════════════════\n');

  await mongoose.connection.close();
  process.exit(0);
})().catch(async (err) => {
  console.error('Diagnostic failed:', err);
  try { await mongoose.connection.close(); } catch { /* noop */ }
  process.exit(1);
});
