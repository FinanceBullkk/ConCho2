#!/usr/bin/env node
/**
 * backfill-lastActiveAt.js — one-shot backfill for PERF-008.
 *
 * After audit PR H shipped, new attendance marks denormalise
 * User.lastActiveAt automatically. Users who haven't had a P/L mark
 * since the deploy will still have lastActiveAt:null.
 *
 * Run this ONCE post-deploy to seed the field from history:
 *   node server/scripts/backfill-lastActiveAt.js
 *
 * Idempotent: $max ensures repeat runs never move the value backwards.
 * Read-only on Attendance; only writes to User.lastActiveAt.
 */

require('dotenv').config();
const path = require('path');

// Re-use the same dangerous-script guard as other operator scripts.
const guard = require(path.join(__dirname, 'lib', 'dangerousScriptGuard'));
guard.requireProductionAck();

const mongoose = require('mongoose');

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const User = require('../models/User');
  const Attendance = require('../models/Attendance');

  console.log('Computing max startTime per user from Attendance + Schedule join...');
  const rows = await Attendance.aggregate([
    { $match: { status: { $in: ['P', 'L'] } } },
    {
      $lookup: {
        from: 'schedules',
        localField: 'scheduleId',
        foreignField: '_id',
        as: 'schedule',
      },
    },
    { $unwind: '$schedule' },
    { $group: { _id: '$userId', lastDate: { $max: '$schedule.startTime' } } },
  ]);

  console.log(`Found ${rows.length} user(s) with attendance history.`);

  if (rows.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const bulk = rows.map((r) => ({
    updateOne: {
      filter: { _id: r._id },
      update: { $max: { lastActiveAt: r.lastDate } },
    },
  }));

  const result = await User.bulkWrite(bulk);
  console.log(`✅ Updated ${result.modifiedCount} user(s). Matched ${result.matchedCount}.`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
