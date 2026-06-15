/**
 * Backfill the MetricSnapshot history (Investment Build Plan #1).
 *
 * Seeds the derivable cumulative metrics (enrollments, completions,
 * certs_issued) from record timestamps — for BOTH global and per-program scope —
 * plus today's full snapshot (adds the point-in-time active_enrollments).
 * Idempotent — re-running overwrites each day's value.
 *
 * Run at deploy (and any time you widen the window) so trend lines have history
 * immediately instead of waiting for the nightly cron to accrue it.
 *
 * Usage:
 *   cd server && node scripts/backfill-metric-snapshots.js [days]
 *   (days = how far back to seed global cumulative history; default 180)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { backfillHistory, takeDailySnapshot } = require('../services/metricSnapshotService');

async function run() {
  await connectDB();

  const days = Math.max(1, Math.min(parseInt(process.argv[2], 10) || 180, 400));
  const history = await backfillHistory({ days });
  // Today's full snapshot (global + per-program + active_enrollments).
  const today = await takeDailySnapshot();

  console.log(JSON.stringify({ success: true, history, today }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
