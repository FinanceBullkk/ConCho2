/**
 * Cleanup Script: Remove invalid attendance records
 * ─────────────────────────────────────────────────
 * Deletes attendance records that reference:
 *   1. Future schedules (sessions that haven't started yet)
 *   2. Non-existent schedules (orphaned records)
 *
 * Usage: node cleanup-future-attendance.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Attendance = require('./models/Attendance');
const Schedule = require('./models/Schedule');

const cleanup = async () => {
  try {
    await connectDB();
    console.log('\n🧹 Cleaning up invalid attendance records...\n');

    const now = new Date();

    // ── Step 1: Find all attendance records ───────────────
    const allRecords = await Attendance.find({}).lean();
    console.log(`📊 Total attendance records: ${allRecords.length}`);

    // ── Step 2: Get all schedule IDs that exist ───────────
    const allSchedules = await Schedule.find({}).select('_id startTime').lean();
    const scheduleMap = {};
    allSchedules.forEach(s => {
      scheduleMap[s._id.toString()] = s;
    });

    // ── Step 3: Identify records to delete ────────────────
    const orphanedIds = [];
    const futureIds = [];

    for (const record of allRecords) {
      const schedId = record.scheduleId.toString();
      const schedule = scheduleMap[schedId];

      if (!schedule) {
        // Schedule was deleted but attendance record remains
        orphanedIds.push(record._id);
      } else if (new Date(schedule.startTime) > now) {
        // Attendance for a session that hasn't happened yet
        futureIds.push(record._id);
      }
    }

    console.log(`🗑️  Orphaned records (no schedule): ${orphanedIds.length}`);
    console.log(`🔮 Future session records: ${futureIds.length}`);

    const toDelete = [...orphanedIds, ...futureIds];

    if (toDelete.length === 0) {
      console.log('\n✅ No invalid records found. Database is clean!');
    } else {
      const result = await Attendance.deleteMany({ _id: { $in: toDelete } });
      console.log(`\n✅ Deleted ${result.deletedCount} invalid attendance records.`);
    }

    // ── Summary ─────────────────────────────────────────
    const remaining = await Attendance.countDocuments();
    console.log(`📊 Remaining valid records: ${remaining}\n`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

cleanup();
