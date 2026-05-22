/**
 * Cleanup: Remove accidentally created EL008 Foundation and EL009 Business English
 * that were created during browser testing.
 *
 * Dry-run by default. Set CONFIRM_CLEANUP=YES to actually delete.
 *
 * Run: node server/scripts/cleanup_test_classes.js
 *      CONFIRM_CLEANUP=YES node server/scripts/cleanup_test_classes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Class = require('../models/Class');
const Schedule = require('../models/Schedule');

// Exact targets — must match both classCode AND courseName to avoid deleting legitimate classes.
const TARGETS = [
  { classCode: 'EL008', courseName: 'Foundation' },
  { classCode: 'EL009', courseName: 'Business English' },
];

const CONFIRMED = process.env.CONFIRM_CLEANUP === 'YES';

const run = async () => {
  await connectDB();
  console.log('Mode: ' + (CONFIRMED ? '🔥 EXECUTE' : '🧪 DRY RUN'));

  for (const { classCode, courseName } of TARGETS) {
    const cls = await Class.findOne({ classCode, courseName }).lean();
    if (!cls) {
      console.log(`  ℹ️  Not found: ${classCode} - ${courseName}`);
      continue;
    }

    const schedCount = await Schedule.countDocuments({ classId: cls._id });
    if (schedCount > 0) {
      console.log(`  ⚠️  Skipped: ${classCode} - ${courseName} (${schedCount} session(s) exist)`);
      continue;
    }

    if (CONFIRMED) {
      await Class.findByIdAndDelete(cls._id);
      console.log(`  🗑️  Removed: ${classCode} - ${courseName}`);
    } else {
      console.log(`  [dry-run] Would delete: ${classCode} - ${courseName} (0 sessions)`);
    }
  }

  await mongoose.disconnect();
  if (!CONFIRMED) console.log('\nRe-run with CONFIRM_CLEANUP=YES to apply.');
  console.log('✅ Done.');
};

run().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
