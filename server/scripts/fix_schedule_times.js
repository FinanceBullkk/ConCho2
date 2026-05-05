/**
 * Fix schedule startTime/endTime floating-point drift from Excel serial import.
 *
 * Problem: excelSerialToDate() uses float arithmetic (serial * 86400 * 1000)
 *          which introduces sub-minute rounding errors. E.g. 14:00 → 13:59:59.xxx
 *
 * Fix: Round every startTime/endTime to the nearest minute. Since all valid
 *      slots are on the hour (09:00, 10:00, etc.), this restores correctness.
 *
 * Usage:
 *   node server/scripts/fix_schedule_times.js            # dry-run
 *   CONFIRM=YES node server/scripts/fix_schedule_times.js # execute
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Schedule = require('../models/Schedule');

const CONFIRMED = process.env.CONFIRM === 'YES';

/**
 * Round a Date to the nearest minute.
 * 13:59:59.800 → 14:00:00.000
 * 14:00:00.200 → 14:00:00.000
 */
function roundToMinute(d) {
  const ms = d.getTime();
  return new Date(Math.round(ms / 60000) * 60000);
}

async function main() {
  console.log('═'.repeat(60));
  console.log('FIX SCHEDULE TIMES — Round to nearest minute');
  console.log('═'.repeat(60));
  console.log('Mode:', CONFIRMED ? '🔥 EXECUTE' : '🧪 DRY RUN');

  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI not set');
    process.exit(1);
  }
  await connectDB();

  const schedules = await Schedule.find({}, { startTime: 1, endTime: 1 }).lean();
  console.log(`\nTotal schedules: ${schedules.length}`);

  let needsFix = 0;
  const updates = [];

  for (const s of schedules) {
    const start = new Date(s.startTime);
    const end = new Date(s.endTime);
    const fixedStart = roundToMinute(start);
    const fixedEnd = roundToMinute(end);

    const startDrift = Math.abs(start.getTime() - fixedStart.getTime());
    const endDrift = Math.abs(end.getTime() - fixedEnd.getTime());

    if (startDrift > 0 || endDrift > 0) {
      needsFix++;
      updates.push({
        updateOne: {
          filter: { _id: s._id },
          update: { $set: { startTime: fixedStart, endTime: fixedEnd } },
        },
      });

      // Show first 10 examples
      if (needsFix <= 10) {
        console.log(`  ${s._id}: ${start.toISOString()} → ${fixedStart.toISOString()} (drift: ${startDrift}ms)`);
      }
    }
  }

  console.log(`\nSchedules needing fix: ${needsFix} / ${schedules.length}`);
  console.log(`Already correct: ${schedules.length - needsFix}`);

  if (needsFix === 0) {
    console.log('\n✅ All schedule times are already clean. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  if (!CONFIRMED) {
    console.log('\n🧪 DRY RUN — no changes made.');
    console.log('Re-run with: CONFIRM=YES node server/scripts/fix_schedule_times.js');
    await mongoose.disconnect();
    return;
  }

  // Execute bulk update
  const result = await Schedule.bulkWrite(updates, { ordered: false });
  console.log(`\n✅ Updated: ${result.modifiedCount} schedules`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
